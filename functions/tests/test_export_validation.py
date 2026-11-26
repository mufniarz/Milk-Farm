import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from export_validation import validate_scenario_selection  # noqa: E402


def test_export_rejects_mixed_base():
    with pytest.raises(ValueError, match="mixed_base"):
        validate_scenario_selection(
            [
                {"baseSource": "saved-recipe", "baseRecipeId": "r1", "baseHash": None, "deletedAt": None},
                {"baseSource": "saved-recipe", "baseRecipeId": "r2", "baseHash": None, "deletedAt": None},
            ]
        )


def test_export_rejects_deleted_selection():
    with pytest.raises(ValueError, match="scenario_deleted"):
        validate_scenario_selection(
            [{"baseSource": "builder", "baseRecipeId": None, "baseHash": "h", "deletedAt": "2026-11-27"}]
        )
