"""
Milk Farm — Cloud Functions (Python 3.11)

Hosts the LP solver endpoint for automatic ration optimization
and the Excel export function for recipe downloads.
"""
from firebase_functions import https_fn, options
from firebase_admin import initialize_app
from pulp import LpProblem, LpMinimize, LpVariable, lpSum, value, PULP_CBC_CMD, constants

initialize_app()


@https_fn.on_call(
    memory=options.MemoryOption.MB_256,
    timeout_sec=60,
    region="europe-west1",
)
def optimize_ration(req: https_fn.CallableRequest):
    """
    Solve a minimum-cost TMR formulation using linear programming.

    Input payload (req.data):
    {
      "feeds": [
        {
          "id": "abc123",
          "name": "Silomais",
          "dmFactor": 0.35,        # 1 - moisturePct/100
          "nutrients": {"proteina": 7.04, "ee": 2.91, ...},
          "pricePerKg": 0.05,
          "category": "forage"
        },
        ...
      ],
      "targets": [
        {"code": "proteina", "min": 15.5, "max": 17.0},
        {"code": "ee", "min": null, "max": 5.0},
        ...
      ],
      "constraints": {
        "totalDM": 22.5,           # optional: fix total DM intake (kg)
        "minForageRatio": 0.45,    # optional: min % of DM from forages
        "maxForageRatio": 0.65     # optional: max % of DM from forages
      }
    }

    Returns:
    {
      "status": "optimal" | "infeasible",
      "feeds": [
        {"feedId": "abc123", "kgAsFed": 15.0, "kgDM": 5.25, "cost": 0.75},
        ...
      ],
      "totalCost": 3.45,
      "totalDM": 22.5,
      "totalAsFed": 52.1,
      "nutrientAnalysis": {"proteina": 16.2, "ee": 4.1, ...},
      "message": "Optimal solution found"
    }
    """
    data = req.data
    feeds = data.get("feeds", [])
    targets = data.get("targets", [])
    constraints = data.get("constraints", {})

    if not feeds:
        return {"status": "error", "message": "No feeds provided"}

    # ─── Build LP Problem ────────────────────────────────────────────────
    prob = LpProblem("TMR_Optimization", LpMinimize)

    # Decision variables: kg as-fed for each feed (non-negative)
    x = {}
    for f in feeds:
        x[f["id"]] = LpVariable(f"x_{f['id']}", lowBound=0)

    # Objective: minimize total cost
    prob += lpSum(f["pricePerKg"] * x[f["id"]] for f in feeds), "TotalCost"

    # Total DM expression (used in constraints)
    total_dm = lpSum(f["dmFactor"] * x[f["id"]] for f in feeds)

    # ─── Total DM Constraint ─────────────────────────────────────────────
    if "totalDM" in constraints and constraints["totalDM"] is not None:
        prob += total_dm == constraints["totalDM"], "FixedTotalDM"
    else:
        # Ensure at least some DM in the ration
        prob += total_dm >= 1.0, "MinimumDM"

    # ─── Nutrient Constraints (on DM basis) ──────────────────────────────
    # For each nutrient: min <= (weighted sum / totalDM) <= max
    # Rearranged to avoid division: min * totalDM <= weighted sum <= max * totalDM
    for t in targets:
        code = t["code"]
        nutrient_sum = lpSum(
            f["nutrients"].get(code, 0) * f["dmFactor"] * x[f["id"]]
            for f in feeds
        )

        if t.get("min") is not None:
            prob += nutrient_sum >= t["min"] * total_dm, f"Min_{code}"

        if t.get("max") is not None:
            prob += nutrient_sum <= t["max"] * total_dm, f"Max_{code}"

    # ─── Forage Ratio Constraints ────────────────────────────────────────
    forage_dm = lpSum(
        f["dmFactor"] * x[f["id"]] for f in feeds if f.get("category") == "forage"
    )

    if constraints.get("minForageRatio") is not None:
        prob += forage_dm >= constraints["minForageRatio"] * total_dm, "MinForageRatio"

    if constraints.get("maxForageRatio") is not None:
        prob += forage_dm <= constraints["maxForageRatio"] * total_dm, "MaxForageRatio"

    # ─── Solve ───────────────────────────────────────────────────────────
    prob.solve(PULP_CBC_CMD(msg=0, timeLimit=10))

    if prob.status != constants.LpStatusOptimal:
        return {
            "status": "infeasible",
            "message": "No feasible solution found. Try relaxing nutrient targets or adding more feeds.",
        }

    # ─── Build Result ────────────────────────────────────────────────────
    result_feeds = []
    total_cost = 0.0
    total_as_fed = 0.0
    result_total_dm = 0.0

    for f in feeds:
        qty = x[f["id"]].varValue or 0.0
        if qty < 0.001:
            continue

        kg_dm = f["dmFactor"] * qty
        cost = f["pricePerKg"] * qty

        result_feeds.append({
            "feedId": f["id"],
            "feedName": f.get("name", ""),
            "kgAsFed": round(qty, 3),
            "kgDM": round(kg_dm, 3),
            "cost": round(cost, 4),
        })

        total_cost += cost
        total_as_fed += qty
        result_total_dm += kg_dm

    # Compute resulting nutrient analysis (% DM)
    nutrient_analysis = {}
    if result_total_dm > 0:
        all_codes = set()
        for f in feeds:
            all_codes.update(f.get("nutrients", {}).keys())

        for code in all_codes:
            weighted_sum = sum(
                f["nutrients"].get(code, 0) * f["dmFactor"] * (x[f["id"]].varValue or 0.0)
                for f in feeds
            )
            nutrient_analysis[code] = round(weighted_sum / result_total_dm, 4)

    return {
        "status": "optimal",
        "feeds": result_feeds,
        "totalCost": round(total_cost, 4),
        "totalDM": round(result_total_dm, 3),
        "totalAsFed": round(total_as_fed, 3),
        "nutrientAnalysis": nutrient_analysis,
        "message": "Optimal solution found",
    }
