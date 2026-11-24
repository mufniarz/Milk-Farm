"""
Tests for the recipe .xlsx export (functions/main.build_recipe_workbook).

The workbook must reproduce the source spreadsheet's numbers, including the
per-head economics and the whole-group "totale carico" (per-head quantity
multiplied by the number of animals).
"""
import io
import os
import sys
import types

import pytest
from openpyxl import load_workbook

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))  # functions/

# main.py initialises firebase_admin at import time; stub only the call so the
# pure workbook builder can be tested without service-account credentials.
import firebase_admin  # noqa: E402

if not getattr(firebase_admin, "_dsh_stubbed", False):
    firebase_admin.initialize_app = lambda *args, **kwargs: None
    firebase_admin._dsh_stubbed = True

from main import build_recipe_workbook  # noqa: E402


# Dry-cow reference ration from docs/ALIMENTAZIONE.xlsx (VACCHE ASCIUTTE):
# 19.9 kg t.q. per head, 100 head, €2.176 per head.
RECIPE = {
    "name": "Asciutta 100 capi",
    "animalGroupId": "dry",
    "animalGroupLabel": "Vacche in asciutta",
    "animalCount": 100,
    "totalAsFed": 19.9,
    "totalDM": 6.6545,
    "cost": 2.176,
    "nutrientAnalysis": {"proteina": 12.21, "amido": 11.0, "foraggiPct": 87.88},
}

FEEDS = [
    {
        "feedName": "mais trinciato aziendale",
        "category": "forage",
        "pricePerKg": 0.07,
        "kgAsFed": 10.0,
        "kgDM": 2.454,
        "moisturePct": 75.46,
        "cost": 0.7,
    },
    {
        "feedName": "soia 70/30",
        "category": "concentrate",
        "pricePerKg": 0.54,
        "kgAsFed": 0.9,
        "kgDM": 0.8064,
        "moisturePct": 10.4,
        "cost": 0.486,
    },
]

NUTRIENTS = [
    {"code": "proteina", "label": "Proteina Grezza", "unit": "% s.s."},
    {"code": "amido", "label": "Amido", "unit": "% s.s."},
    {"code": "foraggiPct", "label": "% foraggi su ss", "unit": "% s.s."},
]

TARGETS = [{"code": "proteina", "min": 12, "max": None}]


@pytest.fixture(scope="module")
def rows():
    """Return the workbook as a list of non-empty row value lists."""
    _, content = build_recipe_workbook(RECIPE, FEEDS, NUTRIENTS, TARGETS)
    ws = load_workbook(io.BytesIO(content)).active
    return [list(row) for row in ws.iter_rows(values_only=True)]


def _find(rows, label):
    """Return the first row whose first cell equals label."""
    for row in rows:
        if row and row[0] == label:
            return row
    raise AssertionError(f"row {label!r} not found in export")


def test_filename_is_sanitised():
    filename, _ = build_recipe_workbook(RECIPE, FEEDS, NUTRIENTS, TARGETS)
    assert filename == "Asciutta 100 capi.xlsx"


def test_group_label_is_written(rows):
    assert "Vacche in asciutta" in str(rows[1][0])


def test_batch_load_and_cost_match_the_spreadsheet(rows):
    capi = _find(rows, "Capi")
    assert capi[2] == 100

    per_kg = _find(rows, "Costo razione al kg (€/kg t.q.)")
    assert abs(per_kg[2] - 0.1093) < 1e-4

    load = _find(rows, "Totale carico (kg t.q.)")
    assert abs(load[2] - 1990.0) < 1e-6

    load_cost = _find(rows, "Costo totale carico (€)")
    assert abs(load_cost[5] - 217.6) < 1e-6


def test_sections_and_targets_are_written(rows):
    titles = [row[0] for row in rows if row and row[0]]
    assert "FORAGGI" in titles
    assert "CONCENTRATI" in titles
    assert "TOTALE RAZIONE" in titles

    proteina = _find(rows, "Proteina Grezza")
    assert proteina[1] == 12.21
    assert proteina[2] == ">12"
