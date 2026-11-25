# Comparison export — format decision

## Decision

The Stage 2 comparison is a **separate XLSX workbook**, not a CSV. The recipe
workbook export is already XLSX, and a comparison with three sources,
diagnostics columns and `€` values is better served by a typed sheet than by a
delimiter format that has a pending `it-IT` visual check.

- Sheet: `Confronto`.
- Rows: one per source — `workbook`, `relaxed-solver`, `strict-solver`.
- Columns, in order:
  1. `source`;
  2. `status` (`workbook`, `optimal`, `relaxed`, `infeasible`);
  3. `totalAsFed`;
  4. `totalDM`;
  5. `totalCost`;
  6-22. the 17 nutrient analysis columns (`umidita`, `proteina`, `ee`,
     `amido`, `zuccheri`, `ceneri`, `aNDF`, `uNDF`, `NFC`, `ADF`, `ADL`,
     `pectine`, `ADF_aNDF`, `uNDF_aNDF`, `emicellulosa`, `foraggiPct`,
     `concentratiPct`);
  23. `warnings`;
  24. `unreachableTargets`.
- **Infeasible strict row:** `status = infeasible`; `totalAsFed`, `totalDM`,
  `totalCost` and all nutrient cells are `—`, never 0; `warnings` and
  `unreachableTargets` are populated. The `status` column is what
  disambiguates a missing value from an infeasible result.
- **Cell format:** `€ #,##0.000` for cost with the Italian locale
  (`€ 9.373,000`); `0.000` for `totalAsFed`/`totalDM`; `0.00` for nutrients;
  text for `status`, `warnings`, `unreachableTargets`. The `it-IT` XLSX check
  asserts exactly that rendering.
- The workbook row is labelled "workbook hand ration" so the consultant can
  explain why there are three prices for the same recipe.

## Reference values the export will show

| Source | Status | Total DM | Cost | Diagnostics |
|---|---|---|---|---|
| workbook | reference ration | 23.1 | €9.885 | misses uNDF, ADF, ADF/aNDF, uNDF/aNDF (hand ration) |
| relaxed-solver | relaxed | 23.1 | €9.373 | ADF/aNDF below min; ADF at floor; uNDF/aNDF at upper edge |
| strict-solver | infeasible | — | — | ADF/aNDF in `unreachableTargets`; same boundary warnings |

The relaxed solution is **not** a replacement for the workbook ration; it is
the cost-minimising alternative with the one unreachable ratio flagged. The
export must make that distinction before a consultant presents it.

## Gate

Do not ship the comparison export until:

1. the `it-IT` XLSX visual check passes (LibreOffice/Excel);
   this is a different check from the accuracy CSV check: XLSX validates
   number formats and `€` cells; CSV validates delimiter/decimal/BOM;
2. the strict response includes both `unreachableTargets` and `warnings`
   (done);
3. the boundary warnings are present (`ADF`, `uNDF/aNDF` — done).
