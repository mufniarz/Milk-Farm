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

## Alert IAM and channel

The script needs `roles/monitoring.alertPolicyEditor` and
`roles/monitoring.notificationChannelEditor` (or the specific
`monitoring.alertPolicies.create` / `monitoring.notificationChannels.create`
permissions), plus `roles/logging.viewer` if the operator needs to inspect the
underlying log entries. Grant them to the deployment account, then run the
script with an operator email.

The out-of-band alert is a precondition for the first invoice, not for the
free design-partner pilot. Owner: the farm operator. Blocker: operator email
and the Monitoring IAM grant; resolve at the first paying customer. The gate is **delivery**, not creation: cause one
synthetic error (or use a `--test` run once the script supports it) and
confirm the operator receives it. A policy that has never fired does not
satisfy the gate.

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

## Scope of `system`

`system/feedingRetryScan` is a global singleton. It contains only scan
health, never farm data. The `system` collection is global-only; per-farm
state must stay under `farms/{farmId}`.

`scripts/check-firestore-indexes.cjs` is a repository guard: it proves the
repo carries the required indexes, not that the deployed project does. The
heartbeat is the production check; keep both.

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


## Failure retention

`functions/retention.py` (`should_expire_failure`) defines the 90-day rule:
resolved/dead failures expire, except `manual-adjustment` and `written-off`.
Scheduled cleanup is deployed in staging (`scheduled_failure_cleanup`) and
verified on 2026-11-27: expired resolved and expired dead documents were
deleted; `manual-adjustment`, `written-off` and young documents remained.
Smoke documents were removed.


## Alert delivery (2026-11-27)

- Operator email: `marcin.ufniarz@savvyworker.com`.
- Email channel: `projects/nicola-milk-farm/notificationChannels/14355749898937653947`.
- Alert policy: `projects/nicola-milk-farm/alertPolicies/14049935868585474179`
  (`Milk Farm feeding retry scan errors`, log-match on
  `scheduled-feeding-retry` severity >= ERROR, 300s rate limit).
- Synthetic ERROR log emitted to `scheduled-feeding-retry` at 2026-11-27
  23:45 UTC.
- **Owner:** `marcin.ufniarz@savvyworker.com` owns both the operator email and
  Monitoring IAM.
- **Delivery confirmation:** check the operator inbox for the Monitoring
  notification. Production remains deferred **pending inbox confirmation**,
  not pending an owner.


## Production deferral (2026-11-27)

Production deployment is **deferred pending the alert owner**. This is an
accepted decision, not an open-ended wait: no production project is created
until operator email + Monitoring IAM owner are named and one synthetic alert
is delivered.


## CSV renderer of record (2026-11-27)

Accepted risk: **LibreOffice is the renderer of record for the CSV fixture.**
The file is correctly shaped for Excel `it-IT` (BOM, `;`, comma decimals) and
column splitting is verified. LibreOffice's CSV filter renders comma decimals
with a dot under its document locale, so it cannot prove Excel's decimal
display. The Excel `it-IT` open is deferred to first user acceptance; the file
must not be changed on the basis of the LibreOffice render.


## Builder DOM spec — accepted gap (2026-11-27)

Deferred to first user acceptance. Existing coverage: `ScenarioDraftController`
specs, `loadScenarioFlow` specs and `buildBuilderScenarioPayload` spec. There
is no mounted-panel DOM test for save/load/discard. DOM-level verification must
be added before any further builder UI change ships.
