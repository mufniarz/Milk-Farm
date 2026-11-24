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
  The trigger records skipped feeds in `inventorySkippedLines` and overdrawn
  feeds in `inventoryOverdrawn` (with before/consumption/resulting kg); the
  recent-loads list shows both.
- The trigger posts the true negative on-hand value when a load exceeds
  stock, because the feed left the mixer. The ledger stays truthful and the
  feeding/audit carry the shortfall for the operator.
- The `feeding.confirm` audit is a per-feed summary with `lineIds`; the
  ledger is per line. An audit-to-ledger diff must expand `lineIds`.
- The feeding id is client-generated and `saveDraft` is idempotent, so a
  failed confirm can be retried without creating a duplicate draft. The
  recent list shows "posting…" until `inventoryPostedAt` is set.
- Feeders are names in `farms/{farmId}/feeders`, not logins. `feederId` is
  the name record; `createdBy` is the operator who entered the load.
