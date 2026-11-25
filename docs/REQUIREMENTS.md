# Milk Farm — requirements traceability

The client's requirements live in **`docs/ALIMENTAZIONE.xlsx`**: three ration
sheets (VACCHE DA LATTE, VACCHE ASCIUTTE, MANZE). Each sheet has an input block
(FORAGGI + CONCENTRATI) and an output block with two columns — *valori stimati
su s.s.* (what the ration currently delivers) and *valori ideali* (the target
range). There is no separate PDF or prose spec; the workbook is the contract.

This document maps every output the client expects to the code that produces
it, so the app can be checked against the spreadsheet row by row.

## How to verify

```bash
# Client calculation engine + targets (golden data from the workbook)
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  npx ng test --watch=false --browsers=ChromeHeadless

# Solver, export, and golden ration (Python)
cd functions && ./venv/bin/python -m pytest tests -q
```

Both suites regenerate their fixtures from `docs/ALIMENTAZIONE.xlsx` via
`scripts/parse-excel.cjs`, so the tests fail if the app drifts from the client's
numbers.

### Verification record — 2026-11-24

| Check | Command | Result |
|---|---|---|
| Type/build | `npx ng build` | pass |
| Solver + export + golden ration | `pytest tests -q` | 18 passed (the 10 callable/trigger tests skip without the emulator) |
| Callable + trigger logic | `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pytest tests/test_callables.py -q` | 30 passed — override set/clear, item upsert audit, delivery idempotency, negative-adjustment guard, missing-item guard, feeding confirmation (posted once, drafts ignored, untracked feeds skipped, overdraft flagged), retroactive posting, failure queue (claim/lock/resolve, three-dead bulk retry, dead audit, already-posted/written-off/missing/draft reasons, manual handled requires every item adjusted, manual write-off, acknowledge-no-action, adjustment-without-mark needs-review, 90-day write-off, cross-farm denial), farm milk price, scan heartbeat |
| Workbook → fixtures | `pytest tests/test_workbook_parity.py -q` | 10 passed — targets, analysis and commercial rows match the workbook |
| Browser-free calculator | `npm run check:calculator` | pass — reference ration, dry/heifer group totals, feeding guard |
| Client engine, loading, accuracy and IOFC (Karma) | `ng test --browsers=ChromeHeadlessNoSandbox` | 37 passed — 3 calculator parity + 6 loading math + 2 once-daily guard + 3 scan-health + 3 target safety + 1 loading role effect + 11 accuracy + 8 IOFC (3 math + 4 wiring + 1 save guard) |
| i18n keys | `npm run check:i18n` | 180 keys in both locales |
| Firestore rules | `firebase emulators:exec --only firestore "npm run test:rules"` | 18 passed — tenant boundary, strict cutover (legacy-only denied), registration order (farm before owner membership), owner self-create, denied writes, inactive membership, feeder draft/confirm, confirmed immutability, feeder-name permissions, operator-only feedings, milk-record roles, failure-queue read-only, heartbeat read/write |
| Membership backfill | `node scripts/seed-emulator-backfill.cjs` then `npm run backfill:members` | verified against a seeded emulator: dry-run `4 created / 1 unchanged` matched the real run; second run was `0 created / 5 unchanged`; an uncovered farm exited 1. Existing consultant roles were preserved, including a dual-role user (`farm-a` farmAdmin + `farm-b` consultant). **Not run against the target database** because deploy access is locked. |
| Full suite incl. callables | `npm run test:functions` | 50 passed with `REQUIRE_EMULATOR=1` (20 solver/parity + 30 callable/trigger/failure/retroactive) |

No deploy of rules, functions or hosting was performed; the verification above is local/emulator only. Karma now runs locally with the no-sandbox launcher and CI re-runs it on push (the earlier "next morning" note is superseded).

The callable integration tests caught a real defect: the clear-override path
required `minValue`/`maxValue`, so reverting an override failed validation.
`_validate_override` now requires at least one bound only when setting an
override; the clear path accepts the nutrient code alone.

The emulator backfill run caught two more: the script overwrote an existing
consultant membership with `farmAdmin`, and its dry-run double-counted owner
memberships. `mergeMember` now leaves existing roles/status untouched and each
membership is counted once; the seeded consultant survives with
`role=consultant`. `pytest` without the emulator still skips the callable
tests; `npm run test:functions` sets `REQUIRE_EMULATOR=1` so a missing
emulator fails instead of silently skipping.

The feeding trigger tests caught a real defect: two lines of the same feed
shared one item snapshot, so the second write overwrote the first with a stale
on-hand value (1000 became 950 instead of 850). The trigger now aggregates by
feed before updating; the two-line same-feed test depletes the full quantity
and posts two ledger entries.

## H. Feeding increment

The feeding document/trigger half is in place; the loading sheet is next.

- `farms/{farmId}/feedings/{feedingId}` is created as a draft and may be
  edited only while the stored status is draft. Confirmation is one client
  update; afterwards the document is immutable from the client.
- `FeedingLine.lineId` is a per-line UUID, not the feed id, because the same
  feed can appear twice in one load.
