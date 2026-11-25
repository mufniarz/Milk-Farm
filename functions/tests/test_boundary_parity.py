"""Parity fixture shared with the Angular scenario classifier."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from solver import classify_target  # noqa: E402


def test_boundary_fixture_matches_python_classifier():
    path = os.path.join(
        os.path.dirname(__file__), "..", "..", "src", "assets",
        "boundary-cases.json",
    )
    with open(path) as handle:
        cases = json.load(handle)

    for case in cases:
        warning = classify_target(
            case["code"], case["value"], case["min"], case["max"]
        )
        issue = warning["issue"] if warning else "met"
        boundary = warning.get("boundary", "") if warning else ""
        assert issue == case["issue"], (case, warning)
        assert boundary == case["boundary"], (case, warning)
