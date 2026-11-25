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
- `boundary`: `min`/`max` for `at_boundary`; **empty** for below/above, with
  a trailing pipe (`code|value|min|max|issue|`) so the parser is positional,
  not a missing field. It is not a distance and not redundant:
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
| totalAsFed | Totale tal quale |
| totalDM | SS totali |
| totalCost | Costo |
| nutrients | nutrient label |
| warnings / Avvisi | Avvisi |
| unreachableTargets | Obiettivi non raggiungibili |

### Cell formats

- Cost: `€ #,##0.000` → `€ 9.373,000` under `it-IT`; the format code uses
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

**One base per export.** All selected scenarios must share the same
`baseSource` and `baseRecipeId`; the export refuses a mixed selection with a
clear message. Mixed bases would make `delta_cost` incomparable across rows.

### Base

`Scenari` compares against **the saved recipe the scenarios were created
from**, not the workbook. A `base_source` column records `saved-recipe` or
`workbook`; the base identity is the recipe id/name. A scenario created from
the workbook is labelled `workbook`.

### `changes` schema

A scenario is `{ feedPrices?, inclusions?, targetOverrides? }`:

- **feedPrices** — recompute with modified prices; cost changes, nutrient
  values do not.
- **inclusions** — modify recipe line quantities; both nutrients and cost
  change.
- **targetOverrides** — the ration is unchanged, so value deltas are **0**;
  only compliance status changes. This is why `Scenari` carries status
  columns, not only deltas.

### Columns

- `scenario`, `base_source` (header `Base di confronto`), `status`,
  `diagnostics_from`, `computed_at`;
- `base_cost`, `scenario_cost`, `delta_cost`;
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
  safety read.

`base_status_<nutrient>` is the **base value against the base's targets**;
`scenario_status_<nutrient>` is the **scenario value against the scenario's
effective targets** (base + `targetOverrides`). This is what makes an
override scenario visible when its value deltas are zero.

The export **recomputes** each scenario from its saved `changes` and the
current base, rather than reading the stored `resultSnapshot`; `computed_at`
records that recomputation. A stored snapshot is the audit record, not the
export source. `Sensibilità` uses the same recomputed values. The scenario
snapshot still carries `warnings`, `targets` (effective) and `computedAt`, so
a saved scenario can be audited without recomputing.

Deltas are **scenario − base**; a cheaper scenario has a negative
`delta_cost`. A header note states this.

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
| base_cost / scenario_cost / delta_cost | Costo base / Costo scenario / Delta costo |
| base_DM / scenario_DM / delta_DM | SS base / SS scenario / Delta SS |
| base_<nutrient> / scenario_<nutrient> / delta_<nutrient> | nutrient label + Base/Scenario/Delta |
| warnings | Avvisi |
| base_status_<nutrient> / scenario_status_<nutrient> | nutrient label + Stato base/Stato scenario |

### Sensitivity

Sensitivity is **per scenario** and lives in a third sheet, `Sensibilità`:
one row per scenario, **12 delta-cost columns** (top 3 ingredients × ±5%/±10%
price shocks), plus the scenario/base identification. Rows-per-shock is
rejected for readability. It is ranked **per scenario**, because an inclusion
change can alter the top 3. Only saved scenarios are exported; the builder's
unsaved state is not. The pure function is
`topThreeByCostContribution`; price shocks are ±5%/±10%, not inclusion
shocks. It is unit-tested independently.

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
- inclusion change: nutrients and cost change;
- target override: values unchanged, compliance status changes;
- base recipe `updatedAt`/data unchanged by applying a scenario;
- save/replay round-trip returns the same `resultSnapshot`;
- sensitivity: top-3 ordering, ties, ±5/±10%, base unchanged.

## Gate

Do not use the export in a client conversation until:

1. the `it-IT` XLSX visual check passes (number formats, `€` cells, Italian
   headers) — distinct from the accuracy CSV check;
2. strict returns both `unreachableTargets` and `warnings` (done);
3. boundary warnings are present (done);
4. the workbook row is implemented with group-matching ideals and the same
   classifier;
5. the four-decimal decision is applied (fix before use, or footnote present
   and scheduled).

## Thresholds

- `BOUNDARY_EPS = 0.001` is the solver fragility threshold; the 0.03
  tolerance is the workbook-parity gate.
- The client-side `target-safety` override warning is directional (below the
  reference floor) and does not use `BOUNDARY_EPS`.