- The `on_feeding_confirmed` trigger re-reads the feeding inside a
  transaction, returns if `inventoryPostedAt` is already set, reads every
  per-line ledger doc before writing, aggregates consumption per feed, writes
  the ledger entries, then marks the feeding. Ledger ids are deterministic
  (`{farmId}_{feedingId}_{lineId}`), so a retry or a concurrent invocation
  cannot double-post.
- Untracked feeds are skipped and recorded in `inventorySkippedLines`; the
  rest of the load still posts. Every confirmation writes a `feeding.confirm`
  audit entry.
- The feeding rules allow owner/admin/consultant/feeder to create a draft and
  update a draft; confirmed documents are client-immutable; delete is
  owner/admin and draft-only.
- `FeedingService` in the client creates drafts, confirms them, and lists
  feedings by herd group.
- **Ledger identity is per line.** The ledger doc id is
  `{farmId}_{feedingId}_{lineId}`, and a two-line same-feed load writes two
  entries. "Aggregate per feed" refers only to the on-hand math: the trigger
  sums the line deltas so the second line cannot overwrite the first with a
  stale snapshot. Reconciliation and the accuracy report are per line.
- **Audit shape.** `feeding.confirm` carries
  `inventoryPosted: [{feedId, lineIds, deltaKgAsFed, onHandBeforeKgAsFed,
  onHandAfterKgAsFed}]`, `skipped: [{lineId, feedId, feedName}]` and
  `overdrawn: [{feedId, feedName, onHandKgAsFed, consumptionKgAsFed,
  resultingKgAsFed}]`. The audit is a per-feed summary (with its contributing
  `lineIds`); the ledger is per line, so an audit-to-ledger diff must expand
  the `lineIds`.
- **Loading sheet.** `/loading` selects a herd group and feeder, shows the
  called quantity (`recipe line x head count`) and the loaded quantity per
  line, and confirms the load. Warnings share one region: untracked feeds are
  informational; an overdraft requires an explicit **acknowledgment
  checkbox**, and the confirm button stays disabled until it is checked.
  Changing any loaded quantity resets the acknowledgment. The client warning
  uses the cached on-hand; the trigger is authoritative, so a delivery from
  another device can change the server-side result.
- **Overdrawn inventory display.** `getCover` clamps negative on-hand at
  0 days of cover and returns `level: 'overdrawn'` with the
  `shortfallKgAsFed`. The inventory page says "overdrawn by N kg — record a
  delivery" instead of showing a negative day count; the ledger keeps the
  true negative value.
- **Retry idempotence.** The trigger computes `inventoryOverdrawn` from the
  lines posted in the current transaction and overwrites the field; it never
  appends. A second invocation returns on the `inventoryPostedAt` guard. The
  overdraft test calls the trigger twice and asserts the same field, one
  ledger entry and one `feeding.confirm` audit. A partial write before
  `inventoryPostedAt` is not reachable because the ledger, on-hand and
  feeding updates share one transaction.
- **Retry-safe draft.** The loading sheet generates the feeding id client-side
  and `saveDraft` writes that same document. A failed confirmation can be
  retried, and a draft can be edited and re-saved, without creating a second
  draft. The recent list shows "posting…" until the trigger sets
  `inventoryPostedAt`.
- **Feeder identity.** Feeders are names in `farms/{farmId}/feeders`, not
  logins. `Feeding.feederId` points at that name; `Feeding.createdBy` records
  the logged-in operator who entered the load. The accuracy report will
  attribute by feeder name.
- **Snapshot semantics.** `animalCount` is captured from the group at confirm
  time; `feedName` in the feeding is denormalized and intentionally
  historical, so a later feed rename does not rewrite old loads.
- **Trigger retries.** Firestore retries a failing trigger; the
  `inventoryPostedAt` guard makes retries safe, and malformed/untracked lines
  are skipped rather than thrown. A persistently failing feeding is not
  dead-lettered yet; the loading sheet flips "posting…" to "posting delayed —
  check back" after 30 seconds, and a dead-letter/alert view is the proper
  fix when the report ships.
- **Accuracy report shape.** One CSV row per feeding line with
  `date, herdGroupId, feederId, feedId, calledKgAsFed, loadedKgAsFed,
  deviationPct, refusedKgAsFed`. The on-screen report aggregates; the CSV
  does not. The report is independent of inventory, so it can ship before
  retroactive posting if the scorecard is the nearer deadline.
- **Accuracy-report index.** `feedings(herdGroupId, createdAt)` covers the
  loading list. The report will need `feedings(feederId, date)`; add it when
  the report lands.
- **Orphan drafts.** Unconfirmed drafts are not cleaned up yet; a later
  increment should add a 30-day soft-delete or an admin cleanup action.
- **Concurrency primitive.** The ledger uses `transaction.set` with
  deterministic ids, not `create()`. Safety comes from the transaction: both
  concurrent invocations read the feeding inside their transaction, Firestore
  serializes them, the loser retries, sees `inventoryPostedAt`, and returns.
  Do not replace the transaction with a non-transactional create/set.
