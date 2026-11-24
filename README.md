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

`pytest` without the emulator skips the 7 callable tests. `npm run test:functions`
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
2. Deploy `firestore.indexes.json` (the `farmMembers(uid,status)` lookup is on
   the hot path).
3. Deploy the five callables in `functions/main.py`.
4. Deploy the compatibility rules and hosting in the same window.

Do not deploy the new collections' rules before the backfill: groups,
inventory and target overrides require `farmMembers`.

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
  with pending skipped loads, so none are forgotten.
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
  `headCountSnapshot` is the day's confirmed feeding `animalCount` when one
  exists, otherwise the group head count. The trend is the last seven
  records. The milk price is per record, with a farm-level default at
  `farms/{farmId}.milkPricePerKg` that owner/admin can save from the page;
  fat/protein are stored but not used by flat-price IOFC.
- **Pre-deploy requirement:** the trigger failure queue/alert must exist
  before the trigger is deployed. The SDK cannot enable retry (0.6.0 stable and
  0.7.0rc0 both hardcode `retry=False`), so a transient failure otherwise
  loses the inventory posting silently.
- **Failure queue design:** `farms/{farmId}/feedingTriggerFailures/{feedingId}`
  holds the error, attempts and status; a scheduled function retries pending
  failures up to five times and marks dead; the loading sheet shows delayed/
  failed postings with a manual retry. This is a pre-deploy design, not just
  a phrase.
- **Deploy chain:** everything except the trigger **and the loading sheet**
  can ship first — feeds, recipes, targets, groups, inventory/ledger
  (manual), accuracy, IOFC and retroactive posting. The loading sheet is
  gated on the trigger and the queue; shipping it without them would show
  stale on-hand. The failure queue is deliberately ahead of the scenario
  increment.
