"""The server target ranges must match the Angular reference data."""
import json
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def test_server_target_ranges_match_initial_data():
    source = open(os.path.join(ROOT, "src/app/core/data/initial-data.ts")).read()
    match = re.search(r"export const TARGET_RANGES[^=]*=\s*(\{)", source)
    assert match, "TARGET_RANGES not found"
    start = match.start(1)
    depth = 0
    in_string = False
    escaped = False
    end = None
    for index in range(start, len(source)):
        char = source[index]
        if in_string:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                end = index + 1
                break
    assert end, "TARGET_RANGES braces not closed"
    expected = json.loads(source[start:end])
    actual = json.load(open(os.path.join(ROOT, "functions/target_ranges.json")))
    assert actual == expected
