"""
Workbook -> fixtures parity.

This is the independent half of the parity chain: it opens the client's
source workbook (docs/ALIMENTAZIONE.xlsx) and checks that the generated
fixtures still describe it. The other half is the TypeScript calculator
spec, which checks that the *computed* ration reproduces the same numbers.

The Python side deliberately does not re-implement the ration calculation.
It only maps the workbook's labels to nutrient codes and compares the
generated fixtures against the cells.
"""
import json
import os
import re

import pytest
from openpyxl import load_workbook

HERE = os.path.dirname(__file__)
REPO = os.path.dirname(os.path.dirname(HERE))
WORKBOOK = os.path.join(REPO, "docs", "ALIMENTAZIONE.xlsx")

TARGETS = json.load(open(os.path.join(HERE, "targets.json")))
REFERENCE = json.load(open(os.path.join(HERE, "reference_rations.json")))

SHEETS = {
    "VACCHE DA LATTE": "lactating",
    "VACCHE ASCIUTTE": "dry",
    "MANZE": "heifer",
}


def _norm(value):
    return " ".join(str(value or "").lower().split())


def label_to_code(label):
    """Mirror of labelToCode() in scripts/parse-excel.cjs."""
    s = _norm(label)
    if "concentrati" in s:
        return "concentratiPct"
    if "foraggi" in s:
        return "foraggiPct"
    if "emicellulosa" in s:
        return "emicellulosa"
    if "adf/andf" in s or "adf/a ndf" in s:
        return "ADF_aNDF"
    if "undf/andf" in s or "undf/a ndf" in s:
        return "uNDF_aNDF"
    if "pectine" in s:
        return "pectine"
    if "nfc" in s:
        return "NFC"
    if "adl" in s:
        return "ADL"
    if s.startswith("adf"):
        return "ADF"
    if "u ndf" in s or "undf" in s:
        return "uNDF"
    if "a ndf" in s or "andf" in s:
        return "aNDF"
    if "zuccheri" in s:
        return "zuccheri"
    if "ceneri" in s:
        return "ceneri"
    if "amido" in s:
        return "amido"
    if "proteina" in s:
        return "proteina"
    if s.startswith("ee"):
        return "ee"
    if "umidit" in s:
        return "umidita"
    return None


def parse_range(raw):
    """Mirror of parseRange() in scripts/parse-excel.cjs."""
    if raw is None:
        return None
    text = str(raw).strip()
    if text in ("", "-"):
        return None
    norm = text.replace(",", ".")
    if ">" in norm or "<" in norm:
        min_value = max_value = None
        gt = re.search(r">\s*(\d+(?:\.\d+)?)", norm)
        lt = re.search(r"<\s*(\d+(?:\.\d+)?)", norm)
        if gt:
            min_value = float(gt.group(1))
        if lt:
            max_value = float(lt.group(1))
        return (min_value, max_value) if (min_value is not None or max_value is not None) else None

    nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", norm)]
    if not nums:
        return None
    if len(nums) == 1:
        return (nums[0], None)
    return (min(nums[0], nums[1]), max(nums[0], nums[1]))


def _analysis_rows(ws):
    """Yield (label, value, ideal_range) for the sheet's analysis block."""
    started = False
    for row in ws.iter_rows(min_col=2, max_col=4, values_only=True):
        label, value, ideal = row[0], row[1], row[2]
        if not started:
            if label and "valori stimati" in _norm(label):
                started = True
            continue
        if label is None or _norm(label) == "":
            continue
        yield label, value, ideal


def _commercial(ws):
    """Return the commercial rows present on the sheet, keyed by field."""
    found = {}
    for label, value, _ideal in _analysis_rows(ws):
        if not isinstance(value, (int, float)):
            continue
        n = _norm(label)
        if n.startswith("costo razione al kg"):
            found["costPerKgAsFed"] = value
        elif n.startswith("costo razione"):
            found["groupTotal"] = value
        elif n.startswith("totale carico"):
            found["totalLoadAsFed"] = value
        elif n.startswith("kg tq"):
            found["totalAsFed"] = value
        elif n.startswith("kg s.s"):
            found["workbookTotalDM"] = value
    return found


