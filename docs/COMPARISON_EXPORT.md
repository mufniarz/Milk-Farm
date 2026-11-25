# Comparison export — format decision

## Decision

The Stage 2 comparison is a **separate XLSX workbook**, not a CSV. The recipe
workbook export is already XLSX, and a comparison with three sources,
diagnostics columns and `€` values is better served by a typed sheet than by a
delimiter format that has a pending `it-IT` visual check.

- Sheet: `Confronto`.
- Rows/columns:
  - `source`: `workbook` | `relaxed-solver` | `strict-solver`;
  - `status`, `totalDM`, `totalCost`;
  - `warnings` and `unreachableTargets` as **separate columns**, not a merged
    notes cell;
  - one row per source, not one row per feed.
- Number/currency formats: `€ #,##0.000` (Italian locale); verify the `€`
  glyph and formats in LibreOffice with `it-IT` before shipping.
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
2. the strict response includes both `unreachableTargets` and `warnings`
   (done);
3. the boundary warnings are present (`ADF`, `uNDF/aNDF` — done).
