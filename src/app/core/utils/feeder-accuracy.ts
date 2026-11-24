/**
 * Pure feeder-accuracy report math. One CSV row per feeding line; the
 * on-screen report aggregates those rows by feeder and ingredient.
 *
 * Drafts are excluded (a draft is not a load). Confirmed feedings are
 * included even while inventory is still posting; the `status` column says
 * `posted` or `pending`. Corrections are counted and flagged, never dropped.
 */
import { Feeding } from '../models/feeding.model';
import { computeDeviationPct } from './loading-math';

export interface AccuracyRow {
  date: string;
  herdGroupId: string;
  feederId: string;
  feedId: string;
  feedName: string;
  calledKgAsFed: number;
  loadedKgAsFed: number;
  deviationPct: number | null;
  refusedKgAsFed: number;
  status: 'posted' | 'pending';
  isCorrection: boolean;
  hasOverdrawn: boolean;
  hasSkipped: boolean;
}

export interface IngredientAccuracy {
  feedId: string;
  feedName: string;
  meanAbsDeviationPct: number;
  loadWeightedDeviationPct: number;
  lineCount: number;
}

export interface WeeklyAccuracy {
  weekStart: string;
  meanAbsDeviationPct: number;
  lineCount: number;
}

export interface FeederAccuracy {
  feederId: string;
  loadCount: number;
  lineCount: number;
  meanAbsDeviationPct: number;
  loadWeightedDeviationPct: number;
  overdrawnLoads: number;
  skippedLoads: number;
  worstIngredients: IngredientAccuracy[];
  weekly: WeeklyAccuracy[];
}

/** Confirmed feeding lines, drafts excluded. */
export function buildAccuracyRows(feedings: readonly Feeding[]): AccuracyRow[] {
  const rows: AccuracyRow[] = [];
  for (const feeding of feedings) {
    if (feeding.status !== 'confirmed') continue;
    const status: AccuracyRow['status'] = feeding.inventoryPostedAt
      ? 'posted'
      : 'pending';
    const hasOverdrawn = (feeding.inventoryOverdrawn?.length ?? 0) > 0;
    const hasSkipped = (feeding.inventorySkippedLines?.length ?? 0) > 0;
    for (const line of feeding.lines ?? []) {
      rows.push({
        date: feeding.date,
        herdGroupId: feeding.herdGroupId,
        feederId: feeding.feederId,
        feedId: line.feedId,
        feedName: line.feedName,
        calledKgAsFed: line.calledKgAsFed,
        loadedKgAsFed: line.loadedKgAsFed,
        deviationPct: computeDeviationPct(
          line.loadedKgAsFed,
          line.calledKgAsFed,
        ),
        refusedKgAsFed: feeding.refusedKgAsFed,
        status,
        isCorrection: !!feeding.correctsFeedingId,
        hasOverdrawn,
        hasSkipped,
      });
    }
  }
  return rows;
}

/** Keep rows on/after the cutoff date (YYYY-MM-DD). */
export function filterRowsSince(rows: readonly AccuracyRow[], days: number, now = new Date()): AccuracyRow[] {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - Math.max(1, days));
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  return rows.filter((row) => row.date >= cutoffKey);
}

/**
 * Aggregate by feeder. The per-ingredient deviation is the mean absolute
 * percentage deviation; the load-weighted figure is
 * sum(|loaded - called|) / sum(called).
 */
