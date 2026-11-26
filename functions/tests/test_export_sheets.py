import io
import os
import sys

from openpyxl import Workbook, load_workbook

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from main import (  # noqa: E402
    _add_scenari_sheet,
    _add_sensibilita_sheet,
    _sensitivity_columns,
)


def _snapshot(lines, status="computed"):
    return {"status": status, "lines": lines}


def test_sensitivity_columns_rank_and_na():
    columns = _sensitivity_columns(
        _snapshot([
            {"feedId": "b", "kgAsFed": 10, "unitCostPerKgAsFed": 1},
            {"feedId": "a", "kgAsFed": 10, "unitCostPerKgAsFed": 1},
        ])
    )
    assert columns["feed_top1"] == "a"
    assert columns["feed_top2"] == "b"
    assert columns["feed_top3"] is None
    assert columns["delta_top1_+5"] == 0.5
    assert columns["delta_top3_+5"] is None
    assert columns["delta_top2_+5"] == 0.5


def test_sensitivity_columns_infeasible_all_na():
    columns = _sensitivity_columns(_snapshot([], "infeasible"))
    assert len(columns) == 15
    assert all(value is None for value in columns.values())


def test_scenari_and_sensibilita_sheets_render():
    workbook = Workbook()
    workbook.remove(workbook.active)
    rows = [
        {"scenario": "A", "base_cost": 2.0, "scenario_cost": 1.8,
         "delta_cost": -0.2, "status": "computed", **_sensitivity_columns(_snapshot([]))},
        {"scenario": "B", "base_cost": 2.0, "scenario_cost": 2.3,
         "delta_cost": 0.3, "status": "computed", **_sensitivity_columns(_snapshot([]))},
    ]
    _add_scenari_sheet(workbook, rows)
    _add_sensibilita_sheet(workbook, rows)
    sheet = workbook["Scenari"]
    assert [sheet.cell(1, c).value for c in range(1, 12)] == [
        "Scenario", "Costo base", "Costo scenario", "Delta costo",
        "SS base", "SS scenario", "Delta SS", "Costo salvato",
        "Salvato il", "Variato", "Stato",
    ]
    assert sheet.max_column == 26
    assert sheet.cell(1, 12).value == "Base aNDF"
    assert sheet.cell(2, 4).value == -0.2
    assert sheet.cell(3, 4).value == 0.3
    sensitivity = workbook["Sensibilità"]
    assert sensitivity.max_column == 16
    assert sensitivity.cell(2, 2).value == "=NA()"
