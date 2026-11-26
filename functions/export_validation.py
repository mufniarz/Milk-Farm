"""Validation used by export_comparison before building the workbook."""


def validate_scenario_selection(scenarios):
    """Reject deleted or mixed-base selections; returns the base triple."""
    if any(scenario.get("deletedAt") is not None for scenario in scenarios):
        raise ValueError("scenario_deleted")
    triples = {
        (
            scenario.get("baseSource"),
            scenario.get("baseRecipeId"),
            scenario.get("baseHash"),
        )
        for scenario in scenarios
    }
    if len(triples) > 1:
        raise ValueError("mixed_base")
    return next(iter(triples), None)
