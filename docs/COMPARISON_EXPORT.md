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
- `boundary`: `min`/`max` for `at_boundary`; **empty** for below/above.
  It is not a distance and not redundant: `at_boundary` alone does not say
  which side. Do not add a distance field unless the sheet needs sorting by
  closeness.
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
| totalAsFed | Totale tal quale |
| totalDM | SS totali |
| totalCost | Costo |
| nutrients | nutrient label |
| warnings | Avvisi |
| unreachableTargets | Obiettivi non raggiungibili |

### Cell formats

- Cost: `€ #,##0.000` → `€ 9.373,000` under `it-IT`; the format code uses
  en-US separators and Excel renders it per locale. Do not rewrite it to
  `€ #.##0,000`.
- Totals: `0.000`; nutrients: `0.00`.
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
fix, the row shows 23.10246 and the footnote is removed or changed to “matches
workbook.”

## `Scenari` format

- Rows: one per saved scenario, plus a `base` row.
- Columns: `scenario`, `base_cost`, `scenario_cost`, `delta_cost`,
  `base_DM`, `scenario_DM`, `delta_DM`, and the nutrient rows/deltas selected
  for the comparison.
- Deltas are scenario − base; positive cost delta means more expensive.
- The same Italian headers and `€`/number formats apply.

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
8. `Scenari` base + scenario + delta arithmetic (once scenarios exist).

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
