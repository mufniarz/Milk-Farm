"""Pure scenario recomputation, mirroring the Angular `applyScenario`.

Server-side persistence and export use this implementation; the Angular
client uses the TS version for the builder preview. A shared fixture pins the
computed values, so the two cannot drift silently.
"""
from datetime import datetime, timezone

from solver import classify_target


def _round(value, places):
    scale = 10 ** places
    return int(value * scale + (0.5 if value >= 0 else -0.5)) / scale


def _calculate(feeds, quantities):
    totals = []
    for feed, quantity in zip(feeds, quantities):
        totals.append(quantity * (1 - feed["moisturePct"] / 100))
    total_dm = sum(totals)
    total_as_fed = sum(quantities)
    if total_dm == 0:
        return {
            "totalDM": 0,
            "totalAsFed": 0,
            "nutrients": {},
            "totalCost": 0,
            "moisturePct": 0,
            "forageRatio": 0,
        }

    codes = set()
    for feed in feeds:
        codes.update((feed.get("nutrients") or {}).keys())
    nutrients = {}
    for code in codes:
        weighted = sum(
            (feed.get("nutrients") or {}).get(code, 0) * dm
            for feed, dm in zip(feeds, totals)
        )
        nutrients[code] = weighted / total_dm

    total_cost = sum(
        feed["pricePerKg"] * quantity
        for feed, quantity in zip(feeds, quantities)
    )
    moisture = (total_as_fed - total_dm) / total_as_fed * 100
    forage_dm = sum(
        dm for feed, dm in zip(feeds, totals)
        if feed.get("category") == "forage"
    )
    forage_ratio = forage_dm / total_dm

    a_ndf = nutrients.get("aNDF", 0)
    nutrients["NFC"] = 100 - (
        nutrients.get("proteina", 0)
        + nutrients.get("ee", 0)
        + nutrients.get("ceneri", 0)
        + a_ndf
    )
    nutrients["emicellulosa"] = a_ndf - nutrients.get("ADF", 0)
    nutrients["pectine"] = (
        nutrients["NFC"]
        - nutrients.get("amido", 0)
        - nutrients.get("zuccheri", 0)
    )
    nutrients["ADF_aNDF"] = (
        nutrients.get("ADF", 0) / a_ndf * 100 if a_ndf > 0 else 0
    )
    nutrients["uNDF_aNDF"] = (
        nutrients.get("uNDF", 0) / a_ndf * 100 if a_ndf > 0 else 0
    )
    nutrients["umidita"] = moisture
    nutrients["foraggiPct"] = forage_ratio * 100
    nutrients["concentratiPct"] = 100 - forage_ratio * 100

    return {
        "totalDM": _round(total_dm, 3),
        "totalAsFed": _round(total_as_fed, 3),
        "nutrients": {code: _round(value, 4) for code, value in nutrients.items()},
        "totalCost": _round(total_cost, 4),
        "moisturePct": _round(moisture, 2),
        "forageRatio": _round(forage_ratio, 4),
    }


def apply_scenario(base, changes, now=None):
    prices = changes.get("feedPrices") or {}
    inclusions = changes.get("inclusions") or {}
    feeds = [
        {
            **feed,
            "pricePerKg": prices.get(feed["id"], feed["pricePerKg"]),
            "kgAsFed": inclusions.get(feed["id"], feed["kgAsFed"]),
        }
        for feed in base["feeds"]
    ]
    overrides = changes.get("targetOverrides") or {}
    targets = []
    for target in base["targets"]:
        override = overrides.get(target["nutrientCode"])
        if override:
            targets.append(
                {
                    **target,
                    "minValue": override.get("min"),
                    "maxValue": override.get("max"),
                    "source": "override",
                }
            )
        else:
            targets.append(target)

    quantities = [feed["kgAsFed"] for feed in feeds]
    result = _calculate(feeds, quantities)
    if result["totalDM"] <= 0:
        return {
            "status": "infeasible",
            "totalAsFed": 0,
            "totalDM": 0,
            "totalCost": 0,
            "nutrients": {},
            "targets": targets,
            "compliance": {},
            "warnings": [],
            "computedAt": _timestamp(now),
        }

    compliance = {}
    warnings = []
    for target in targets:
        if not target.get("isActive", True):
            continue
        code = target["nutrientCode"]
        value = result["nutrients"].get(code)
        if value is None:
            continue
        warning = classify_target(
            code, value, target.get("minValue"), target.get("maxValue")
        )
        compliance[code] = warning["issue"] if warning else "met"
        if warning:
            warnings.append(warning)
    warnings.sort(key=lambda warning: warning["code"])

    return {
        "status": "computed",
        "totalAsFed": result["totalAsFed"],
        "totalDM": result["totalDM"],
        "totalCost": result["totalCost"],
        "nutrients": result["nutrients"],
        "targets": targets,
        "compliance": compliance,
        "warnings": warnings,
        "computedAt": _timestamp(now),
    }


def _timestamp(now):
    if now is None:
        now = datetime.now(timezone.utc)
    return now.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")
