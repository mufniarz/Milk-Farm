> **STATUS: four contract decisions are PENDING SIGN-OFF.**
> `NA()` semantics (error vs string, including the all-NA strict row) and
> Sensibilità width (15 data + `Scenario` = 16 total) are not signed.
> Scenari code is blocked until a product owner is assigned and all four are
> recorded here. **Fallback (2026-12-04): Fallback B — current shipped
> behavior**, per decision:
> 1. `NA()` = Excel error `=NA()`, all-NA strict row;
> 2. Sensibilità = 15 data columns + `Scenario` = **16 total**;
> 3. cross-sheet = **no** propagation (Scenari computes independently);
> 4. `at_boundary` = warnings-only, never in `unreachableTargets`.
>
> **Four-decimal re-pin procedure (engineering):** fix moisture precision →
> regenerate `boundary-cases.json` and `scenario-parity-cases.json` → both
> parity tests and `check:calculator` pass → record old/new pinned values and
> delta → re-pin within solver tolerance ε (CBC default) → deploy.
> Engineering sign-off for re-pin; product sign-off only if a target
> changes. The proposed 25-column shape below is not a contract change.

# Comparison export — format and semantics

## Scope: two sheets, two questions

- **`Confronto`** — solver comparison: one row per answer (`workbook`,
  `relaxed-solver`, `strict-solver`), metrics as columns.
- **`Scenari`** — scenario comparison: one row per scenario, with base,
  scenario and delta columns (the original `export_comparison` shape).