- **Deploy chain.** Deploy everything except the trigger **and the loading
  sheet**: feeds, recipes, targets, groups, inventory items/ledger (manual),
  accuracy, IOFC and retroactive posting. The loading sheet is gated on the
  trigger (inventory posting) and the failure queue (recovery path); shipping
  it without them would show stale on-hand and lying alerts. With the queue
  now implemented, the trigger + loading sheet + queue ship together after the
  target backfill. IOFC and the accuracy report are fully functional without
  the trigger. The failure queue was deliberately ahead of the scenario
  increment because the trigger must not ship without it.
- **Retry configuration.** PyPI shows `0.6.0` as the latest stable release
  and `0.7.0rc0` as a release candidate. Both hardcode `retry=False` in
  `FirestoreOptions._endpoint` (`0.7.0rc0` still constructs
  `EventTrigger(retry=False)`); the decorator cannot enable retry. Concrete
  paths: (a) prefer an application-level failure queue — wrap the trigger body
  in try/except, write `farms/{farmId}/feedingTriggerFailures/{feedingId}`
  with the error, and retry from a scheduled/admin action; (b) if using the
  deploy-level option, `gcloud functions deploy on_feeding_confirmed --gen2
  --retry ...` is a full redeploy with the complete source/trigger config, not
  a toggle. The `inventoryPostedAt` guard makes either path safe. **The
  failure queue is a pre-deploy requirement for the trigger, not a
  post-deploy nice-to-have:** without retry, a transient failure silently
  loses a feeding's inventory posting.

## I. Feeder accuracy report

The report is the first consumer of the ingestion/loading trail. Decisions:

- **Drafts excluded.** A draft is not a load.
- **Confirmed-but-posting included** with a `status` column
  (`posted` / `pending`). The load happened; inventory posting is an
  operations concern.
- **Corrections counted and flagged.** `correctsFeedingId` adds
  `isCorrection: true` to the CSV; both the original and the correction
  remain visible.
- **Anomaly columns.** `hasOverdrawn` and `hasSkipped` per row, so a clean
  deviation record with constant skipped lines is still visible.
- **CSV shape.** One row per feeding line:
  `date; herdGroupId; feederId; feedId; feedName; calledKgAsFed;
  loadedKgAsFed; deviationPct; refusedKgAsFed; status; isCorrection;
  hasOverdrawn; hasSkipped`. `;` delimiter, `,` decimal, UTF-8 BOM for
  Italian Excel. Booleans are `true`/`false`; dates are `YYYY-MM-DD` (text,
  not date-typed). The on-screen table aggregates; the CSV does not.
- **Window semantics.** The 7/28/90-day window filters the feeding's stored
  local calendar `date` (`YYYY-MM-DD`), not the UTC `createdAt`. The loading
  sheet writes the date with `localDateKey()` so a load at 23:30 local stays
  on that local day.
- **Definitions.** Worst ingredients = highest **cumulative** absolute
  deviation in kg (`Σ |loaded - called|`), so a feed off by a little on every
  load outranks a feed off by a lot once; ties by mean deviation, then
  alphabetical. Weekly trend = Monday-start weeks, mean absolute deviation
  per week. Both are in the column tooltips.
- **Refusal data errors.** A feeding whose refusals exceed its loaded quantity
  is a data error: its rows are excluded from the feeder's MAD, weighted
  deviation, intake efficiency and ingredient ranking, and counted in
  `dataErrorCount`. The CSV carries `hasRefusalError`. The UI shows the count
  in the anomalies column and flags the intake cell.
- **Intake efficiency.** The on-screen summary now shows
  `100 x (1 - refused / loaded)` alongside deviation; the CSV keeps the
  per-line refusal.
- **Access control.** Feeders are names, not logins: the loading sheet is
  operated by the owner, farm admin or consultant, and the `feedings` rules
  allow only those roles to read/write. A feeder-role account cannot read
  feedings at all, so it cannot see colleagues' loads through the collection;
  the accuracy page is restricted to owner/admin/consultant. If feeder logins
  become a product requirement, add an explicit `feederUid` to the feeding
  and scope on that. A server-side report callable is still the right
  consultant-scale path.
- **Intake divide-by-zero.** `loaded = 0` yields `intakeEfficiencyPct: null`
  (rendered `—`), consistent with `computeDeviationPct`.
- **Identical feeder names.** Feeder identity is a name; two people called
  "Marco" aggregate. The report is where that becomes visible; a true feeder
  account is the eventual fix.
- **Aggregation.** Per feeder (filterable by herd group and 7/28/90-day
  window): load count, line count, mean absolute deviation,
  load-weighted deviation (`sum |loaded - called| / sum called`), worst three
  ingredients, and a weekly trend.
- **Index.** `feedings(feederId, date)` is added with the report; the current
  screen loads the farm's feedings and filters client-side, but the index is
  in place for the eventual server-side range query.
- **Independence.** The report does not read inventory, so it can ship before
  retroactive posting if the pilot scorecard is the nearer deadline.

