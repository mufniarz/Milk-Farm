/**
 * Inventory is tracked in **as-fed** kilograms: feed leaves the mixer as fed,
 * not as dry matter. Every field name carries the unit to keep the workbook's
 * side-by-side t.q. / s.s. columns from leaking into the wrong calculation.
 */

/** Stored at `/farms/{farmId}/inventoryItems/{itemId}`. */
export interface InventoryItem {
  id?: string;
  feedId: string;
  /** Denormalized for display without an extra read. */
  feedName?: string;
  onHandKgAsFed: number;
  /** Days of cover below which the dashboard warns. */
  reorderPointDays: number;
  location: string;
  unitCostPerKgAsFed: number;
  updatedAt?: Date;
}

export type InventoryTransactionType =
  | 'opening'
  | 'delivery'
  | 'consumption'
  | 'adjustment';

/**
 * Append-only ledger at `/farms/{farmId}/inventoryTransactions/{txId}`.
 * `deltaKgAsFed` is signed: deliveries and openings are positive,
 * consumption is negative, adjustments may be either.
 */
export interface InventoryTransaction {
  id?: string;
  itemId: string;
  type: InventoryTransactionType;
  deltaKgAsFed: number;
  unitCostPerKgAsFed: number;
  sourceType: 'manual' | 'feeding' | 'retroactive' | 'abandoned';
  sourceId: string;
  /** The feeding's local date; the ledger timestamp is when it was written. */
  date?: string;
  idempotencyKey: string;
  createdBy?: string;
  createdAt?: Date;
  note?: string;
}

/** A feed's projected stock position at the current feeding rate. */
export interface InventoryCover {
  item: InventoryItem;
  dailyUsageKgAsFed: number;
  /** Clamped to 0 when on-hand is negative; see shortfallKgAsFed. */
  daysOfCover: number | null;
  level: 'ok' | 'caution' | 'urgent' | 'untracked' | 'overdrawn';
  /** How far below zero the on-hand cache is. */
  shortfallKgAsFed?: number;
}

export const URGENT_DAYS = 5;
export const CAUTION_DAYS = 10;