They are separate sheets because they answer different questions ("which
answer is right?" vs "what if I change this?"). `Confronto` does not carry
scenario rows and `Scenari` does not carry solver-mode rows.

## `Confronto` format

- Rows: `workbook`, `relaxed-solver`, `strict-solver`.
- Workbook row: `status: hand-ration`; `warnings` and `unreachableTargets`
  computed against the **ideals for the animal group matching the ration's
  sheet** (lactating, dry, heifer), using the **same classification rules**
  as the solver rows (`below_min`/`above_max`/`at_boundary` within
  `BOUNDARY_EPS`). The workbook row is specified-not-implemented until the
  export is built.
- Relaxed row: `warnings` = all three; `unreachableTargets` = violation
  subset only (`ADF/aNDF`).
- Strict row: `status: infeasible`; `totalAsFed`, `totalDM`, `totalCost` and
  all nutrient cells are **`NA()`** (`#N/A`), never 0; diagnostics populated.
- `diagnostics_from` disambiguates whose ration the warnings describe:
  `workbook`, `self` (relaxed), `relaxed-fallback` (strict). The strict row's
  warnings are about the relaxed diagnostic ration, not a strict ration.

### Columns

1. `source`
2. `status` (`hand-ration`, `optimal`, `relaxed`, `infeasible`)
3. `diagnostics_from` (`workbook`, `self`, `relaxed-fallback`)
4. `totalAsFed`
5. `totalDM`
6. `totalCost`
7-23. the 17 nutrient analysis columns (`umidita`, `proteina`, `ee`,
   `amido`, `zuccheri`, `ceneri`, `aNDF`, `uNDF`, `NFC`, `ADF`, `ADL`,
   `pectine`, `ADF_aNDF`, `uNDF_aNDF`, `emicellulosa`, `foraggiPct`,
   `concentratiPct`)
24. `warnings`
25. `unreachableTargets`

### Diagnostics cell format

Each warning is one line inside the cell:

```
code|value|min|max|issue|boundary
```

- `issue`: `below_min`, `above_max`, or `at_boundary`.
- `boundary`: `min`/`max` for `at_boundary`; **empty string** (not
  `undefined`/`null`) for below/above, with a trailing pipe
  (`code|value|min|max|issue|`) so the parser is positional.
- Sort: by `code`, ascending; one tuple per line inside the cell. It is not a distance and not redundant:
  `at_boundary` alone does not say which side. Do not add a distance field
  unless the sheet needs sorting by closeness.
- Multiple warnings: one per line. The range is inline so the consultant does
  not need a second document. UI labels (`at the reference floor`, …) are
  UI-only; the export stays filterable.
- `unreachableTargets` uses the same tuple format and contains only
  `below_min`/`above_max` entries.

### Localisation and headers

The v1 export is **Italian-only**. Strings live in the Python export function,
not in Angular i18n; an English export is a refactor, not a config switch.

| Column | Header |
|---|---|
| source | Fonte |
| status | Stato |
| diagnostics_from | Diagnostica da |
| computed_at | Calcolato il |
| scenario_cost_saved | Costo salvato |
| saved_at | Salvato il |
| diverged | Variato |
| totalAsFed | Totale tal quale |
| totalDM | SS totali |
| totalCost | Costo |
| nutrients | nutrient label |
| warnings / Avvisi | Avvisi |
| unreachableTargets | Obiettivi non raggiungibili |

### Cell formats

- Cost: `€ #,##0.000` → `€ 9,373` under `it-IT`; the format code uses
  en-US separators and Excel renders it per locale. Do not rewrite it to
  `€ #.##0,000`.
- Totals: `0.000` for `totalAsFed` **and** `totalDM`; cost `€ #,##0.000`;
  nutrients `0.00`.
- Infeasible numeric cells: `NA()` / `#N/A`, not `—` text. Excel and
  LibreOffice exclude `#N/A` from sums/pivots; a text dash pollutes them.
  The human-readable “—” belongs in the UI, not the sheet.

### Workbook DM footnote

Workbook row shows the app's calculation, **23.095**, while the workbook
publishes **23.10246**; the 0.007 difference is feed-data rounding. Footnote
on `Confronto`:

> *Valore calcolato dall'app; il workbook riporta 23,10246 kg SS. Differenza
> dovuta agli arrotondamenti dei dati alimenti (vedi REQUIREMENTS.md).*

Sequence: build on 0.01 with the footnote; land the four-decimal fix before
the export is used in a client conversation; regenerate the fixture. After the
fix, the row shows 23.10246 and the footnote is **removed** (a footnote
explaining a zero difference is noise).

## `Scenari` format

### Shape

**One row per scenario**, metrics as columns — the same orientation as
`Confronto`. It scales to 20 scenarios and filters like a table; the
transposed "metrics as rows" shape is rejected because it becomes unreadable
past a handful of scenarios.

The export takes an explicit `scenarioIds` list (or a date-range selection)
with a **maximum of 20**; it never silently caps. The sheet header names the
selected range and count.

**One base per export.** All selected scenarios must share the **triple**
`(baseSource, baseRecipeId, baseHash)`; the export refuses a mixed selection
with a clear message. Saved-recipe scenarios use `baseHash: null`; builder
snapshots use the server hash, so two different builder moments are not
silently combined. Checking only `baseSource` is insufficient.

**`baseHash` normalization:** drop lines with `kgAsFed <= 0`; round to 3
decimals; render integral values without `.0`; sort by `feedId` ascending;
serialize as compact JSON; SHA-256. The
`scenario-base-hash-cases.json` fixture is asserted by TS and Python, so the
two produce the same hash for the same builder state.

### Base

`Scenari` compares against **the saved recipe the scenarios were created
from**, not the workbook. `baseSource` is `saved-recipe` or `builder`; a
scenario captured from the builder carries `baseRecipeId: null` and its
server `baseHash`. `workbook` was removed as a scenario base: it is not
implemented and would be a trap for callers.

### `changes` schema

A scenario is `{ feedPrices?, inclusions?, targetOverrides? }`. Until the
scenario change editor lands, the builder button is labelled **“Save current
ration”** and saves `changes: {}`; its `Scenari` row has zero deltas by
design (a saved base, not a what-if).

- **feedPrices** — recompute with modified prices; cost changes, nutrient
  values do not.
- **inclusions** — modify recipe line quantities; both nutrients and cost
  change.
- **targetOverrides** — the ration is unchanged, so value deltas are **0**;
  only compliance status changes. This is why `Scenari` carries `Avvisi` and
  status columns, not only deltas. A target with both bounds null removes the
  constraint and evaluates `met`.

`applyScenario` returns **`status: computed | infeasible`**, not the solver's
`optimal`/`relaxed`; empty changes reproduce the same values and `computed`
status. `infeasible` means the base cannot be evaluated (missing feed,
invalid line, or zero total DM). A computed ration with unreachable targets
is `computed` with warnings, not `infeasible`. The `Stato` column in
`Scenari` uses these values.

### Columns

- `scenario`, `base_source` (header `Base di confronto`), `status`,
  `diagnostics_from`, `computed_at`, `diverged`; `Fonte` is a
  `Confronto`-only column (workbook/relaxed/strict) and is not present in
  `Scenari`;
- `lines` sort by `feedId` ascending in both TS and Python, pinned by the
  parity fixture;
- `scenario_cost_saved`, `saved_at` — the stored snapshot's cost and save
  time, so a recompute that differs from what the farm saw is readable;
  `NA()` when the snapshot is absent. A `diverged` boolean is true when any
  recomputed value differs from the stored snapshot beyond tolerance, so the
  reader knows to check the scenario screen rather than only cost;
- `base_cost`, `scenario_cost`, `delta_cost`; `scenario_cost_saved`,
  `saved_at`;
- `base_DM`, `scenario_DM`, `delta_DM`;
- for each nutrient selected in the export: `base_<nutrient>`,
  `scenario_<nutrient>`, `delta_<nutrient>`;
- `warnings` (`Avvisi`) — the same `code|value|min|max|issue|boundary`
  tuples as `Confronto`, computed against the **scenario's effective
  targets**, covering all 17 nutrients, not only fibre;
- for the fibre class as a convenience: `base_status_<nutrient>`,
  `scenario_status_<nutrient>` with
  `met` / `below_min` / `above_max` / `at_boundary`. The `Avvisi` column is
  the self-contained answer for every nutrient; the status pair is a quick
  safety read. Status values come from `applyScenario`; the export does not
  reclassify.

`base_status_<nutrient>` is the **base value against the base's targets**;
`scenario_status_<nutrient>` is the **scenario value against the scenario's
effective targets** (base + `targetOverrides`). This is what makes an
override scenario visible when its value deltas are zero.

The export **recomputes server-side** from saved `changes` + current base
with the Python `apply_scenario` (`functions/scenario.py`). It shows **current
truth**: current feed prices, current availability and current target
overrides. If the farm's overrides changed since the scenario was saved, the
exported ration reflects the current overrides and `diverged` is true;
`saved_at` and the stored snapshot remain the audit record. `diverged` also includes warnings; a code deploy that changes workbook ideals
can therefore flip it for untouched scenarios—the export is still current
truth, the snapshot is still the audit. A builder snapshot's base is its
stored `baseLines`, so a later recipe edit does not flip it; saved-recipe
scenarios compare against the current recipe, as before. `diverged` also
covers `lines`, so a feed price change is visible even when totals coincide. The server runtime
stays Python: no second functions runtime. The TS `applyScenario` is the
client preview and is pinned to the Python implementation by the shared value
fixture. The export formatter reads the server recompute; a stale browser
cannot export stale numbers.
`computed_at` is **server time** (ISO 8601 UTC). `scenario_cost_saved`,
`saved_at` and `diverged` come from comparing against the stored
`resultSnapshot`; `saved_at` is server time because the save callable writes
the snapshot. `diverged` uses a relative tolerance of **0.1% of the saved
value with a 0.001 absolute floor** (`abs(diff) > max(0.001, 0.001 *
abs(saved))`); it compares values, compliance statuses and warnings, so a
boundary crossing or a warning change also sets it. `Sensibilità` runs on the **server-recomputed** snapshot, not the stored one;
the export callable recomputes first, then calls the pure sensitivity
function. Stored snapshots are audit records only.

**Classification parity:** the TS `applyScenario` and Python
`apply_scenario` both use the shared boundary fixture
(`src/assets/boundary-cases.json`). The **value parity** fixture
(`scenario-parity-cases.json`) runs the base plus eight change cases through
both implementations and asserts DM, as-fed, cost, compliance and warning
codes. Changing either implementation without the other fails Karma or
pytest. The server runtime is Python; the TS implementation is the client
preview.

Deltas are **scenario − base**; a cheaper scenario has a negative
`delta_cost`. A header note states this. `computed_at`/`saved_at` are ISO
8601 UTC (`…Z`), not browser-local time.

An infeasible scenario is `NA()` in every numeric cell, with
`status: infeasible` and `diagnostics_from: self`; never 0 or `—` text.

### Italian headers

| Column | Header |
|---|---|
| scenario | Scenario |
| base_source | Base di confronto |
| status | Stato |
| diagnostics_from | Diagnostica da |
| computed_at | Calcolato il |
| scenario_cost_saved | Costo salvato |
| saved_at | Salvato il |
| diverged | Variato |
| base_cost / scenario_cost / delta_cost | Costo base / Costo scenario / Delta costo |
| base_DM / scenario_DM / delta_DM | SS base / SS scenario / Delta SS |
| base_<nutrient> / scenario_<nutrient> / delta_<nutrient> | nutrient label + Base/Scenario/Delta |
| warnings | Avvisi |
| base_status_<nutrient> / scenario_status_<nutrient> | nutrient label + Stato base/Stato scenario |

### Sensitivity

Sensitivity is **per scenario** and lives in a third sheet, `Sensibilità`:
one row per scenario, **15 columns**: `feed_top1`, four delta columns
(`+5%`, `−5%`, `+10%`, `−10%`), then `feed_top2` + four, `feed_top3` + four.
The feed-id columns make each row self-describing even when the top 3 differ
between scenarios. Fewer than 3 feeds → the missing slot and its four deltas
are `NA()`. Rows-per-shock is rejected for readability.

- **Input:** the server `ScenarioSnapshot` (same recompute as `Scenari`),
  including its `lines` array `{feedId, kgAsFed, unitCostPerKgAsFed}`; not
  the saved snapshot or the client payload.
- **Ranking:** per scenario, `unitCostPerKgAsFed × kgAsFed` summed per feed,
  descending; ties by `feedId` alphabetically, take 3.
- **Shock:** ±5%/±10% on **exactly one** of the top-3 ingredients at a time,
  quantity fixed, other two at their scenario values (tornado analysis, not
  combinations); the delta is `newCost − scenarioCost`.
- **Output:** 12 `delta_cost` values per scenario; infeasible scenarios are
  `NA()`.
- Only saved scenarios; the builder's unsaved state is not exported. The pure
  function is `topThreeByCostContribution`; price shocks are price-only, not
  inclusion.
- **Infeasible input** returns `{ deltas: [null × 12], ranking: [] }`; it does
  not throw and does not block the rest of the workbook.
- One or two feeds: `feed_top1` populated, missing slots and their four
  deltas `NA()`.
- `deltaCost = newCost − scenarioCost`; a +5% shock is positive.
- Ranking is per scenario (its `lines`), descending, ties by `feedId`.
- `diverged` uses strict `>`; exactly at the threshold is `false`. When
  `diverged = false`, `computed_at` is informational; values equal the saved
  snapshot.
- Four-decimal sequence: fix → regenerate `boundary-cases.json` → regenerate
  `scenario-parity-cases.json` → both parities pass → deploy.

## `export_comparison` signature

`export_comparison(baseSource?, baseRecipeId?, scenarioIds?)` returns one
XLSX with `Confronto`, `Scenari` and `Sensibilità`.

- Empty/omitted `scenarioIds` → `Confronto` only; `baseSource`/`baseRecipeId`
  are ignored and may be omitted.
- Non-empty `scenarioIds` → both base parameters are required, otherwise
  `missing_base_for_scenarios`; `scenarioIds.length > 20` → `too_many_scenarios`
  (client also caps at 20).
- `Confronto` always has workbook + relaxed + strict; there is no `mode`.
- Scenarios are always `computed`; `Sensibilità` is always included when at
  least one scenario is present.
- The callable re-checks that every selected scenario has the same
  `(baseSource, baseRecipeId)` and that none is soft-deleted; mismatch →
  `mixed_base`, deleted → `scenario_deleted`.
- Returns a signed Storage URL, same pattern as `export_recipe`.

## Persistence test scope (next round)

The persistence round's +N is these seven tests (five callable tests were in;
three more—idempotent delete, bad name, invalid bounds—are now in; the two
export tests land with `export_comparison`):

