# Comparison export — format and semantics

## Format

The Stage 2 comparison is a **separate XLSX workbook**, sheet `Confronto`,
not a CSV. The recipe export is already XLSX, and a three-source comparison
with diagnostics and `€` values belongs in a typed sheet.

- Rows: `workbook`, `relaxed-solver`, `strict-solver`.
- Workbook row: `status: hand-ration`; `warnings` and `unreachableTargets`
  computed against the **ideals for the animal group matching the ration's
  sheet** (lactating, dry, or heifer), not always lactating.
- Workbook row diagnostics use the **same classification rules as the solver
  rows** (`below_min` / `above_max` / `at_boundary` within `BOUNDARY_EPS`), so
  the same columns mean the same thing across all three rows. There is no
  separate workbook-only classifier. The workbook row is **specified but not
  implemented** until the export is built; its four reference misses are the
  expected output.
- Relaxed row: `warnings` = all three (ADF/aNDF below_min, ADF
  at_boundary-min, uNDF/aNDF at_boundary-max); `unreachableTargets` = the
  violation subset only (`ADF/aNDF`).
- Strict row: `status: infeasible`; same diagnostics; `totalAsFed`,
  `totalDM`, `totalCost` and all nutrient cells are `—`, never 0.

## Columns

1. `source`;
2. `status` (`hand-ration`, `optimal`, `relaxed`, `infeasible`);
3. `totalAsFed`;
4. `totalDM`;
5. `totalCost`;
6-22. the 17 nutrient analysis columns (`umidita`, `proteina`, `ee`,
   `amido`, `zuccheri`, `ceneri`, `aNDF`, `uNDF`, `NFC`, `ADF`, `ADL`,
   `pectine`, `ADF_aNDF`, `uNDF_aNDF`, `emicellulosa`, `foraggiPct`,
   `concentratiPct`);
23. `warnings`;
24. `unreachableTargets`.

### Diagnostics format

Cells carry structured tuples, not UI labels:

```
code|value|min|max|issue|boundary
```

`boundary` is `min`/`max` for `at_boundary`, empty otherwise. The range is
inline so a consultant does not need a second document to interpret
"uNDF 6.75 below_min." Labels such as "at the reference floor" are UI-only
(`warningIssueKey`); keeping tuples in the export preserves filtering.

### Cell formats and locale

- Cost: `€ #,##0.000` → `€ 9.373,000` under `it-IT`; the format code uses
  en-US separators and Excel renders it per the user's locale. Do not
  rewrite it to `€ #.##0,000`.
- Totals: `0.000`; nutrients: `0.00`.
- Headers and labels: **Italian** for the farm-facing export (`Confronto`,
  `Fonte`, `Stato`, `Costo`, `Avvisi`, `Obiettivi non raggiungibili`).
  A language switch is future work; the first client is Italian.

### Workbook DM footnote

The workbook row shows the **app's calculation** of the reference ration,
`23.095 kg DM`, while the workbook's own published value is `23.10246`.
The 0.007 kg difference comes from feed-data rounding and is documented in
`REQUIREMENTS.md`. Add a footnote on the `Confronto` sheet:

> *Valore calcolato dall'app; il workbook riporta 23,10246 kg SS. Differenza
> dovuta agli arrotondamenti dei dati alimenti (vedi REQUIREMENTS.md).*

The four-decimal fix will close the difference. Order: the export is built on
the current 0.01 basis with this footnote; the four-decimal fix lands before
the export is used in a client conversation, and the fixture is regenerated
then. If the fix lands before the export, drop the footnote.

## Gate

Do not use the export in a client conversation until:

1. the `it-IT` XLSX visual check passes (LibreOffice/Excel) — number formats,
   `€` cells, Italian headers;
2. strict returns both `unreachableTargets` and `warnings` (done);
3. boundary warnings are present (done);
4. the workbook row is implemented with the group-matching ideals and the
   same classifier;
5. the four-decimal decision is applied (fix before use, or the footnote is
   present and the fix is scheduled).

The XLSX check is **not** the CSV check: XLSX validates number/`€` cells and
headers; the accuracy CSV validates delimiter, decimal and BOM.

## Thresholds

- `BOUNDARY_EPS = 0.001` in `functions/solver.py` is the fragility threshold
  for `at_boundary`; the 0.03 tolerance is the separate workbook-parity gate.
- The client-side `target-safety` override warning is **directional**: it
  flags a draft target below the reference floor. It does not use
  `BOUNDARY_EPS`; do not unify the two by mistake.
