# MilkFarm

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 19.2.27.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Karma](https://karma-runner.github.io) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Project checks

```bash
npm run verify   # parser diff + calculator smoke + i18n + build
npx ng test --watch=false --browsers=ChromeHeadlessNoSandbox
cd functions && ./venv/bin/python -m pytest -q
# Full suite including the callable tests (needs the emulator):
npm run test:functions

# Backfill verification against the emulator:
node scripts/seed-emulator-backfill.cjs
npm run backfill:members -- --dry-run
npm run backfill:members
# Add --negative to the seed to exercise the non-zero exit path:
node scripts/seed-emulator-backfill.cjs --negative
npm run backfill:members
XDG_CONFIG_HOME=./.firebase-config FIREBASE_CLI_DISABLE_UPDATE_CHECK=true \
  npx firebase emulators:exec --only firestore --project demo-milk-farm "npm run test:rules"
```

`scripts/check-calculator.mts` is ESM TypeScript (`.mts`) because it runs
directly under Node's type stripping; keep the extension. `scripts/backfill-members.mts`
uses the same runner.

`pytest` without the emulator skips the 29 callable/trigger tests. `npm run test:functions`
runs the full suite through the emulator with `REQUIRE_EMULATOR=1`, so a missing
emulator fails instead of silently skipping. The parity chain
(workbook -> fixtures -> computed) is described in
[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).

## Before deploying

1. Run the membership backfill: `npm run backfill:members -- --dry-run`, then
   run it for real and confirm zero uncovered farms and zero users with a
   `farmId` but no active membership. The script is verified against a seeded
   emulator (dry-run matches the real run, the second run is a no-op, an
   uncovered farm exits 1), but **it has not been run against the target
   database**. Inspect the dry-run report before the real run, and confirm the
   two counts independently.
2. Deploy `firestore.indexes.json`. It includes the hot-path
   `farmMembers(uid,status)`, `feedings(inventorySkippedFeedIds,status)`,
   `milkRecords(herdGroupId,date)`, and the collection-group
   `feedingTriggerFailures(status)` index the scheduled retry needs.
3. Deploy the functions in `functions/main.py`: the nine callables
   (target overrides x2, inventory x3, retro posting, failure retry, manual
   handled, farm milk price), the `on_feeding_confirmed` trigger, and the
   `scheduled_feeding_retry` scheduled function. Enable
   `cloudscheduler.googleapis.com` first; the function uses the
   `*/5 * * * *` schedule decorator, and `firebase deploy --only functions`
   creates it. The failure-queue read rule ships in the same batch.
4. Deploy the compatibility rules and hosting in the same window.
5. Deploy the trigger and the loading sheet only with the failure queue in the
   same release; `dead` failures mean human attention within 24 hours.

Do not deploy the new collections' rules before the backfill: groups,
inventory, target overrides and milk records require `farmMembers`.

## Feeding ledger

- A feeding is a draft at `farms/{farmId}/feedings/{feedingId}` and is
  confirmed once. After confirmation the client cannot edit it; the
  `on_feeding_confirmed` trigger posts consumption and sets
  `inventoryPostedAt`.
- Ledger entries are **per line**: `{farmId}_{feedingId}_{lineId}`, so two
  lines of the same feed write two entries. The trigger's "aggregate per
  feed" step only sums the line deltas for the item's on-hand update; it does
  not collapse the ledger entries.
- The loading sheet at `/loading` warns before confirmation when a line's
  feed has no inventory item, and when the aggregate load exceeds on-hand.
  The overdraft warning requires an explicit acknowledgment checkbox; the
  confirm button stays disabled until it is checked, and editing a loaded
  quantity resets it. The client warning uses cached on-hand; the trigger is
  authoritative, so a delivery on another device can change the server-side
  result.
- The trigger posts the true negative on-hand value when a load exceeds
  stock, because the feed left the mixer. The ledger stays truthful, the
  feeding/audit carry the shortfall, and the inventory page labels the item
  "overdrawn by N kg" with 0 days of cover rather than a negative day count.
- `inventoryOverdrawn` is recomputed and overwritten, never appended; a
  retried trigger returns on `inventoryPostedAt`. The test calls the trigger
  twice and asserts one ledger entry, one audit entry and the same overdraft
  record.
- The `feeding.confirm` audit is a per-feed summary with `lineIds`; the
  ledger is per line. An audit-to-ledger diff must expand `lineIds`.
- The feeding id is client-generated and `saveDraft` is idempotent, so a
  failed confirm can be retried without creating a duplicate draft. The
  recent list shows "posting…" until `inventoryPostedAt` is set.
- Feeders are names in `farms/{farmId}/feeders`, not logins. `feederId` is
  the name record; `createdBy` is the operator who entered the load. The
  loading sheet is operated by owner/admin/consultant; a feeder-role account
  cannot read or write feedings. If feeder logins become a requirement, add
  an explicit `feederUid` and scope on it.
- The recent list shows "posting…" until the trigger sets
  `inventoryPostedAt`, then "posting delayed — check back" after 30 seconds;
  a dead-letter view is the next operational addition.
- Data errors (refusals greater than the loaded quantity) are excluded from
  the accuracy aggregate and counted per feeder; the CSV carries
  `hasRefusalError`.
- The accuracy report at `/accuracy` exports one row per feeding line
  (`date; herdGroupId; feederId; feedId; feedName; calledKgAsFed;
  loadedKgAsFed; deviationPct; refusedKgAsFed; status; isCorrection;
  hasOverdrawn; hasSkipped`) with `;` delimiter, `,` decimal and a UTF-8 BOM
  for Italian Excel. Drafts are excluded; confirmed-but-posting loads are
  included with `status=pending`; corrections and anomalies are flagged. The
  summary also shows intake efficiency (`1 - refused / loaded`), uses the
  local calendar `date` for the window, and defines worst ingredients by mean
  absolute deviation (ties alphabetical) and weeks as Monday-start.
- The report loads the farm's feedings and groups in memory; the
  `feedings(feederId, date)` index is reserved for the future per-feeder
  drill-down query. The feeder-role UI sees a restricted message, but the
  rules still allow member reads until a report callable exists.
- The ledger uses `transaction.set` with deterministic ids. Concurrent trigger
  invocations are serialized by the transaction; the loser retries, sees
  `inventoryPostedAt`, and returns. Do not replace this with a
  non-transactional write.
- PyPI shows `firebase-functions` 0.6.0 as the latest stable release;
  `0.7.0rc0` also hardcodes `retry=False` for Firestore triggers, so the
  decorator cannot enable retry. Prefer an application-level failure
  queue/alert; a `gcloud functions deploy --gen2 --retry` is a full redeploy,
  not a toggle. The `inventoryPostedAt` guard makes retry safe when enabled.
- Feeds that were loaded before they had an inventory item can be posted
  after the fact from the inventory page ("Post skipped loads"), which calls
  `post_skipped_consumption` and audits each line as `inventory.retroactive`
  with before/after and an `overdrawn` flag. The feeding mutation is audited
  as `feeding.skipped_cleared`; a second call returns `postedLines: 0,
  alreadyPosted: N`. Ledger entries carry the original feeding date and the
  line's historical `costPerKgAsFed`, while their timestamps reflect the
  retroactive moment. Duplicate skipped lines for one feed post per-line
  entries and update on-hand once. The inventory page also lists every item
  with pending skipped loads, so none are forgotten. The ledger's load-time
  cost is not the farm's FIFO/weighted-average accounting cost; reconciliation
  may differ by price drift.
- Feeder-role accounts read only their own feedings at the rules level
  (`createdBy == uid`), and the report UI is restricted to
  owner/admin/consultant; a server-side report callable is the consultant-scale
  path.
- IOFC lives at `/iofc`: milk records keyed by group and local date, feed
  cost from the active recipe, IOFC/day, per cow, milk per cow and feed cost
  per kg. Milk records are owner/admin/consultant only. Dry groups show IOFC
  as not applicable. With no recipe and no snapshot the page shows n/a, never
  a zero feed cost; a record with a missing snapshot shows "incomplete
  snapshot" rather than falling back to today's herd. The record's
  `headCountSnapshot` is the **average** of the day's confirmed feedings'
  `animalCount` (100 morning + 95 evening = 97.5), otherwise the group head
  count; an "awaiting feeding" warning shows when none is confirmed, a
  "refresh snapshot" action appears when a record saved before confirmation
  can now lock the feeding average, and zero head renders "0 head / IOFC not
  defined". The trend is the last seven records. The milk
  price is per record, with a farm-level default at
  `farms/{farmId}.milkPricePerKg` that owner/admin can save from the page
  (audited as `farm.milk_price_changed`); fat/protein are stored but not used
  by flat-price IOFC.
- **Pre-deploy requirement:** the trigger failure queue is implemented; the
  SDK cannot enable retry (0.6.0 stable and 0.7.0rc0 both hardcode
  `retry=False`), so the trigger, loading sheet and queue must ship together.
  A `dead` failure is a 24-hour human-attention SLA; dead documents are
  abandoned after 90 days with booked write-off lines and an audit, and
  resolved-document retention (90-day TTL/cleanup) is a follow-up. The
  scheduled function needs `cloudscheduler.googleapis.com` enabled and the
  `*/5 * * * *` schedule decorator; `firebase deploy --only functions`
  creates it. The collection-group scan returns only open failures, so its
  cost is bounded by open failures, not farms; a retry slower than the
  10-minute stale threshold can double-increment `retryCount` but cannot
  double-post (the `inventoryPostedAt`/`writeOffAt` guards).
- **Failure queue:** `farms/{farmId}/feedingTriggerFailures/{feedingId}`
  is written when `on_feeding_confirmed` fails. A scheduled function every
  five minutes claims **pending or stale retrying** documents in a
  transaction, retries up to five times, and marks `dead` with a single
  `feeding.trigger_dead` audit; `dead` is terminal for the scan and only a
  manual retry can move it. Owner/admin can retry all pending/dead failures
  from the loading sheet; success sets `resolved` and audits
  `feeding.trigger_resolved` (with `reason: already-posted` or
  `retry-succeeded`). A retry that finds `inventoryPostedAt` already set
  resolves without posting again. Dead documents older than 90 days are
  abandoned: a `write_off` ledger entry per line, on-hand update, `writeOffAt`
  on the feeding, and a `feeding.trigger_abandoned` audit — the write-off is
  booked, not just noted. Resolved retention is a follow-up. The loading sheet and inventory page show
  the open count, and the loading sheet has a per-feeding "Not posted" badge.
  Email is out of scope for v1; `dead` means "human attention within 24
  hours". `retryCount` counts failed attempts; `attemptedAt` is the first
  attempt, `lastRetryAt` the latest; a successful retry leaves `retryCount`
  unchanged. The failure-queue read rule ships with the trigger/loading-sheet
  batch.
- **Deploy chain:** everything except the trigger **and the loading sheet**
  can ship first — feeds, recipes, targets, groups, inventory/ledger
  (manual), accuracy, IOFC and retroactive posting. With the queue
  implemented, the trigger + loading sheet + queue ship together after the
  target backfill. IOFC and the accuracy report are fully functional without
  the trigger.

## Deployment record — 2026-11-25

Deployed to the production project `nicola-milk-farm` (the only Firebase
project configured; no staging project exists).

- **Membership backfill:** dry run reported `3 would be created, 0 unchanged`
  across 3 farms / 3 users; the real run created 3 memberships and verified
  every farm has an owner and every user an active membership.
- **Region:** Firestore `(default)` is in **`nam5` (US multi-region)**;
  Cloud Functions are in `europe-west1`. This is a data-residency mismatch
  for an Italian farm and a GDPR/DPA decision, not a code detail.
- **Indexes:** the first deploy removed `feedingTriggerFailures.status` as an
  "unnecessary" single-field index. That broke the scheduler in production:
  the collection-group equality/IN query requires a `COLLECTION_GROUP_ASC`
  index on `status`, which the `(status, deadAt)` composite alone does not
  serve. Fixed with a `fieldOverrides` entry enabling the collection-group
  single-field index and by changing the scan to two equality queries. The
  production scan was then exercised: a temporary pending failure transitioned
  `pending → retrying → resolved` (`resolvedBy` scheduled) and was cleaned up.
- **Functions:** 13 deployed — 11 callables plus `on_feeding_confirmed` and
  `scheduled_feeding_retry`. Callables: `set_target_override`,
  `clear_target_override`, `upsert_inventory_item`, `record_delivery`,
  `adjust_inventory`, `set_farm_milk_price`, `post_skipped_consumption`,
  `retry_feeding_failures`, `mark_feeding_failure_handled`, plus the existing
  `optimize_ration` and `export_recipe`. The first trigger create failed while
  the Eventarc service agent propagated; the scoped retry succeeded. Cloud
  Scheduler was enabled.
- **Rules and hosting:** the compatibility rules are released and
  `https://nicola-milk-farm.web.app` returns 200. The backfill condition was
  met, so the strict membership rules are live; no compatibility window
  remains.
- **Authenticated smoke:** a custom-token test user with an owner membership
  read the farm (200), created and confirmed a feeding (200), and the trigger
  posted 100 kg (on-hand 1000 → 900, one consumption ledger entry, no failure
  doc). A milk record write/read and a feeding read also returned 200. The
  test farm, feed, membership and user were deleted.
- **Not browser-tested:** the Angular loading/IOFC/accuracy screens and the
  actual queued-failure UI were exercised through the API/SDK, not a browser
  session.
- **No staging:** the mitigation is production-only: full local gate before
  every deploy, the authenticated smoke after every deploy, and a manual
  rollback of the previous functions/rules version. Creating
  `nicola-milk-farm-staging` is the recommended follow-up.
- **Deferred:** the four-decimal solver/fixture fix and the 90-day resolved
  TTL are not part of this deploy.
