"""
Pure LP solver logic for TMR formulation.

Kept free of Firebase imports so it can be unit-tested with only PuLP.
main.py wraps solve_ration() in the Cloud Function entry point.
"""
from pulp import LpProblem, LpMinimize, LpVariable, lpSum, PULP_CBC_CMD, constants


def solve_ration(feeds, targets, constraints, mode="relaxed"):
    """
    Solve a minimum-cost TMR formulation using linear programming.

    Returns a result dict with a "status" of "optimal", "relaxed",
    "infeasible" or "error". Moisture and forage/concentrate ratio bounds are
    enforced as HARD constraints; nutrient targets are hard in the primary
    model and softened (goal programming) only in the relaxed fallback.
    """
    if not feeds:
        return {"status": "error", "message": "No feeds provided"}

    prob = LpProblem("TMR_Optimization", LpMinimize)

    x = {f["id"]: LpVariable(f"x_{f['id']}", lowBound=0) for f in feeds}

    prob += lpSum(f["pricePerKg"] * x[f["id"]] for f in feeds), "TotalCost"

    total_dm = lpSum(f["dmFactor"] * x[f["id"]] for f in feeds)
    total_as_fed = lpSum(x[f["id"]] for f in feeds)
    forage_dm = lpSum(
        f["dmFactor"] * x[f["id"]] for f in feeds if f.get("category") == "forage"
    )

    total_dm_target = constraints.get("totalDM")
    if total_dm_target is None:
        # Without a fixed intake the cost-minimising answer is the smallest
        # possible ration (about 1 kg DM), which is useless in practice.
        return {
            "status": "error",
            "message": "A total dry matter target (totalDM) is required.",
        }
    prob += total_dm == total_dm_target, "FixedTotalDM"

    for t in targets:
        _add_nutrient_constraint(
            prob, feeds, x, t, total_dm, total_as_fed, forage_dm, hard=True
        )

    if constraints.get("minForageRatio") is not None:
        prob += forage_dm >= constraints["minForageRatio"] * total_dm, "MinForageRatio"
    if constraints.get("maxForageRatio") is not None:
        prob += forage_dm <= constraints["maxForageRatio"] * total_dm, "MaxForageRatio"

    water = lpSum((1 - f["dmFactor"]) * x[f["id"]] for f in feeds)
    if constraints.get("minMoisturePct") is not None:
        prob += water >= (constraints["minMoisturePct"] / 100.0) * total_as_fed, "MinMoisture"
    if constraints.get("maxMoisturePct") is not None:
        prob += water <= (constraints["maxMoisturePct"] / 100.0) * total_as_fed, "MaxMoisture"

    prob.solve(PULP_CBC_CMD(msg=0, timeLimit=10))

    if prob.status == constants.LpStatusOptimal:
        quantities = {f["id"]: (x[f["id"]].varValue or 0.0) for f in feeds}
        result = _build_result(feeds, quantities)
        result["status"] = "optimal"
        result["message"] = "Optimal solution found"
        return result

    if mode == "strict":
        return {
            "status": "infeasible",
            "message": (
                "Targets cannot be met in strict mode. "
                "Relax the targets or use relaxed mode."
            ),
        }
    return _solve_relaxed(feeds, targets, constraints)


def _wsum(feeds, x, code):
    """Weighted DM sum for a measured nutrient (equals value% * total_dm)."""
    return lpSum(
        f["nutrients"].get(code, 0) * f["dmFactor"] * x[f["id"]] for f in feeds
    )


