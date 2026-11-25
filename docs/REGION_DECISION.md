# Region decision — Firestore `nam5` vs `europe-west1`

## Current state

Production Firestore `(default)` is in **`nam5` (US multi-region)**. Cloud
Functions are in `europe-west1`. Every app read/write crosses the Atlantic,
and `users`, `farmMembers` and `auditLog` contain personal data (emails,
actor identities). The DPA cannot claim EU-only storage while `nam5` is the
backing store.

## Decision

**Migrate to an EU Firestore database before the first paying farm.** Treat
the current `nicola-milk-farm` project as the design-partner environment only
until that migration is done. This is a product/legal decision, not a code
change; it is not executed yet.

Rationale: location is immutable per database; migration cost is monotonic in
farm count. Three test farms is a few hours; fifty is a project. The pilot
can continue on `nam5` only with explicit informed consent and SCCs/TIA, which
does not fix latency and does not survive a co-op procurement review.

## Migration outline

1. Create `nicola-milk-farm-eu` (or recover the desired project id) with
   Firestore in `europe-west1`; enable Auth, Functions, Hosting, Scheduler.
2. Deploy `firestore.rules`, `firestore.indexes.json` (including the
   `fieldOverrides` for `feedingTriggerFailures.status`), functions and
   hosting.
3. Export the current Firestore data (`gcloud firestore export`) and import
   into the EU database; recreate Auth users or export/import them; re-run the
   membership backfill if needed.
4. Freeze writes, run the authenticated smoke on the EU project, then move
   the custom domain/hosting and update the client config and service account.
5. Keep the old project read-only for rollback for 30 days; delete only after
   the pilot confirms.

## Open

- Owner and deadline for the migration: **before the first paying farm**.
- If the client explicitly accepts US storage, record SCCs/TIA and the
  consent in the DPA; do not leave the decision implicit.
