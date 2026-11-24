import { Feeding } from '../models/feeding.model';
import {
  accuracyRowsToCsv,
  buildAccuracyRows,
  filterRowsSince,
  summarizeByFeeder,
} from './feeder-accuracy';

function feeding(overrides: Partial<Feeding> = {}): Feeding {
  return {
    id: 'feeding-1',
    farmId: 'f1',
    date: '2026-11-20',
    herdGroupId: 'g1',
    recipeId: 'r1',
    animalCount: 100,
    feederId: 'feeder-1',
    status: 'confirmed',
    refusedKgAsFed: 5,
    idempotencyKey: 'k1',
    inventoryPostedAt: new Date(),
    lines: [
      {
        lineId: 'l1',
        feedId: 'silage',
        feedName: 'Silage',
        calledKgAsFed: 100,
        loadedKgAsFed: 110,
        costPerKgAsFed: 0.1,
      },
      {
        lineId: 'l2',
        feedId: 'silage',
        feedName: 'Silage',
        calledKgAsFed: 100,
        loadedKgAsFed: 90,
        costPerKgAsFed: 0.1,
      },
      {
        lineId: 'l3',
        feedId: 'hay',
        feedName: 'Hay',
        calledKgAsFed: 50,
        loadedKgAsFed: 50,
        costPerKgAsFed: 0.2,
      },
    ],
    ...overrides,
  };
}

describe('feeder accuracy math', () => {
  it('excludes drafts and includes confirmed-pending feedings', () => {
    const rows = buildAccuracyRows([
      feeding({ status: 'draft' }),
      feeding({ inventoryPostedAt: null }),
    ]);

    expect(rows.length).toBe(3);
    expect(rows.every((row) => row.status === 'pending')).toBeTrue();
  });

  it('flags corrections, overdrawn and skipped feedings', () => {
    const rows = buildAccuracyRows([
      feeding({
        correctsFeedingId: 'earlier',
        inventoryOverdrawn: [
          {
            feedId: 'silage',
            feedName: 'Silage',
            onHandKgAsFed: 50,
            consumptionKgAsFed: 110,
            resultingKgAsFed: -60,
          },
        ],
        inventorySkippedLines: [
          { lineId: 'l9', feedId: 'hay', feedName: 'Hay' },
        ],
      }),
    ]);

    expect(rows[0].isCorrection).toBeTrue();
    expect(rows[0].hasOverdrawn).toBeTrue();
    expect(rows[0].hasSkipped).toBeTrue();
  });

  it('aggregates mean absolute and load-weighted deviation per feeder', () => {
    const rows = buildAccuracyRows([feeding()]);
    const [summary] = summarizeByFeeder(rows);

    // |+10|, |-10|, |0| -> mean 6.666...; (10 + 10 + 0) / 250 = 8%.
    expect(summary.meanAbsDeviationPct).toBeCloseTo(20 / 3, 6);
    expect(summary.loadWeightedDeviationPct).toBeCloseTo(8, 6);
    expect(summary.worstIngredients[0].feedId).toBe('silage');
    expect(summary.worstIngredients[0].meanAbsDeviationPct).toBeCloseTo(10, 6);
    expect(summary.loadedKgAsFed).toBe(250);
    expect(summary.refusedKgAsFed).toBe(5);
    expect(summary.intakeEfficiencyPct).toBeCloseTo(98, 6);
    expect(summary.weekly.length).toBe(1);
    expect(summary.weekly[0].weekStart).toBe('2026-11-16');
  });

  it('returns null intake efficiency when nothing was loaded', () => {
    const rows = buildAccuracyRows([
      feeding({
        refusedKgAsFed: 5,
        lines: [
          {
            lineId: 'z1',
            feedId: 'hay',
            feedName: 'Hay',
            calledKgAsFed: 0,
            loadedKgAsFed: 0,
            costPerKgAsFed: 0.2,
          },
        ],
      }),
    ]);
    const [summary] = summarizeByFeeder(rows);
    expect(summary.loadedKgAsFed).toBe(0);
    expect(summary.intakeEfficiencyPct).toBeNull();
  });

  it('returns an empty summary for an empty window', () => {
    expect(summarizeByFeeder([])).toEqual([]);
  });

  it('ignores zero-called lines in the deviations but keeps them in the rows', () => {
    const rows = buildAccuracyRows([
      feeding({
        lines: [
          {
            lineId: 'z1',
            feedId: 'hay',
            feedName: 'Hay',
            calledKgAsFed: 0,
            loadedKgAsFed: 10,
            costPerKgAsFed: 0.2,
          },
        ],
      }),
    ]);
    expect(rows.length).toBe(1);
    expect(rows[0].deviationPct).toBeNull();
    const [summary] = summarizeByFeeder(rows);
    expect(summary.meanAbsDeviationPct).toBe(0);
    expect(summary.loadWeightedDeviationPct).toBe(0);
  });

  it('breaks worst-ingredient ties alphabetically', () => {
    const rows = buildAccuracyRows([
      feeding({
        lines: [
          {
            lineId: 'a',
            feedId: 'z-feed',
            feedName: 'Zeta',
            calledKgAsFed: 100,
            loadedKgAsFed: 110,
            costPerKgAsFed: 0.1,
          },
          {
            lineId: 'b',
            feedId: 'a-feed',
            feedName: 'Alfa',
            calledKgAsFed: 100,
            loadedKgAsFed: 110,
            costPerKgAsFed: 0.1,
          },
        ],
      }),
    ]);
    const [summary] = summarizeByFeeder(rows);
    expect(summary.worstIngredients.map((item) => item.feedName)).toEqual([
      'Alfa',
      'Zeta',
    ]);
  });

  it('filters rows by the report window', () => {
    const rows = buildAccuracyRows([
      feeding({ date: '2026-11-20' }),
      feeding({ date: '2026-06-01' }),
    ]);
    const recent = filterRowsSince(rows, 28, new Date('2026-11-24T00:00:00Z'));
    expect(recent.every((row) => row.date >= '2026-10-27')).toBeTrue();
  });

  it('writes the Italian CSV shape with a BOM, semicolons and comma decimals', () => {
    const rows = buildAccuracyRows([
      feeding({
        lines: [
          {
            lineId: 'l1',
            feedId: 'silage',
            feedName: 'Silage',
            calledKgAsFed: 100,
            loadedKgAsFed: 110.5,
            costPerKgAsFed: 0.1,
          },
        ],
      }),
    ]);

    const csv = accuracyRowsToCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('date;herdGroupId;feederId');
    expect(csv).toContain('110,5');
    expect(csv).toContain('10,5');
    expect(csv).toContain('feeder-1');
  });
});