## J. Retroactive posting

Implemented as a separate, auditable action:

- **Queryable field.** The trigger writes `inventorySkippedFeedIds` alongside
  `inventorySkippedLines`; the retroactive scan uses
  `where inventorySkippedFeedIds array-contains feedId and status == confirmed`
  (composite index in `firestore.indexes.json`). This avoids the
  array-of-objects query problem.
- **Callable.** `post_skipped_consumption` is owner/admin only. For each
  feeding it reads the full line by `lineId`, posts `adjustment` ledger
  entries with `sourceType: 'retroactive'`, updates on-hand in the same
  transaction, removes the posted lines from `inventorySkippedLines` /
  `inventorySkippedFeedIds`, and writes `inventory.retroactive` audit entries
  with `sourceFeedingId` and `sourceLineId`.
- **Overdraft.** The `inventory.retroactive` audit carries the per-line
  `onHandBeforeKgAsFed`, `onHandAfterKgAsFed` and `overdrawn` boolean. The
  feeding's own `inventoryOverdrawn` stays empty: the shortfall belongs to
  the retroactive adjustment, not the original confirmation.
- **Duplicate feeds.** A feeding with two skipped lines for the same feed
  posts two per-line ledger entries and updates on-hand once with the
  aggregate; the test asserts `-20` and `-30` entries and on-hand `50`.
- **Dedup.** `inventorySkippedFeedIds` is a set; two skipped lines for one
  feed produce a single array element (tested).
- **Cleared audit.** Removing posted lines from `inventorySkippedLines` is
  itself audited as `feeding.skipped_cleared` with
  `clearedSkippedLineIds`, so the feeding mutation is not invisible.
- **Reconciliation scope.** Each feeding's on-hand update is inside its
  transaction. After all feedings, the callable recomputes the affected
  item's on-hand from its ledger as a separate best-effort correction; the
  nightly global reconciliation still runs and should agree. Both
  `consumption` and `adjustment` entries count as on-hand deltas.
- **Replay audit.** A replay returns `postedLines: 0, alreadyPosted: N` and
  writes no new `inventory.retroactive` or `feeding.skipped_cleared` entry;
  the test asserts the audit count is unchanged.
- **Dates and valuation.** Ledger entries carry the original feeding's local
  `date` and the feeding line's historical `costPerKgAsFed` (not the item's
  current replacement cost); their `createdAt` timestamp and the audit `at`
  reflect the retroactive moment.
- **Retry-safe.** Deterministic ledger ids mean a replay posts nothing twice;
  a second call returns `postedLines: 0, alreadyPosted: N`, so the operator
  sees why nothing changed.
- **UI.** The inventory page has a "Post skipped loads" action on the
  selected item and a banner listing every item with pending skipped loads
  (`inventorySkippedFeedIds`), so an operator cannot fix one of three and
  forget the rest. The callable reports how many lines it posted.
- **Deployable early, operational later.** Retroactive posting can be
  deployed before the trigger, but it only becomes useful after feedings have
  been confirmed and skipped; an empty state is expected.
- **Valuation vs accounting.** The ledger uses the feeding line's load-time
  `costPerKgAsFed`; that is not the farm's FIFO/weighted-average accounting
  cost, so reconciliation against farm accounting may differ by price drift.
  Both facts are on the ledger (`unitCostPerKgAsFed`).
- **Independent of the failure queue.** A feeding with skipped feeds and a
  dead inventory-posting failure has two different surfaces: "Post skipped
  loads" reconciles `inventorySkippedFeedIds`, while the queue retries the
  consumed lines. They do not block or double-count each other.

## J2. Solver contract

`optimize_ration` supports `mode: 'relaxed'` (default: minimise, soften and
flag unreachable targets) and `mode: 'strict'` (return `infeasible` rather
than soften, with `unreachableTargets`). The full reference target set is infeasible in strict mode; in
relaxed mode the 23.1 kg DM solution meets aNDF/ADF/uNDF floors and misses
only ADF/aNDF. The €9.885 workbook ration is the hand ration reproduced by
the parity test, not the cost minimum. Details and the fibre safety table are
in [`docs/SOLVER_SMOKE.md`](SOLVER_SMOKE.md). The targets screen warns when a
fibre target is set below the reference floor; the reason remains required
for the override.

## K. Trigger failure queue

Implemented; it is still a pre-deploy gate because the trigger and loading
sheet ship together.

- **Storage:** `farms/{farmId}/feedingTriggerFailures/{feedingId}` with
  `feedingId`, `farmId`, `error`, `attemptedAt`, `retryCount`,
  `lastRetryAt`, `status` (`pending` / `retrying` / `dead` / `resolved`),
  `lockedBy`, `lockedAt`, `deadAt`, `resolvedAt`, `resolvedBy`.
- **Writer:** `on_feeding_confirmed` wraps `_post_feeding_inventory`; on an
  exception it writes the failure document and re-raises so the invocation is
  logged. A success resolves any existing failure.
