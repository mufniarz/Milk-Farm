#!/usr/bin/env node
/* Verify the indexes required by the production queries are present. */
const fs = require('node:fs');
const path = require('node:path');

const file = path.resolve('firestore.indexes.json');
const { indexes = [], fieldOverrides = [] } = JSON.parse(
  fs.readFileSync(file, 'utf8'),
);

const signature = (index) => ({
  collectionGroup: index.collectionGroup,
  fields: (index.fields ?? []).map((field) => ({
    fieldPath: field.fieldPath,
    order: field.order ?? null,
    arrayConfig: field.arrayConfig ?? null,
  })),
});

const hasIndex = (collectionGroup, fields) =>
  indexes.some((index) => {
    const sig = signature(index);
    return (
      sig.collectionGroup === collectionGroup &&
      JSON.stringify(sig.fields) === JSON.stringify(fields)
    );
  });

const required = [
  ['scenarios', [
    { fieldPath: 'deletedAt', order: 'ASCENDING', arrayConfig: null },
    { fieldPath: 'createdAt', order: 'DESCENDING', arrayConfig: null },
  ]],
  ['farmMembers', [
    { fieldPath: 'uid', order: 'ASCENDING', arrayConfig: null },
    { fieldPath: 'status', order: 'ASCENDING', arrayConfig: null },
  ]],
  ['feedings', [
    { fieldPath: 'inventorySkippedFeedIds', order: null, arrayConfig: 'CONTAINS' },
    { fieldPath: 'status', order: 'ASCENDING', arrayConfig: null },
  ]],
  ['milkRecords', [
    { fieldPath: 'herdGroupId', order: 'ASCENDING', arrayConfig: null },
    { fieldPath: 'date', order: 'DESCENDING', arrayConfig: null },
  ]],
  ['feedingTriggerFailures', [
    { fieldPath: 'status', order: 'ASCENDING', arrayConfig: null },
    { fieldPath: 'deadAt', order: 'ASCENDING', arrayConfig: null },
  ], 'COLLECTION_GROUP'],
  ['feedingTriggerFailures', [
    { fieldPath: 'status', order: 'ASCENDING', arrayConfig: null },
    { fieldPath: 'resolvedAt', order: 'ASCENDING', arrayConfig: null },
  ], 'COLLECTION_GROUP'],
  ['feedingTriggerFailures', [
    { fieldPath: 'status', order: 'ASCENDING', arrayConfig: null },
    { fieldPath: 'resolvedAt', order: 'ASCENDING', arrayConfig: null },
  ]],
];

const missing = required.filter(
  ([collectionGroup, fields]) => !hasIndex(collectionGroup, fields),
);

// The scan's collection-group equality query needs a single-field
// COLLECTION_GROUP index, which Firestore only accepts via fieldOverrides.
const statusOverride = fieldOverrides.find(
  (override) =>
    override.collectionGroup === 'feedingTriggerFailures' &&
    override.fieldPath === 'status',
);
const hasCollectionGroupStatus = (statusOverride?.indexes ?? []).some(
  (index) =>
    index.queryScope === 'COLLECTION_GROUP' && index.order === 'ASCENDING',
);

if (missing.length > 0 || !hasCollectionGroupStatus) {
  if (missing.length > 0) {
    console.error('Missing Firestore indexes:');
    for (const [collectionGroup, fields] of missing) {
      console.error(`- ${collectionGroup}: ${fields.map((f) => f.fieldPath).join(', ')}`);
    }
  }
  if (!hasCollectionGroupStatus) {
    console.error(
      'Missing fieldOverrides entry: feedingTriggerFailures.status COLLECTION_GROUP ASC.',
    );
    console.error(
      'The scheduled scan fails with FAILED_PRECONDITION without it.',
    );
  }
  process.exit(1);
}

console.log('Firestore indexes OK: required composites and scan override present.');
