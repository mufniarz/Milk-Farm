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
# Callable transaction tests need the emulator:
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
  ./venv/bin/python -m pytest tests/test_callables.py -q
FIREBASE_CLI_DISABLE_UPDATE_CHECK=true \
  npx firebase emulators:exec --only firestore --project demo-milk-farm "npm run test:rules"
```

`scripts/check-calculator.mts` is ESM TypeScript (`.mts`) because it runs
directly under Node's type stripping; keep the extension. The parity chain
(workbook -> fixtures -> computed) is described in
[`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).

## Before deploying

1. Run the membership backfill: `npm run backfill:members -- --dry-run`, then
   run it for real and confirm zero uncovered farms and zero users with a
   `farmId` but no active membership. **The backfill has not yet been executed
   against any dataset.** Inspect the dry-run report before the real run, and
   do not treat a zero exit as proof of coverage until the two counts are
   independently verified.
2. Deploy `firestore.indexes.json` (the `farmMembers(uid,status)` lookup is on
   the hot path).
3. Deploy the five callables in `functions/main.py`.
4. Deploy the compatibility rules and hosting in the same window.

Do not deploy the new collections' rules before the backfill: groups,
inventory and target overrides require `farmMembers`.