1. save rejects an override key not in the farm's current overrides
   (`invalid_override`);
2. save rejects an inclusion/price key not in the base's line list
   (`unknown_feed`);
3. save returns `{scenarioId, snapshot, serverTime}` and writes `savedAt` from
   server time, not the payload;
4. save ignores a client-supplied snapshot; the server snapshot is canonical;
5. delete sets `deletedAt`, hides the row, and the export rejects it;
6. delete is denied for feeder and allowed for owner/admin;
7. export rejects mixed-base and deleted selections with `mixed_base` /
   `scenario_deleted`.

## Build acceptance tests

The first build must assert:

1. workbook row `status = hand-ration`;
2. workbook row `diagnostics_from = workbook`;
3. reference lactating workbook row lists exactly the four misses (uNDF,
   ADF, ADF/aNDF, uNDF/aNDF);
4. relaxed row `diagnostics_from = self`, `unreachableTargets` = ADF/aNDF;
5. strict row `diagnostics_from = relaxed-fallback`;
6. strict row numeric cells are `NA()` (`#N/A`), not 0 or text `—`;
7. Italian headers render;
8. `Scenari` base + scenario + delta arithmetic, including the override
   case (zero value deltas, changed compliance status).

### Stage 2 scenario/sensitivity test scope

- price change: cost changes, nutrient values unchanged;
- inclusion change: nutrients and cost change; `inclusions` is replacement,
  zero removes the line;
