# Operations — queue health, alerts and recovery

## Retry-scan heartbeat

`scheduled_feeding_retry` writes `system/feedingRetryScan` after every run:

- `lastRunAt` — server timestamp;
- `lastRunStatus` — `ok` or `error`;
- `docsScanned`;
- `error` on failure.

The loading sheet reads it. If open failures exist and the heartbeat is older
than 15 minutes (three missed 5-minute cycles) or the last status is `error`,
the sheet shows "retry scan is not running — inventory posting may be
delayed." A missing document is treated as stale.

This heartbeat is the minimum signal. It does not replace an alert.

## Log-based alert (required console step)

Create a Cloud Monitoring log-based alert with:

```
resource.type="cloud_run_revision"
resource.labels.service_name="scheduled-feeding-retry"
severity>=ERROR
```

Route it to the operator's email or a Slack webhook. The alert fires when the
scheduled function throws, including the `FAILED_PRECONDITION` index failure
that silently disabled the scan in the first production deploy.

The helper `scripts/setup-monitoring-alert.sh` creates an email channel and
the log-based policy; run it once with an operator account that has
Monitoring Admin:

```
OPS_EMAIL=ops@example.com ./scripts/setup-monitoring-alert.sh
```

It has not been run in this session: the available service account lacks
Monitoring permissions and the operator email/channel is not configured.
Until it is run, the in-app heartbeat banner is the only signal.

## Deploy gate

1. `npm run verify` (includes `scripts/check-firestore-indexes.cjs`; the
   `feedingTriggerFailures.status` COLLECTION_GROUP override is required).
2. `firebase deploy --only firestore:indexes`, then confirm the scan indexes
   are READY.
3. `firebase deploy --only functions` (11 callables + trigger + scheduler).
4. `firebase deploy --only firestore:rules,hosting`.
5. Authenticated smoke: farm read, draft + confirm feeding, trigger posting,
   milk write/read, failure queue scan.

## Rollback

Keep the previous functions revision and the previous rules release. A
rollback of functions is a redeploy of the prior source revision; a rules
rollback is the prior rules file. There is no staging project; production is
the only environment and the smoke script is the gate.
