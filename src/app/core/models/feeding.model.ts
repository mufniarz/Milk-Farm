/**
 * A feeding event: the ration that was actually loaded for one herd group.
 *
 * Stored at `/farms/{farmId}/feedings/{feedingId}`. `lineId` is a per-line
 * UUID, not the feed id: the same feed can appear twice in one load (for
 * example two silage batches), and the inventory trigger must post each line
 * exactly once.
 */
export interface FeedingLine {
  lineId: string;
  feedId: string;
  feedName: string;
  /** Recipe quantity x head count, in kg as fed. */
  calledKgAsFed: number;
  /** What the feeder actually loaded, in kg as fed. */
  loadedKgAsFed: number;
  costPerKgAsFed: number;
}

export type FeedingStatus = 'draft' | 'confirmed';

export interface Feeding {
  id?: string;
  farmId: string;
  /** YYYY-MM-DD. */
  date: string;
  herdGroupId: string;
  recipeId: string;
  /** Snapshot of the group head count at load time. */
  animalCount: number;
  feederId: string;
  status: FeedingStatus;
  lines: FeedingLine[];
  /** Refusals/weighback, in kg as fed; affects intake, not inventory. */
  refusedKgAsFed: number;
  idempotencyKey: string;
  /** Set by the inventory trigger; a client must never write it. */
  inventoryPostedAt?: Date | null;
  inventoryPostedLines?: number;
  /** Lines whose feed had no inventory item; the trigger could not post them. */
  inventorySkippedLines?: {
    lineId: string;
    feedId: string;
    feedName: string;
  }[];
  /** Feeds whose load exceeded on-hand; the ledger keeps the negative value. */
  inventoryOverdrawn?: {
    feedId: string;
    feedName: string;
    onHandKgAsFed: number;
    consumptionKgAsFed: number;
    resultingKgAsFed: number;
  }[];
  createdBy?: string;
  createdAt?: Date;
  confirmedAt?: Date | null;
}