def _nutrient_target_expr(feeds, x, code, total_dm, total_as_fed, forage_dm):
    """
    Return (value_expr, scale) so the nutrient level equals value_expr / scale.
    Bounds become:  tmin * scale <= value_expr <= tmax * scale  (all linear).
    Handles measured nutrients, derived nutrients, moisture and forage/
    concentrate percentages.
    """
    if code == "umidita":
        water = lpSum((1 - f["dmFactor"]) * x[f["id"]] for f in feeds)
        return water, total_as_fed / 100.0
    if code == "foraggiPct":
        return forage_dm, total_dm / 100.0
    if code == "concentratiPct":
        return (total_dm - forage_dm), total_dm / 100.0
    if code == "ADF_aNDF":
        return _wsum(feeds, x, "ADF"), _wsum(feeds, x, "aNDF") / 100.0
    if code == "uNDF_aNDF":
        return _wsum(feeds, x, "uNDF"), _wsum(feeds, x, "aNDF") / 100.0
    if code in ("NFC", "pectine"):
        nfc = 100 * total_dm - (
            _wsum(feeds, x, "proteina")
            + _wsum(feeds, x, "ee")
            + _wsum(feeds, x, "ceneri")
            + _wsum(feeds, x, "aNDF")
        )
        if code == "NFC":
            return nfc, total_dm
        return nfc - _wsum(feeds, x, "amido") - _wsum(feeds, x, "zuccheri"), total_dm
    if code == "emicellulosa":
        return _wsum(feeds, x, "aNDF") - _wsum(feeds, x, "ADF"), total_dm
    return _wsum(feeds, x, code), total_dm


def _add_nutrient_constraint(
    prob, feeds, x, t, total_dm, total_as_fed, forage_dm, hard, deviations=None
):
    """Add a nutrient target as a hard constraint, or as a soft (goal) one."""
    code = t["code"]
    tmin = t.get("min")
    tmax = t.get("max")
    if tmin is None and tmax is None:
        return

    value_expr, scale = _nutrient_target_expr(
        feeds, x, code, total_dm, total_as_fed, forage_dm
    )

    if hard:
        if tmin is not None:
            prob += value_expr >= tmin * scale, f"Min_{code}"
        if tmax is not None:
            prob += value_expr <= tmax * scale, f"Max_{code}"
        return

    if tmin is not None:
        under = LpVariable(f"under_{code}", lowBound=0)
        prob += value_expr + under >= tmin * scale, f"SoftMin_{code}"
        deviations.append(under / max(abs(tmin), 1e-6))
    if tmax is not None:
        over = LpVariable(f"over_{code}", lowBound=0)
        prob += value_expr - over <= tmax * scale, f"SoftMax_{code}"
        deviations.append(over / max(abs(tmax), 1e-6))


def _compute_derived_analysis(analysis, forage_pct, moisture_pct):
    """Add derived nutrients + moisture/forage percentages to an analysis dict."""
    g = lambda c: analysis.get(c, 0)
    aNDF = g("aNDF")
    analysis["NFC"] = round(100 - (g("proteina") + g("ee") + g("ceneri") + aNDF), 4)
    analysis["emicellulosa"] = round(aNDF - g("ADF"), 4)
    analysis["pectine"] = round(analysis["NFC"] - g("amido") - g("zuccheri"), 4)
    analysis["ADF_aNDF"] = round((g("ADF") / aNDF * 100) if aNDF > 0 else 0, 4)
    analysis["uNDF_aNDF"] = round((g("uNDF") / aNDF * 100) if aNDF > 0 else 0, 4)
    analysis["umidita"] = round(moisture_pct, 4)
    analysis["foraggiPct"] = round(forage_pct, 4)
    analysis["concentratiPct"] = round(100 - forage_pct, 4)


