#!/usr/bin/env bash
# Create the out-of-band alert for the scheduled feeding retry scan.
# Run once with an operator account that has Monitoring Admin:
#   OPS_EMAIL=ops@example.com ./scripts/setup-monitoring-alert.sh
set -euo pipefail

PROJECT="${PROJECT_ID:-nicola-milk-farm}"
EMAIL="${OPS_EMAIL:?Set OPS_EMAIL to the operator address}"
CHANNEL="$(gcloud monitoring channels create \
  --project="$PROJECT" \
  --type=email \
  --display-name="Milk Farm Ops" \
  --channel-labels=email_address="$EMAIL" \
  --format='value(name)')"

TMP="$(mktemp)"
cat > "$TMP" <<JSON
{
  "displayName": "Milk Farm feeding retry scan errors",
  "combiner": "OR",
  "conditions": [
    {
      "displayName": "Scheduled retry scan error",
      "conditionMatchedLog": {
        "filter": "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"scheduled-feeding-retry\" severity>=ERROR"
      }
    }
  ],
  "notificationChannels": ["$CHANNEL"],
  "alertStrategy": { "autoClose": "604800s" }
}
JSON

gcloud monitoring policies create \
  --project="$PROJECT" \
  --policy-from-file="$TMP"
rm -f "$TMP"
echo "Created alert policy routed to $EMAIL"
