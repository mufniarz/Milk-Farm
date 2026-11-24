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