def _build_result(feeds, quantities):
    """Assemble a ration result dict from per-feed as-fed quantities."""
    result_feeds = []
    total_cost = 0.0
    total_as_fed = 0.0
    result_total_dm = 0.0

    for f in feeds:
        qty = quantities.get(f["id"], 0.0)
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

    nutrient_analysis = {}
    if result_total_dm > 0:
        all_codes = set()
        for f in feeds:
            all_codes.update(f.get("nutrients", {}).keys())

        for code in all_codes:
            weighted_sum = sum(
                f["nutrients"].get(code, 0) * f["dmFactor"] * quantities.get(f["id"], 0.0)
                for f in feeds
            )
            nutrient_analysis[code] = round(weighted_sum / result_total_dm, 4)

        forage_dm_val = sum(
            f["dmFactor"] * quantities.get(f["id"], 0.0)
            for f in feeds
            if f.get("category") == "forage"
        )
        forage_pct = forage_dm_val / result_total_dm * 100
        moisture_pct = (
            (total_as_fed - result_total_dm) / total_as_fed * 100
            if total_as_fed > 0
            else 0
        )
        _compute_derived_analysis(nutrient_analysis, forage_pct, moisture_pct)

    return {
        "feeds": result_feeds,
        "totalCost": round(total_cost, 4),
        "totalDM": round(result_total_dm, 3),
        "totalAsFed": round(total_as_fed, 3),
        "nutrientAnalysis": nutrient_analysis,
    }


def _solve_relaxed(feeds, targets, constraints):
    """
    Goal-programming fallback: when no ration satisfies every nutrient target,
    treat each target as a soft constraint and minimize the total relative
    deviation. Forage-ratio and moisture bounds remain hard.
    """
    prob = LpProblem("TMR_Relaxed", LpMinimize)

    x = {f["id"]: LpVariable(f"x_{f['id']}", lowBound=0) for f in feeds}
    total_dm = lpSum(f["dmFactor"] * x[f["id"]] for f in feeds)
    total_as_fed = lpSum(x[f["id"]] for f in feeds)
    forage_dm = lpSum(
        f["dmFactor"] * x[f["id"]] for f in feeds if f.get("category") == "forage"
    )

    target_dm = constraints.get("totalDM")
    if target_dm is None:
        return {
            "status": "error",
            "message": "A total dry matter target (totalDM) is required.",
        }
    prob += total_dm == target_dm, "FixedTotalDM"

    deviations = []
    for t in targets:
        _add_nutrient_constraint(
            prob, feeds, x, t, total_dm, total_as_fed, forage_dm,
            hard=False, deviations=deviations,
        )

    if constraints.get("minForageRatio") is not None:
        prob += forage_dm >= constraints["minForageRatio"] * total_dm, "MinForageRatio"
    if constraints.get("maxForageRatio") is not None:
        prob += forage_dm <= constraints["maxForageRatio"] * total_dm, "MaxForageRatio"

    water = lpSum((1 - f["dmFactor"]) * x[f["id"]] for f in feeds)
    if constraints.get("minMoisturePct") is not None:
        prob += water >= (constraints["minMoisturePct"] / 100.0) * total_as_fed, "MinMoisture"
    if constraints.get("maxMoisturePct") is not None:
        prob += water <= (constraints["maxMoisturePct"] / 100.0) * total_as_fed, "MaxMoisture"

    prob += lpSum(deviations), "TotalDeviation"
    prob.solve(PULP_CBC_CMD(msg=0, timeLimit=10))

    if prob.status != constants.LpStatusOptimal:
        return {
            "status": "infeasible",
            "message": "No feasible solution found. Try relaxing nutrient targets or adding more feeds.",
        }

    quantities = {f["id"]: (x[f["id"]].varValue or 0.0) for f in feeds}
    result = _build_result(feeds, quantities)

    warnings = []
    analysis = result["nutrientAnalysis"]
    for t in targets:
        code = t["code"]
        val = analysis.get(code)
        if val is None:
            continue
        if t.get("min") is not None and val < t["min"] - 1e-4:
            warnings.append({"code": code, "value": val, "min": t["min"], "max": t.get("max"), "issue": "below_min"})
        elif t.get("max") is not None and val > t["max"] + 1e-4:
            warnings.append({"code": code, "value": val, "min": t.get("min"), "max": t["max"], "issue": "above_max"})

    result["status"] = "relaxed"
    result["warnings"] = warnings
    result["message"] = "Closest feasible ration found. Some nutrient targets are not fully met."
    return result
