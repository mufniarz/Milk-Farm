/**
 * One day's milk record for a herd group, stored at
 * `/farms/{farmId}/milkRecords/{herdGroupId}_{date}`.
 *
 * `milkKg` is the whole-group total for the day; per-cow figures are derived
 * by dividing by the group head count. `feedCostPerHeadSnapshot` preserves
 * the feed cost used at entry time, so a later recipe change does not rewrite
 * history.
 */
export interface MilkRecord {
  id?: string;
  farmId: string;
  herdGroupId: string;
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  milkKg: number;
  milkPricePerKg: number;
  fatPct?: number | null;
  proteinPct?: number | null;
  feedCostPerHeadSnapshot?: number | null;
  /** Head count at entry time, so historical IOFC does not move. */
  headCountSnapshot?: number | null;
  /** True when the snapshot came from the day's confirmed feeding. */
  hasFeedingSnapshot?: boolean;
  /** Number of confirmed feedings used for the snapshot. */
  feedingCountAtSnapshot?: number | null;
  source: 'manual' | 'import';
  updatedAt?: Date;
}
