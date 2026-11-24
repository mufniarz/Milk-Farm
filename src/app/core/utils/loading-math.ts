/**
 * Pure loading-sheet math, kept free of Angular so it can be unit-tested
 * without Karma's component harness. The component delegates to these.
 */

export interface LoadingMathLine {
  feedId: string;
  feedName: string;
  calledKgAsFed: number;
  loadedKgAsFed: number;
}

export interface InventoryMathItem {
  feedId: string;
  onHandKgAsFed: number;
}

export interface OverdrawnFeed {
  feedId: string;
  feedName: string;
  onHandKgAsFed: number;
  consumptionKgAsFed: number;
  resultingKgAsFed: number;
}

/** Local calendar date as YYYY-MM-DD (not the UTC date). */
export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Called quantity for a line: recipe per-head kg x group head count. */
export function computeCalledKg(kgPerHead: number, headCount: number): number {
  return kgPerHead * headCount;
}

/**
 * Deviation percentage, or null when the called quantity is zero (division
 * by zero is not a 0% deviation; the UI renders it as n/a).
 */
export function computeDeviationPct(
  loadedKg: number,
  calledKg: number,
): number | null {
  if (!(calledKg > 0)) return null;
  return ((loadedKg - calledKg) / calledKg) * 100;
}

/** Unique feed ids in the load that have no inventory item. */
export function findUntrackedFeedIds(
  lines: readonly { feedId: string }[],
  trackedFeedIds: Iterable<string>,
): string[] {
  const tracked = new Set(trackedFeedIds);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const line of lines) {
    if (tracked.has(line.feedId) || seen.has(line.feedId)) continue;
    seen.add(line.feedId);
    result.push(line.feedId);
  }
  return result;
}

/**
 * Per-feed aggregate load that exceeds on-hand. The trigger still posts the
 * negative value (the feed left the mixer), but this is what the sheet warns
 * about before confirmation.
 */
export function findOverdrawnFeeds(
  lines: readonly LoadingMathLine[],
  items: readonly InventoryMathItem[],
): OverdrawnFeed[] {
  const onHand = new Map(items.map((item) => [item.feedId, item.onHandKgAsFed]));
  const totals = new Map<string, { feedName: string; loaded: number }>();

  for (const line of lines) {
    if (!onHand.has(line.feedId)) continue;
    const entry = totals.get(line.feedId) ?? {
      feedName: line.feedName,
      loaded: 0,
    };
    entry.loaded += line.loadedKgAsFed;
    totals.set(line.feedId, entry);
  }

  const result: OverdrawnFeed[] = [];
  for (const [feedId, entry] of totals) {
    const onHandKgAsFed = onHand.get(feedId) ?? 0;
    const resultingKgAsFed = onHandKgAsFed - entry.loaded;
    if (resultingKgAsFed < 0) {
      result.push({
        feedId,
        feedName: entry.feedName,
        onHandKgAsFed,
        consumptionKgAsFed: entry.loaded,
        resultingKgAsFed,
      });
    }
  }
  return result;
}