- target override: values unchanged, compliance status changes; both-null
  removes the constraint;
- empty `changes` reproduces the base;
- combined changes compose (price + inclusion + override);
- unknown feed ids in `feedPrices`/`inclusions` are ignored;
- base recipe `updatedAt`/data unchanged by applying a scenario;
- save/replay round-trip returns the same `resultSnapshot`;
- export accepts only one `(baseSource, baseRecipeId)` pair;
- save rejects a `targetOverrides` key not in the farm's current overrides and
  an `inclusions`/`feedPrices` key not in the base's line list;
- save validates name and `scenarioId`; always inserts, never updates;
- `delete_scenario` soft-deletes (owner/admin only);
- the server recompute, not the client payload, writes the audit snapshot;
- rules: owner/admin/consultant read, client writes denied, all writes via
  the callable; feeder denied;
- `save_scenario` accepts **one** scenario, client-generated UUID, returns
  `{ scenarioId, snapshot, serverTime }` and errors
  `{ code, detail }` (`invalid_override`, `unknown_feed`, `mixed_base`, ...);
- UI: builder creates; `/scenarios` lists all farm scenarios, sorted by
  `createdAt` (single-field auto-index; no composite entry), most recent 50
  with pagination deferred; export selects from the page;
- `/scenarios` row: name, base, `savedAt`, `Stato`, `scenario_cost`,
  `diverged`, checkbox, action menu (load into builder, delete);
