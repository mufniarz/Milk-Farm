from datetime import datetime, timedelta, timezone

from retention import should_expire_failure

NOW = datetime(2026, 11, 27, tzinfo=timezone.utc)


def test_resolved_older_than_90_days_expires():
    assert should_expire_failure(
        {"status": "resolved", "resolvedAt": NOW - timedelta(days=91)}, NOW
    )


def test_younger_or_unresolved_does_not_expire():
    assert not should_expire_failure(
        {"status": "resolved", "resolvedAt": NOW - timedelta(days=89)}, NOW
    )
    assert not should_expire_failure({"status": "pending"}, NOW)


def test_excluded_resolutions_never_expire():
    for resolution in ("manual-adjustment", "written-off"):
        assert not should_expire_failure(
            {"status": "resolved", "resolution": resolution,
             "resolvedAt": NOW - timedelta(days=365)},
            NOW,
        )