export function summarizeByFeeder(rows: readonly AccuracyRow[]): FeederAccuracy[] {
  const byFeeder = new Map<string, AccuracyRow[]>();
  for (const row of rows) {
    const list = byFeeder.get(row.feederId) ?? [];
    list.push(row);
    byFeeder.set(row.feederId, list);
  }

  const result: FeederAccuracy[] = [];
  for (const [feederId, feederRows] of byFeeder) {
    const deviations = feederRows
      .map((row) => row.deviationPct)
      .filter((value): value is number => value !== null);
    const meanAbs = mean(deviations.map((value) => Math.abs(value)));

    let calledSum = 0;
    let absDeltaSum = 0;
    for (const row of feederRows) {
      if (!(row.calledKgAsFed > 0)) continue;
      calledSum += row.calledKgAsFed;
      absDeltaSum += Math.abs(row.loadedKgAsFed - row.calledKgAsFed);
    }
    const weighted = calledSum > 0 ? (absDeltaSum / calledSum) * 100 : 0;

    const byIngredient = new Map<string, AccuracyRow[]>();
    for (const row of feederRows) {
      const list = byIngredient.get(row.feedId) ?? [];
      list.push(row);
      byIngredient.set(row.feedId, list);
    }
    const ingredients: IngredientAccuracy[] = [];
    for (const [feedId, ingredientRows] of byIngredient) {
      const values = ingredientRows
        .map((row) => row.deviationPct)
        .filter((value): value is number => value !== null)
        .map((value) => Math.abs(value));
      let ingredientCalled = 0;
      let ingredientDelta = 0;
      for (const row of ingredientRows) {
        if (!(row.calledKgAsFed > 0)) continue;
        ingredientCalled += row.calledKgAsFed;
        ingredientDelta += Math.abs(row.loadedKgAsFed - row.calledKgAsFed);
      }
      ingredients.push({
        feedId,
        feedName: ingredientRows[0]?.feedName ?? feedId,
        meanAbsDeviationPct: mean(values),
        loadWeightedDeviationPct:
          ingredientCalled > 0 ? (ingredientDelta / ingredientCalled) * 100 : 0,
        lineCount: ingredientRows.length,
      });
    }
    ingredients.sort(
      (a, b) => b.meanAbsDeviationPct - a.meanAbsDeviationPct,
    );

    result.push({
      feederId,
      loadCount: new Set(feederRows.map((row) => `${row.date}|${row.herdGroupId}`))
        .size,
      lineCount: feederRows.length,
      meanAbsDeviationPct: meanAbs,
      loadWeightedDeviationPct: weighted,
      overdrawnLoads: uniqueLoadCount(
        feederRows.filter((row) => row.hasOverdrawn),
      ),
      skippedLoads: uniqueLoadCount(
        feederRows.filter((row) => row.hasSkipped),
      ),
      worstIngredients: ingredients.slice(0, 3),
      weekly: summarizeWeeks(feederRows),
    });
  }

  result.sort((a, b) => b.meanAbsDeviationPct - a.meanAbsDeviationPct);
  return result;
}

function summarizeWeeks(rows: readonly AccuracyRow[]): WeeklyAccuracy[] {
  const byWeek = new Map<string, number[]>();
  for (const row of rows) {
    if (row.deviationPct === null) continue;
    const weekStart = mondayOf(row.date);
    const list = byWeek.get(weekStart) ?? [];
    list.push(Math.abs(row.deviationPct));
    byWeek.set(weekStart, list);
  }
  return [...byWeek.entries()]
    .map(([weekStart, values]) => ({
      weekStart,
      meanAbsDeviationPct: mean(values),
      lineCount: values.length,
    }))
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

function mondayOf(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  const day = value.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  value.setUTCDate(value.getUTCDate() - offset);
  return value.toISOString().slice(0, 10);
}

function uniqueLoadCount(rows: readonly AccuracyRow[]): number {
  return new Set(rows.map((row) => `${row.date}|${row.herdGroupId}`)).size;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * CSV for the Italian market: `;` delimiter and `,` decimal by default,
 * with a UTF-8 BOM so Excel opens it correctly. One row per line.
 */
export function accuracyRowsToCsv(
  rows: readonly AccuracyRow[],
  delimiter = ';',
  decimal = ',',
): string {
  const header = [
    'date',
    'herdGroupId',
    'feederId',
    'feedId',
    'feedName',
    'calledKgAsFed',
    'loadedKgAsFed',
    'deviationPct',
    'refusedKgAsFed',
    'status',
    'isCorrection',
    'hasOverdrawn',
    'hasSkipped',
  ];
  const escape = (value: string): string => {
    if (
      value.includes(delimiter) ||
      value.includes('"') ||
      value.includes('\n') ||
      value.includes('\r')
    ) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };
  const number = (value: number | null): string =>
    value === null ? '' : String(value).replace('.', decimal);
  const lines = rows.map((row) =>
    [
      row.date,
      row.herdGroupId,
      row.feederId,
      row.feedId,
      row.feedName,
      number(row.calledKgAsFed),
      number(row.loadedKgAsFed),
      number(row.deviationPct),
      number(row.refusedKgAsFed),
      row.status,
      row.isCorrection ? 'true' : 'false',
      row.hasOverdrawn ? 'true' : 'false',
      row.hasSkipped ? 'true' : 'false',
    ]
      .map((value) => escape(String(value)))
      .join(delimiter),
  );
  return `\uFEFF${[header.join(delimiter), ...lines].join('\r\n')}\r\n`;
}
