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
| Solver + export + golden ration | `pytest tests -q` | 18 passed (the 7 callable tests skip without the emulator) |
| Callable transaction logic | `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 pytest tests/test_callables.py -q` | 7 passed — override set/clear, item upsert audit, delivery idempotency, negative-adjustment guard, missing-item guard |
| Workbook → fixtures | `pytest tests/test_workbook_parity.py -q` | 10 passed — targets, analysis and commercial rows match the workbook |
| Browser-free calculator | `npm run check:calculator` | pass — reference ration, dry/heifer group totals, feeding guard |
| Client engine vs workbook (Karma) | `ng test --browsers=ChromeHeadlessNoSandbox` | 3 passed — 17 codes at 0.03 pp, totals at 0.01 kg / 0.001 €, moisture/forage |
| i18n keys | `npm run check:i18n` | 180 keys in both locales |
| Firestore rules | `firebase emulators:exec --only firestore "npm run test:rules"` | 9 passed — tenant boundary, legacy fallback, owner self-create, denied writes, inactive membership |
| Membership backfill | `npm run backfill:members` | implemented and idempotent; **not run against the target database** because deploy access is locked. Run the dry-run, then the real run, and confirm zero uncovered farms/users before deploying compatibility rules. |

No deploy of rules, functions or hosting was performed; the verification above is local/emulator only. Karma now runs locally with the no-sandbox launcher and CI re-runs it on push (the earlier "next morning" note is superseded).

The callable integration tests caught a real defect: the clear-override path
required `minValue`/`maxValue`, so reverting an override failed validation.
`_validate_override` now requires at least one bound only when setting an
override; the clear path accepts the nutrient code alone.

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
