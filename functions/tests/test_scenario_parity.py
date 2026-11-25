"""Value parity between the Angular and Python scenario recomputations."""
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from scenario import apply_scenario  # noqa: E402


def test_scenario_parity_fixture_matches_python():
    path = os.path.join(
        os.path.dirname(__file__), "..", "..", "src", "assets",
        "scenario-parity-cases.json",
    )
    with open(path) as handle:
        fixture = json.load(handle)

    now = datetime(2026, 11, 26, tzinfo=timezone.utc)
    for case in fixture["cases"]:
        result = apply_scenario(fixture["base"], case["changes"], now)
        expected = case["expected"]
        assert result["status"] == expected["status"], case["name"]
        assert result["totalAsFed"] == expected["totalAsFed"], case["name"]
        assert result["totalDM"] == expected["totalDM"], case["name"]
        assert result["totalCost"] == expected["totalCost"], case["name"]
        assert result["compliance"] == expected["compliance"], case["name"]
        assert [
            warning["code"] for warning in result["warnings"]
        ] == expected["warnings"], case["name"]