- **Retry policy:** a scheduled function every 5 minutes scans
  `collectionGroup('feedingTriggerFailures').where status in [pending,
  retrying]` (collection-group index on `status`), claims each document in a
  transaction (`pending` or stale `retrying` -> `retrying` with
  `lockedBy`/`lockedAt`), retries, then resolves or increments. Five
  attempts -> `dead` with a single `feeding.trigger_dead` audit. **The scan
  does not claim `dead`:** dead is terminal until the owner/admin manual retry
  moves it, so the 24-hour human-attention SLA is not superseded by automated
  retries. A claim older than 10 minutes is reclaimable, so a crashed scanner
  does not strand a document; a retry slower than 10 minutes can
  double-increment `retryCount`, but the `inventoryPostedAt` guard prevents
  double-posting (a 30-minute threshold would trade slower recovery for
  fewer double-increments).
- **Bulk retry:** owner/admin `retry_feeding_failures` callable retries all
  `pending`/`dead` failures for a farm; the loading sheet has "Retry all".
  The same callable/terminal state is used for manual retries.
- **Manual handling:** the `mark_feeding_failure_handled` callable accepts
  `resolution: manual-adjustment`, `write-off`, or `acknowledged-no-action`.
  - `manual-adjustment` requires an `adjustment` entry for **every** item in
    the feeding's lines, created after the failure; it refuses with the
    uncovered item ids otherwise. This closes the partial-coverage hole where
    one item's adjustment hid another item's missing 20 kg.
  - `write-off` books the same per-line `write_off` entries/on-hand/`writeOffAt`
    as abandonment, with `sourceType: 'manual-write-off'`, and resolves the
    row as `manual-write-off`. It is the correct action for a needs-review
    caused by an unrelated adjustment.
  - `acknowledged-no-action` is the explicit "no ledger entry is needed"
    decision, not "I could not write it off"; UI wording is "No ledger entry
    needed".
  All set `status: resolved` and audit `feeding.trigger_resolved` with the
  resolution as reason; a double-click returns `alreadyResolved: true`. A
  resolved document is skipped by the retry scan and abandonment.
- **Adjustment without Mark handled:** at 90 days the abandonment path
  queries the affected items for `adjustment` entries created **after**
  `failure.attemptedAt` (strictly greater). If one exists, it does **not**
  write off; it sets `status: needs-review`, `reviewReason:
  adjustment-detected`, audits `feeding.trigger_needs_review` with
  `detectedAdjustments` (`itemId`, `transactionId`, `deltaKgAsFed`,
  `createdAt`) and `expectedConsumption` (`lineId`, `feedId`, kg), and leaves
  the decision to a human. The scan does not auto-retry `needs-review`; a
  later adjustment does not auto-resolve it. The open-failures badge counts
  it indefinitely, which is the pressure to resolve it. A needs-review can be
  resolved with `manual-adjustment` (if every item is covered), `write-off`,
  or `acknowledged-no-action`.
- **Terminal state:** success sets `status: resolved`, `resolvedBy`,
  `resolvedAt`, clears the lock, and writes `feeding.trigger_resolved`;
  a manual retry of a dead document therefore stops showing as failed.
- **Retry outcomes:** `_post_feeding_inventory` returns distinct codes, and
  the retry maps them to `trigger_resolved.reason`: `posted` →
  `retry-succeeded`, `already-posted`, `written-off`, `missing` →
  `missing-feeding`, `not-confirmed`. Missing and draft feedings resolve the
  queue rather than going dead (nothing can be posted). The already-posted
  test asserts one ledger entry, one `feeding.confirm` audit, `retryCount`
  unchanged and the reason; a separate test covers written-off/missing/draft.
- **Alerting:** the loading sheet shows the open-failure count and a
  per-feeding "Not posted" badge; the inventory page shows the count with a
  link to the loading sheet. A `dead` document means "needs human attention
  within 24 hours"; email is out of scope for v1.
- **Retention and write-off:** resolved documents are retained (a 90-day TTL/
  cleanup is a follow-up). Dead documents older than 90 days are abandoned by
  the scheduled scan: per line it writes a `write_off` ledger entry
  (`sourceType: 'abandoned'`, `deltaKgAsFed = -loaded`, deterministic
  `..._{lineId}_writeoff` id), updates the item on-hand, sets `writeOffAt` on
  the feeding, deletes the failure document, and writes
  `feeding.trigger_abandoned` with the written-off lines/kg. The write-off is
  the accounting event, not just a note; the nightly reconciliation (planned)
  is a backstop, not the mechanism. `writeOffAt` also makes a later trigger or
  retry a no-op. Skipped `inventorySkippedFeedIds` lines are a separate
  surface and remain postable; abandonment only books the consumed lines.
- **Replay semantics:** every retry reuses `_post_feeding_inventory` and the
  `inventoryPostedAt` guard plus deterministic ledger ids, so a retry after a
  partial failure is idempotent.
- **Rules:** failure documents (including `needs-review`) are readable by
  owner/admin/consultant and client-write-denied. The rule ships with the
  trigger/loading-sheet batch; no extra rule is needed for `needs-review`.
