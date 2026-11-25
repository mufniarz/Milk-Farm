# Production solver smoke — reference scale

## Contract

The callable supports two modes:

- `mode: 'relaxed'` (default) — minimise cost, soften unreachable targets and
  return them in `warnings`.
- `mode: 'strict'` — no softening; return `infeasible` if the targets cannot
  all be met.

The workbook's €9.885 ration is the **hand ration**. It is reproduced by the
reference-quantity parity test. The solver is a cost minimiser, so its result
is expected to be **≤ €9.885**, not equal to it.

## Production result (full lactating reference)

| Scenario | Status | Total DM | Total cost |
|---|---|---|---|
| Full targets, `strict` | `infeasible` (ADF/aNDF in `unreachableTargets` and `warnings`) | — | — |
| Full targets, `relaxed` | `relaxed` | **23.1** | **€9.373** |
| Protein/starch targets, `relaxed` | `optimal` | **23.1** | **€6.031** |

The 1 kg-DM failure mode is gone: every successful call honours 23.1 kg DM.

## Safety of the relaxed ration

The relaxed solution meets the absolute fibre floors:

| Nutrient | Result | Target | Status |
|---|---|---|---|
| aNDF | 31.6213 | 28–34 | met |
| ADF | 18.0 | 18–22 | met (boundary) |
| uNDF | 11.5418 | 9–12 | met |
| ADF/aNDF | 56.9237 | 60–65 | **below** |
| uNDF/aNDF | 36.5001 | 29–36.5 | at the upper boundary |

The response carries three warnings: **ADF/aNDF below_min**, **ADF
at_boundary (min)**, **uNDF/aNDF at_boundary (max)**. Boundary warnings are
limited to the fibre class so the list stays a safety signal. The hand ration misses four
targets (uNDF, ADF, ADF/aNDF, uNDF/aNDF); the solver adjusts quantities to
meet the first three and the uNDF/aNDF ceiling, but cannot reach ADF/aNDF
≥ 60 on this feed library. The relaxed €9.373 is therefore not a "relaxed
fibre class" ration: the absolute fibre floors hold.

The €6.031 protein/starch-only result is a sensitivity data point, not a
recommended ration: disabling fibre targets collapses cost and would be
unsafe. The targets screen now warns when a fibre target is set below the
reference floor.

The solution hugs boundaries (ADF exactly 18.0, uNDF/aNDF at 36.5001). That is
a cost-minimisation consequence and makes the safety check sensitive to feed
analysis changes; repeat it whenever the feed library changes. The
uNDF/aNDF value is within tolerance but at the edge, so it is not listed as a
warning.

## Reproduce

`functions/tests/test_solver.py` covers the strict rejection (with both
`unreachableTargets` and `warnings`), multiple unreachable targets, and the
relaxed absolute-fibre assertions.