@pytest.mark.parametrize("sheet_name,group_id", list(SHEETS.items()))
def test_targets_match_the_workbook(sheet_name, group_id):
    ws = load_workbook(WORKBOOK, data_only=True)[sheet_name]
    by_code = {t["nutrientCode"]: t for t in TARGETS[group_id]}

    workbook_codes = set()
    for label, _value, ideal in _analysis_rows(ws):
        code = label_to_code(label)
        if not code:
            continue
        parsed = parse_range(ideal)
        if parsed is None:
            continue
        workbook_codes.add(code)
        assert code in by_code, f"{sheet_name}: target {code} missing from fixture"
        expected_min, expected_max = parsed
        target = by_code[code]
        assert (target["minValue"] is None) == (expected_min is None), (
            sheet_name,
            code,
            target["minValue"],
            expected_min,
        )
        assert (target["maxValue"] is None) == (expected_max is None), (
            sheet_name,
            code,
            target["maxValue"],
            expected_max,
        )
        if expected_min is not None:
            assert abs(target["minValue"] - expected_min) <= 1e-3, (sheet_name, code)
        if expected_max is not None:
            assert abs(target["maxValue"] - expected_max) <= 1e-3, (sheet_name, code)

    assert workbook_codes == set(by_code), (
        sheet_name,
        workbook_codes ^ set(by_code),
    )


@pytest.mark.parametrize("sheet_name,group_id", list(SHEETS.items()))
def test_analysis_matches_the_workbook(sheet_name, group_id):
    ws = load_workbook(WORKBOOK, data_only=True)[sheet_name]
    fixture = REFERENCE[group_id]["analysis"]

    seen = set()
    for label, value, _ideal in _analysis_rows(ws):
        code = label_to_code(label)
        if not code or not isinstance(value, (int, float)):
            continue
        seen.add(code)
        assert code in fixture, f"{sheet_name}: analysis {code} missing from fixture"
        # Published values are fractions; the fixture stores percentages.
        assert abs(value * 100 - fixture[code]) <= 0.01, (
            sheet_name,
            code,
            value * 100,
            fixture[code],
        )

    assert seen == set(fixture), (sheet_name, seen ^ set(fixture))


@pytest.mark.parametrize("sheet_name,group_id", list(SHEETS.items()))
def test_commercial_rows_match_the_workbook(sheet_name, group_id):
    ws = load_workbook(WORKBOOK, data_only=True)[sheet_name]
    workbook = _commercial(ws)
    fixture = REFERENCE[group_id]

    assert set(workbook) <= set(fixture), (sheet_name, set(workbook) - set(fixture))
    for field, value in workbook.items():
        assert abs(value - fixture[field]) <= 1e-3, (
            sheet_name,
            field,
            value,
            fixture[field],
        )

    # The per-head / group wiring must be internally consistent.
    assert abs(
        fixture["costPerHead"] * fixture["headCount"] - fixture["groupTotal"]
    ) <= 1e-3, (sheet_name, "costPerHead x headCount != groupTotal")
    if "totalLoadAsFed" in workbook:
        assert abs(
            fixture["costPerKgAsFed"] * fixture["totalLoadAsFed"]
            - fixture["groupTotal"]
        ) <= 0.01, (sheet_name, "costPerKg x load != groupTotal")


def test_reference_rations_cover_every_sheet():
    assert set(REFERENCE) == set(SHEETS.values())
    for group_id, reference in REFERENCE.items():
        assert reference["quantities"], group_id
        assert reference["feeds"], group_id
        assert abs(
            sum(q["kgAsFed"] for q in reference["quantities"])
            - reference["totalAsFed"]
        ) <= 1e-6, group_id
