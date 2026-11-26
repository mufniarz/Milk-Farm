"""Retention policy for resolved feeding-trigger failure documents."""
from datetime import datetime, timedelta, timezone

RETENTION_DAYS = 90
EXCLUDED_RESOLUTIONS = {"manual-adjustment", "written-off"}


def should_expire_failure(data, now=None):
    if data.get("status") not in ("resolved", "dead"):
        return False
    if data.get("resolution") in EXCLUDED_RESOLUTIONS:
        return False
    timestamp = data.get("resolvedAt") or data.get("deadAt")
    if timestamp is None:
        return False
    if not isinstance(timestamp, datetime):
        return False
    now = now or datetime.now(timezone.utc)
    return now - timestamp >= timedelta(days=RETENTION_DAYS)
