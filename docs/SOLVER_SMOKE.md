# Production solver smoke — reference scale

Called `optimize_ration` in production with the full lactating reference feed
library and `constraints.totalDM = 23.1`:

| Scenario | Status | Total DM | Total cost |
|---|---|---|---|
| Full reference targets | `relaxed` | 23.1 | €9.373 |
| Protein/starch targets only | `optimal` | 23.1 | €6.031 |

The 1 kg-DM failure mode is not present: both calls honour the 23.1 kg DM
constraint. The full target set contains an ADF/aNDF target that the feed
library cannot satisfy (existing solver test), so the solver returns
`relaxed` with warnings; the protein/starch-only case is `optimal` at a lower
cost because the LP minimises cost.

The reference workbook ration (the manually fed 48.3 kg as-fed / 23.10246 kg
DM) reproduces **€9.885** in the parity test (`_build_result` with the
reference quantities), but the solver is not expected to return that exact
cost: €9.885 is a feasible hand ration, not the cost minimum. The parity test
therefore asserts `totalCost <= 9.885` for the solver and `≈ 9.885` for the
reference quantities.

If the product contract is "return the workbook ration" rather than "minimise
cost subject to targets," that is a different requirement and would need a
separate non-optimising path; the current callable is a cost minimiser.