- `scenario` name: required, trimmed, non-empty, ≤ 100 chars, no `/`;
  default `<base name> — <date/time>`;
- **always-new save**: `save_scenario` never edits an existing scenario; a
  changed what-if is saved as a new one (the audit stays simple);
- **soft delete, no restore**: `delete_scenario` (owner/admin) sets
  `deletedAt` explicitly to `null` on create and a server timestamp on delete;
  a second delete returns `{ alreadyDeleted: true }` without overwriting the
  timestamp; `/scenarios` hides deleted rows; exports reject selected
  deleted rows with `scenario_deleted` and the detail “Deleted scenarios
  cannot be re-exported; the previously exported workbook is the record”; the
  UI states deletion cannot be undone. The export selector refreshes on open,
  hides deleted rows, and offers a one-click removal for a stale selection;
- builder flow: **backend supports it** — `baseSource: 'builder'` carries
  `baseLines` (feedId, kgAsFed); the server validates feeds, farm ownership
  and positive DM, then stores `baseLines` + a server-computed `baseHash`
  (SHA-256 of normalized lines). The builder toolbar/load UI is next; no
  recipe-save prerequisite;
  “Load into builder” shows “Saving creates a new scenario; the loaded one is
  preserved,” and asks before discarding unsaved changes;
- the server snapshot is canonical; `save_scenario` returns it and the client
  replaces its preview, showing a generic “the saved snapshot differs from
  your preview” toast if it differed;