- **Audit lifecycle:** the queue writes `feeding.trigger_dead`,
  `feeding.trigger_needs_review`, `feeding.trigger_resolved`,
  `feeding.trigger_abandoned` and the trigger's `feeding.confirm`; a
  consultant can reconstruct failure → escalation → resolution/abandonment
  from those five events.
- **UI:** the loading banner shows the total open count and the
  needs-review count separately; the row actions are Mark handled, Write off
  and No ledger entry needed. This rendering is UI-only (not separately
  spec'd); the state transitions are covered by pytest.
- **Production index dependency:** the scan uses collection-group equality
  queries on `status`; these require a `COLLECTION_GROUP_ASC` single-field
  index, configured via `fieldOverrides` (Firestore rejects it under
  `indexes`). The `(status, deadAt)` composite serves the abandonment query.
  Removing the single-field index broke the scheduler in production until the
  override was added; the scan is exercised in production.
- **i18n gate:** `check-i18n.cjs` now scans `src` for `| translate` and
  `translate.instant/get/stream` keys and fails when a used key is missing
  from either file. It found `IOFC.DEFAULT_SAVED`/`DEFAULT_FAILED` in addition
  to the two browser-smoke keys.
- **Region:** Firestore is `nam5` (US multi-region) while functions are
  `europe-west1`; the data-residency/GDPR decision is recorded in
  [`docs/REGION_DECISION.md`](REGION_DECISION.md): migrate to `europe-west1`
  before the first paying farm, with the current project design-partner only
  until then.
- **Strict cutover:** the legacy `users.farmId` fallback was removed after the
  production backfill; the rules test now asserts a legacy-only user is
  denied. The compatibility window is closed.
- **Scheduled deploy:** `scheduled_feeding_retry` uses the `*/5 * * * *`
  decorator; enable `cloudscheduler.googleapis.com` before
  `firebase deploy --only functions` or the schedule never runs. The dead
  abandonment query uses the collection-group `(status, deadAt)` index.

### Queue health

`scheduled_feeding_retry` writes `system/feedingRetryScan` (`lastRunAt`,
`lastRunStatus`, `docsScanned`, optional `error`) after every run. The loading
sheet reads it and warns if open failures exist and the heartbeat is older
than 15 minutes or the last status is `error`. A log-based Cloud Monitoring
alert on `scheduled-feeding-retry` severity >= ERROR is a required console
step ([`docs/OPERATIONS.md`](OPERATIONS.md)); it is not created by code.

## L. IOFC

The first Stage 2 item is in place:

- **Milk records** at `/farms/{farmId}/milkRecords/{groupId}_{date}`:
  whole-group daily `milkKg`, `milkPricePerKg`, optional fat/protein, and a
  `feedCostPerHeadSnapshot`. The local calendar date is the record key.
  Owner/admin/consultant can read/write; feeders cannot. The
  `milkRecords(herdGroupId, date)` index is in place.
- **Math** in `core/utils/iofc.ts`: revenue = `milkKg x price`; feed cost =
  `headCount x per-head recipe cost`; IOFC = revenue - feed cost; per-cow,
  milk-per-cow and feed-cost-per-kg derived. Zero milk yields a null
  feed-cost-per-kg (rendered as `—`), not infinity.
- **Acceptance:** 100 cows x 30 kg x EUR 0.50 = EUR 1,500 revenue; 100 x
  EUR 4.50 = EUR 450 feed; IOFC EUR 1,050/day, EUR 10.50/cow/day,
  EUR 0.15/kg feed cost. Covered by `iofc.spec.ts`.
- **No cost means n/a, not zero.** If the group has no active recipe and the
  selected date has no feed-cost snapshot, `result` is null and the page
  renders a n/a warning; a missing cost never produces a fictional IOFC.
- **Live vs snapshot.** A new date uses the active recipe's current per-head
  cost and the day's feeding `animalCount` when one exists; an existing milk
  record uses its own `feedCostPerHeadSnapshot` and `headCountSnapshot`, so
  historical IOFC does not move when the recipe or herd changes. A record
  with a missing snapshot renders `—` with an "incomplete snapshot" warning;
  there is **no** live fallback. A migration, if ever needed, must be an
  explicit, auditable backfill filtered to records before the migration date.
- **No record.** A date with no milk record and zero entered milk shows "no
  record for this date", not a zero-revenue/negative-IOFC day. Entering milk
  previews the result until saved.
- **Dashboard** at `/iofc`: group, date, group milk and price; cards for
  revenue, feed cost, IOFC/day, IOFC/cow, milk/cow and feed cost/kg; a
  seven-day trend from the stored records. Dry groups show IOFC as not
  applicable.
- **Milk price.** The price is per record, with a farm-level default at
  `farms/{farmId}.milkPricePerKg` loaded into the form; the owner/admin can
  save the current value as the default from the IOFC page. The save goes
  through the `set_farm_milk_price` callable and writes
  `farm.milk_price_changed` with before/after. `fatPct`/`proteinPct` are
  stored but not used by the flat-price IOFC, so no one assumes component
  pricing is wired.
- **Preview vs saved.** A new-date preview uses current data (the day's
  feeding average if confirmed, otherwise the group count). Saving locks the
  feeding snapshot when one exists. A record saved before the feeding is
  confirmed keeps `hasFeedingSnapshot: false`; the page also offers refresh
  when `feedingCountAtSnapshot` differs from the current confirmed-feeding
  count. Refresh is a direct milk-record update (`MilkService.saveRecord`) and
  is covered by the owner/admin/consultant update rule; no refresh callable
  exists. Tests cover the banner condition and a third feeding.
- **Farm-default reload.** Saving the farm milk price updates the open IOFC
  page's default but never overwrites a per-record price the user has typed;
  another browser session picks it up on the next mount.
- **Wiring test.** `iofc.component.spec.ts` uses a real group (headCount 100
  and 50) and a recipe cost of EUR 4.50, asserting feed cost 450 and 225, so
  the group/head-count/per-head wiring is tested, not just the arithmetic.
- **Still to do in Stage 2:** what-if scenarios, sensitivity at +/-5/10% for
  the top ingredients, saved scenario library, and the comparison export.
- **Attribution note.** Feeder-accuracy groups by `feederId`, a name chosen
  by the operator, not a measured identity; it measures the operator's record
  of the feeder's loading.

## A. Output metrics — lactating cows (VACCHE DA LATTE)

| # | Spreadsheet row | Ideal range | Computed by | Verdict |
|---|---|---|---|---|
| 1 | Kg tq in carro | — | `calculateRation().totalAsFed` | MET |
| 2 | Kg s.s | — | `calculateRation().totalDM` | MET |
| 3 | umidità % t.q. | 50–55 | `nutrients.umidita` | MET |
| 4 | proteina % s.s | 14,5–16,5 | `nutrients.proteina` + target | MET |
| 5 | ee % s.s | 4–5 | `nutrients.ee` | MET |
| 6 | amido % s.s | 22–28 | `nutrients.amido` | MET |
| 7 | zuccheri % s.s | 5–7 | `nutrients.zuccheri` | MET |
| 8 | ceneri % s.s | 7,5–8,5 | `nutrients.ceneri` | MET |
| 9 | a NDF om % s.s | 28–34 | `nutrients.aNDF` | MET |
| 10 | u NDF om % s.s | >9 <12 | `nutrients.uNDF` | MET |
| 11 | NFC % s.s | >38 <44 | derived: `100 − (proteina + ee + ceneri + aNDF)` | MET |
| 12 | ADF % s.s | 18–22 | `nutrients.ADF` | MET |
| 13 | ADL % s.s | <5 | `nutrients.ADL` | MET |
| 14 | pectine % s.s | >5 | derived: `NFC − amido − zuccheri` | MET |
| 15 | ADF/aNDF om | 60–65% | derived: `ADF / aNDF × 100` | MET |
| 16 | uNDF/aNDF om | 29–36,5% | derived: `uNDF / aNDF × 100` | MET |
| 17 | emicellulosa % s.s | >10 | derived: `aNDF − ADF` | MET |
| 18 | % foraggi su ss | 40–45 | `nutrients.foraggiPct` | MET |
| 19 | % concentrati su ss | 55–60 | `nutrients.concentratiPct` | MET |
| 20 | costo razione | — | `totalCost` | MET |
| 21 | app output (not in lactating sheet) | — | `costPerKg` (builder) / export row | MET (added 2026-11-24) |
| 22 | app output (not in lactating sheet) | — | `batchLoadAsFed` = per-head × `animalCount` | MET (added 2026-11-24) |

Rows 21–22 are **app outputs**, not rows printed by the lactating sheet. The
dry and heifer sheets do print `costo razione al Kg` and `Totale carico`; the
parity gate checks those per sheet rather than assuming one universal list.

**Kg s.s. precision.** The workbook's lactating `Kg s.s.` is **23.10246**; the
app reproduces **23.095** because the generated feed library rounds moisture
to one decimal before deriving the DM factor (`scripts/parse-excel.cjs`). The
parity gate tolerates this at **0.01 kg**; a four-decimal follow-up removes
the gap and tightens the gate to 0.001 kg. Do not call the DM total exact
until that follow-up lands.

## B. Dry cows (VACCHE ASCIUTTE)

| Ideal | Verdict |
|---|---|
| proteina 12% | MET |
| amido 11–12% | MET |
| a NDF >50% | MET |
| ADF >35% | MET |
| % foraggi >75% | MET |
| % concentrati <25% | MET |
| costo razione al Kg | MET |
| Totale carico (100 head → 1 990 kg) | MET — `animalCount` reproduces 1 990 kg and €217,60 |
| costo razione (group total) | MET |

## C. Heifers (MANZE)

| Ideal | Verdict |
|---|---|
| proteina 14–15% | MET |
| amido 12–15% | MET |
| a NDF >25% | MET |
| NFC 34–36% | MET |
| % foraggi >65% | MET |
| % concentrati <35% | MET |
| costo razione al Kg / Totale carico / costo razione | MET |

## D. Cross-cutting requirements

| Requirement | Where | Verdict |
|---|---|---|
| Three animal groups, each with its own targets | `TARGET_RANGES` in `initial-data.ts` | MET |
| Target values identical to the workbook's *valori ideali* | `TARGET_RANGES` vs sheet rows 46–67 | MET (spot-checked all 3 groups) |
| Traffic-light per nutrient (good / warning / danger) | `evaluateNutrientStatus`, builder nutrient bars | MET |
| Minimum-cost formulation honouring targets | `functions/solver.py` (PuLP, hard constraints) | MET — tested |
| Graceful answer when targets are unreachable | goal-programming fallback → status `relaxed`; the builder lists every out-of-range nutrient with its value and limit | MET — tested and shown in the UI |
| Excel export mirrors the workbook layout | `functions/main.py::build_recipe_workbook` | MET — FORAGGI/CONCENTRATI sections, totals, *valori stimati* vs *valori ideali* |
| Export carries per-head economics and group load | same | MET (added 2026-11-24, covered by `tests/test_export.py`) |
| Import of the farm's own workbook | `core/utils/feed-import.ts` | MET (added 2026-11-24) — reads sections, Italian headers, fractional percentages |
| Multi-tenant isolation between farms | `firestore.rules` | MET — rules key off the user's `farmId`; `farmId` immutable |
| Auth: login, register, password reset | `features/auth/*`, `auth.guard.ts` | MET |
| Italian + English UI | `assets/i18n/{it,en}.json` | MET |
| Per-farm feed library with availability toggle | `feeds/*`, `feed.service.ts` | MET |

## E. Defects found during the requirements audit (fixed)

The audit was not only a checklist: checking the workbook requirements exposed
six defects, four of them in the product itself. All are fixed and covered by
the build or the Python suite.

| Defect | Impact | Fix |
|---|---|---|
| `saveRecipe` only ever called `addDoc` | Editing a saved recipe silently created a **second** recipe instead of updating it | `RecipeService.updateRecipe()`; the builder branches on the loaded id |
| Saved recipe restored before the feed list arrived | Reopening a recipe could restore **no quantities** | `ngOnInit` loads the recipe after the first `getAvailableFeeds()` emission |
| Optimiser without a total-DM constraint | Cost minimisation returned a **~1 kg DM** ration (the smallest possible) | Builder requires a DM target (falls back to the on-screen ration); `solve_ration` now returns `error` without `totalDM` |
| Optimiser warnings never rendered | A `relaxed` result said "some targets are not met" but never said **which** | Builder lists every out-of-range nutrient with its value and limit |
| Feed/recipe update rules checked only the stored `farmId` | A write could **move** a record to another farm | `farmId` (and `farms.ownerUid`) immutable on update; delete kept separate |
| `firebase-service-account.json` untracked but not ignored | Credentials could be committed by accident | added to `.gitignore` |

## F. Open items for the client

1. **The reference lactating ration misses four of its own targets.** The
   workbook's *valori stimati* column shows uNDF 6,75 (ideal 9–12), ADF 14,98
   (ideal 18–22), ADF/aNDF 49,55 (ideal 60–65) and uNDF/aNDF 22,33
   (ideal 29–36,5). This is data, not a code defect: the app flags exactly
   those four rows red on the reference ration, and the solver reports them as
   `relaxed` when asked to hit them. Confirm whether the ideals come from a
   different feeding standard, or whether the forage analysis needs updating.
2. **Targets were global; the override layer is now in place.** The workbook
   ranges remain the immutable reference and `animalGroups/{id}/targets` stays
   read-only. A farm owner/admin can set a per-farm override at
   `farms/{farmId}/targetOverrides/{animalGroupId}` through a callable that
   stores the reason, author and timestamp and appends an audit entry. The
   builder and export show which nutrients use the farm's range.
3. **Herd size is now per herd group.** `farms/{farmId}/groups` carries the
   head count and the active recipe; `recipe.animalCount` remains the
   builder's batch default and is not used for group economics once a group is
   assigned.

## G. Parity chain

The parity gate has three independent parts; no part re-implements the
calculator:

1. **Regeneration.** `scripts/parse-excel.cjs` emits `initial-data.ts`,
   `golden-data.ts`, `targets.json` and `reference_rations.json` from
   `docs/ALIMENTAZIONE.xlsx`. CI runs the generator and fails on
   `git diff --exit-code`, so hand edits and workbook drift are caught.
2. **Workbook → fixtures.** `functions/tests/test_workbook_parity.py` opens
   the workbook directly with `openpyxl` and checks the generated targets,
   analysis and commercial rows against the sheet cells. It maps labels; it
   does not calculate a ration.
3. **Computed → fixtures.** `ration-calculator.service.spec.ts` computes the
   reference ration and checks it against `golden-data.ts` (17 codes within
   0.03 pp; totals within 0.01 kg / 0.001 €). `scripts/check-calculator.mts`
   runs the same numbers without Karma for the local and CI smoke gate.
