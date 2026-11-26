import os
import sys

from openpyxl import load_workbook

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import _build_confronto_workbook, _reference_confronto_rows  # noqa: E402


def test_reference_confronto_rows_shape():
    rows = _reference_confronto_rows()
    assert [row["source"] for row in rows] == [
        "workbook", "relaxed-solver", "strict-solver",
    ]
    assert rows[0]["status"] == "hand-ration"
    assert rows[2]["status"] == "infeasible"
    assert rows[0]["totalCost"] == 9.885


def test_infeasible_cells_are_na():
    workbook = load_workbook(
        __import__("io").BytesIO(_build_confronto_workbook(_reference_confronto_rows()))
    )
    sheet = workbook["Confronto"]
    strict_row = 4
    assert sheet.cell(row=strict_row, column=3).value == "=NA()"
    assert sheet.cell(row=strict_row, column=4).value == "=NA()"


def test_export_rejects_scenarios_before_workbook():
    from types import SimpleNamespace
    from firebase_functions import https_fn
    import pytest
    from main import export_comparison

    handler = export_comparison
    while hasattr(handler, "__wrapped__"):
        handler = handler.__wrapped__
    with pytest.raises(https_fn.HttpsError) as exc:
        handler(SimpleNamespace(auth=SimpleNamespace(uid="u"), data={"scenarioIds": ["s1"]}))
    assert "farmId" in (exc.value.message or "")