- changes scope: `inclusions`/`feedPrices` only for feeds in the base’s line
  list; `targetOverrides` only for the farm’s current override keys;
- the server recompute, not the client payload, writes `savedAt` and the
  audit snapshot;
- `savedAt` is server time, never the payload;
- base recipe deleted: scenarios remain, replay returns
  `status: infeasible`, `reason: base-deleted`; export row is `NA()` with a
  note;
- feed removed: existing scenarios replay with the feed ignored and
  `diverged = true`; new saves with that feed are rejected;
- target override removed: existing scenarios replay against the saved
  scenario overrides (audit) and the server recompute uses the current
  overrides; `diverged` exposes the difference; new saves validate against
  the current overrides;
- `save_scenario` is a Python callable (owner/admin/consultant), not a
  client write; `export_comparison` stays Python;
- scenarios rules: owner/admin/consultant read/write, feeder denied; rules
  test 18 → 19 ("scenario read denied for feeder; admin write allowed").
- sensitivity: top-3 ordering, ties, ±5/±10% **price**, per-scenario ranking,
  base unchanged, infeasible scenario `NA()`.

`applyScenario` keeps `now` as its only impure input (it writes `computedAt`);
no other time read or effective-date logic is inside it. Warnings are sorted
by code for deterministic snapshots.

## Gate

Do not use the export in a client conversation until:

1. the `it-IT` XLSX visual check passes (number formats, `€` cells, Italian
   headers) — distinct from the accuracy CSV check;
2. strict returns both `unreachableTargets` and `warnings` (done);
3. boundary warnings are present (done);
4. the export callable calls `validate_scenario_selection` **before**
   building; a mixed-base or deleted selection returns the error and produces
   no workbook and no signed URL (test required);
5. the workbook row is implemented with group-matching ideals and the same
   classifier;
6. the four-decimal decision is applied (fix before use, or footnote present
   and scheduled). The fix regenerates `boundary-cases.json` and
   `scenario-parity-cases.json`; CI must pass before deploy.

## Thresholds

- `BOUNDARY_EPS = 0.001` is the solver fragility threshold; the 0.03
  tolerance is the workbook-parity gate.
- The client-side `target-safety` override warning is directional (below the
  reference floor) and does not use `BOUNDARY_EPS`.


## Local render smoke (2026-11-27)

`docs/screenshots/export-smoke.xlsx` was built from the reference Confronto
plus a one-scenario `Scenari`/`Sensibilità` sample and rendered with the
office renderer (en-US locale, not LibreOffice `it-IT`):

- `Confronto` headers and `Fonte` values visible; warnings wrap;
- strict row shows `#N/A` for DM and cost, not blank/0;
- cost cells carry `€ #,##0.000`; en-US renders `€ 9.885`, so the locale
  check is still `it-IT`-specific and was not performed;
