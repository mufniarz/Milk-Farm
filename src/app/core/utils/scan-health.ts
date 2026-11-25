/** Scan freshness is a pure function so the banner condition is testable. */
export interface ScanTimestampLike {
  toDate?(): Date;
}

export function isScanStale(
  lastRunAt: Date | ScanTimestampLike | undefined | null,
  now: number = Date.now(),
  thresholdMs: number = 15 * 60 * 1000,
): boolean {
  if (!lastRunAt) return true;
  const date =
    lastRunAt instanceof Date
      ? lastRunAt
      : typeof lastRunAt.toDate === 'function'
        ? lastRunAt.toDate()
        : null;
  if (!date) return true;
  return now - date.getTime() > thresholdMs;
}
