"""Builder base hash parity with the Angular helper."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import _hash_scenario_lines  # noqa: E402


def test_scenario_base_hash_fixture():
    path = os.path.join(
        os.path.dirname(__file__), "..", "..", "src", "assets",
        "scenario-base-hash-cases.json",
    )
    cases = json.load(open(path))
    for case in cases:
        assert _hash_scenario_lines(case["lines"]) == case["hash"], case["name"]