- `Sensibilità` shows all 15 headers (`feed_top1` + four deltas, top2/top3
  `#N/A` for one feed);
- column widths were widened after the first render clipped headers and
  values.

Screenshots: `docs/screenshots/export-smoke-confronto.png`,
`docs/screenshots/export-smoke-sensibilita.png`.

Signed URL is still unverified: no Firebase auth/Storage session in this
environment.


## Signed URL smoke (2026-11-27, nicola-milk-farm = staging)

- Authentication: test Firebase user, `export_comparison()` no args.
- Response: 3 rows + signed URL, HTTP 200.
- Download: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
  5,389 bytes, valid XLSX.
- Workbook: one `Confronto` sheet; workbook 23.10246/€9.885; relaxed
  23.095/€9.0062; strict `#N/A`; cost format `€ #,##0.000`.
- Screenshot: `docs/screenshots/export-prod-confronto.png`.
- The renderer is en-US, so `it-IT` (`€ 9,885`) is still unverified.

**Query check:** the Firestore JS SDK, signed in as the test owner, ran the
exact `/scenarios` query and returned `smoke-live-2`, `smoke-live-1` (newest
first, deleted excluded) with no index error. A direct REST `runQuery` with
the same ID token returned `PERMISSION_DENIED`; that is a REST-specific auth
quirk, not the app SDK path. Smoke documents were removed.


## Italian locale render (2026-11-27)

With LibreOffice's locale set to Italian (Italy), the production workbook
renders:

- `SS totali`: `23,102` and `23,095`;
- `Costo`: `€ 9,885` and `€ 9,006`;
- strict cells: `#N/A`.

Correction to the earlier contract example: `€ 9.885,000` would mean 9,885
euros with three decimals. The correct Italian render of 9.885 is
`€ 9,885` (comma decimal, no thousands separator because the value is below
1,000). The format code `€ #,##0.000` is correct.

Screenshot: `docs/screenshots/export-prod-confronto-it.png`.


## Scenario export smoke (2026-11-27, staging)

With a seeded recipe and one saved scenario (`feedPrices` change):

- response 200, 3 sheets: `Confronto`, `Scenari`, `Sensibilità`;
- `Scenari`: base €4.000, scenario €5.000, delta +€1.000, status computed;
- `Sensibilità`: 16 columns (Scenario + 15), top feed `smoke-feed`,
  ±5/±10% deltas 0.25/−0.25/0.50/−0.50;
- `Confronto` hand-ration/relaxed/strict rows from the seeded recipe.

The smoke recipe, feed and scenario were deleted afterward. This verifies the
production callable path for `Scenari`/`Sensibilità`, not only the sheet
builders.


## Confronto PROPOSED shape — PENDING SIGN-OFF (owner: unassigned)

This records what the implementation and tests assert; it does **not** replace
the pending `NA()`/Sensibilità decisions.

- 25 columns in order: `Fonte`, `Stato`, `Diagnostica da`, `Totale tal
  quale`, `SS totali`, `Costo`, the 17 codes in `_NUTRIENT_CODES` order,
  `Avvisi`, `Obiettivi non raggiungibili`.
- `diagnostics_from`: `workbook`, `self`, `relaxed-fallback`.
- `unreachableTargets`: newline-separated `code|value|min|max|issue|boundary`;
  `issue` is only `below_min`/`above_max`; `boundary` is always empty.
  `at_boundary` is a warning-only category and never appears in
  `unreachableTargets`; `boundary` exists only for warnings.
- Strict row: `totalAsFed`, `totalDM`, `totalCost` and 17 nutrients are
  `=NA()` (20 cells); relaxed row has none.
- `NA()` is an Excel error value that propagates; display is
  renderer-localized (`#N/A` in LibreOffice it-IT, potentially `#N/D` in
  Excel it-IT).
