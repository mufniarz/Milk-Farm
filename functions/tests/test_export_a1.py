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
    # Golden relaxed values from the reference lactating solve with only the
    # totalDM constraint (solverTotalDM=23.095): cost is €/head/day, protein
    # is % DM. The relaxed cost is below the workbook 9.885 because the
    # solver is free to miss the forage/concentrate targets; it is not a
    # different cost basis.
    workbook = load_workbook(
        __import__("io").BytesIO(_build_confronto_workbook(_reference_confronto_rows()))
    )
    sheet = workbook["Confronto"]
    headers = [sheet.cell(row=1, column=column).value for column in range(1, 26)]
    assert len(headers) == 25
    assert headers[2] == "Diagnostica da"
    assert headers[3] == "Totale tal quale"
    assert headers[6:23] == [
        "umidita", "proteina", "ee", "amido", "zuccheri", "ceneri",
        "aNDF", "uNDF", "NFC", "ADF", "ADL", "pectine",
        "ADF_aNDF", "uNDF_aNDF", "emicellulosa", "foraggiPct",
        "concentratiPct",
    ]
    assert headers[-2:] == ["Avvisi", "Obiettivi non raggiungibili"]
    assert sum(
        1 for row in sheet.iter_rows() for cell in row if cell.value == "=NA()"
    ) == 20
    relaxed = sheet[3]
    assert not any(cell.value == "=NA()" for cell in relaxed[6:])
    assert relaxed[7].value == 15.8016  # proteina
    assert relaxed[5].value == 9.0062  # costo
    assert relaxed[4].value == 23.095  # SS
    unreachable = sheet.cell(row=4, column=25).value
    assert unreachable
    lines = unreachable.splitlines()
    assert len(lines) >= 2
    codes = {line.split("|")[0] for line in lines}
    assert {"foraggiPct", "concentratiPct"} <= codes
    for line in lines:
        parts = line.split("|")
        assert len(parts) == 6
        assert parts[4] in {"below_min", "above_max", "at_boundary"}
        assert parts[5] in {"", "min", "max"}
        if parts[4] in ("below_min", "above_max"):
            assert parts[5] == ""
        else:
            assert parts[5] in {"min", "max"}
    assert sheet.cell(row=2, column=3).value == "workbook"
    assert sheet.cell(row=4, column=3).value == "relaxed-fallback"
    strict_row = 4
    assert sheet.cell(row=strict_row, column=5).value == "=NA()"
    assert sheet.cell(row=strict_row, column=6).value == "=NA()"


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
