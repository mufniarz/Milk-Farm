/**
 * Browser-free smoke test for the pure ration calculator.
 *
 * Runs the same numbers as the Angular spec without Karma, so the day-one
 * gate can verify the engine locally. The full Karma suite remains the CI
 * regression gate.
 *
 * Usage: npm run check:calculator
 *   (Node 24 strips the TypeScript types; no build step is needed.)
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateRation,
  groupTotals,
  isFeedingEditable,
} from '../src/app/core/utils/ration-calculator.ts';
import type { RationFeed } from '../src/app/core/utils/ration-calculator.ts';

interface ReferenceQuantity {
  id: string;
  name: string;
  kgAsFed: number;
}

interface ReferenceFeed extends RationFeed {
  id: string;
  name: string;
  dmFactor: number;
}

interface ReferenceRation {
  feeds: ReferenceFeed[];
  quantities: ReferenceQuantity[];
  analysis: Record<string, number>;
  totalAsFed: number;
  workbookTotalDM: number;
  solverTotalDM: number;
  costPerHead: number;
  groupTotal: number;
  totalLoadAsFed: number;
  costPerKgAsFed: number;
  headCount: number;
}

const root = process.cwd();
const references = JSON.parse(
  fs.readFileSync(
    path.join(root, 'functions/tests/reference_rations.json'),
    'utf8',
  ),
) as Record<string, ReferenceRation>;

let failures = 0;

function check(
  name: string,
  actual: number,
  expected: number,
  tol: number,
): void {
  const ok = Math.abs(actual - expected) <= tol;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}: ${actual} (expected ${expected} ± ${tol})`,
  );
  if (!ok) failures++;
}

function assert(name: string, condition: boolean): void {
  console.log(`${condition ? 'ok  ' : 'FAIL'} ${name}`);
  if (!condition) failures++;
}

function toFeeds(reference: ReferenceRation): RationFeed[] {
  return reference.feeds.map((feed) => ({
    moisturePct: (1 - feed.dmFactor) * 100,
    nutrients: feed.nutrients,
    pricePerKg: feed.pricePerKg,
    category: feed.category,
  }));
}

// Lactating: computed ration -> workbook values.
const lactating = references['lactating'];
// The sheet lists every feed; unused rows carry a zero quantity.
const lactatingQuantities = new Map(
  lactating.quantities.map((entry) => [entry.id, entry.kgAsFed]),
);
const lactatingResult = calculateRation(
  toFeeds(lactating),
  lactating.feeds.map((feed) => lactatingQuantities.get(feed.id) ?? 0),
);
check('lactating Kg t.q.', lactatingResult.totalAsFed, lactating.totalAsFed, 0.01);
check('lactating Kg s.s.', lactatingResult.totalDM, lactating.workbookTotalDM, 0.01);
check(
  'lactating costo razione',
  lactatingResult.totalCost,
  lactating.costPerHead,
  0.001,
);
for (const [code, expected] of Object.entries(lactating.analysis)) {
  check(`lactating ${code}`, lactatingResult.nutrients[code], expected, 0.03);
}

// Dry and heifer: per-head cost x head count = group total.
for (const groupId of ['dry', 'heifer']) {
  const reference = references[groupId];
  const totals = groupTotals(
    reference.costPerHead,
    reference.headCount,
    reference.totalAsFed,
  );
  check(`${groupId} headCount`, totals.headCount, reference.headCount, 0);
  check(
    `${groupId} totale carico`,
    totals.totalLoadAsFed,
    reference.totalLoadAsFed,
    0.01,
  );
  check(`${groupId} costo razione`, totals.totalCost, reference.groupTotal, 0.001);
  check(
    `${groupId} costo al kg`,
    totals.costPerKgAsFed,
    reference.costPerKgAsFed,
    0.001,
  );
}

// The client guard must mirror the Firestore rule.
assert('draft feeding editable', isFeedingEditable('draft') === true);
assert('confirmed feeding not editable', isFeedingEditable('confirmed') === false);

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll calculator checks passed');
