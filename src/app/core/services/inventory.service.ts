import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import {
  Firestore,
  collection,
  collectionData,
  orderBy,
  query,
  where,
} from '@angular/fire/firestore';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { Observable } from 'rxjs';
import { filter, switchMap } from 'rxjs/operators';
import {
  CAUTION_DAYS,
  InventoryCover,
  InventoryItem,
  InventoryTransaction,
  URGENT_DAYS,
} from '../models/inventory.model';
import { HerdGroup } from '../models/group.model';
import { FarmContextService } from './farm-context.service';
import { RecipeService } from './recipe.service';

export interface RecordDeliveryInput {
  farmId: string;
  feedId: string;
  quantityKgAsFed: number;
  unitCostPerKgAsFed: number;
  note?: string;
  idempotencyKey: string;
}

export interface AdjustInventoryInput {
  farmId: string;
  itemId: string;
  deltaKgAsFed: number;
  reason: string;
  idempotencyKey: string;
}

export interface UpsertInventoryItemInput {
  farmId: string;
  feedId: string;
  reorderPointDays?: number;
  location?: string;
  unitCostPerKgAsFed?: number;
}

/**
 * Feed inventory and its append-only ledger.
 *
 * All writes go through callables so the on-hand cache and the ledger entry
 * are written in one server-side transaction. The client only reads.
 */
@Injectable({ providedIn: 'root' })
export class InventoryService {
  private firestore = inject(Firestore);
  private functions = inject(Functions);
  private farmContext = inject(FarmContextService);
  private recipeService = inject(RecipeService);

  readonly loading = signal(false);

  private readonly farmId$ = toObservable(this.farmContext.activeFarmId).pipe(
    filter((id) => !!id),
  );

  getItems(): Observable<InventoryItem[]> {
    return this.farmId$.pipe(
      switchMap((farmId) => {
        const items = collection(
          this.firestore,
          'farms',
          farmId,
          'inventoryItems',
        );
        return collectionData(query(items), {
          idField: 'id',
        }) as Observable<InventoryItem[]>;
      }),
    );
  }

  getTransactions(itemId: string): Observable<InventoryTransaction[]> {
    return this.farmId$.pipe(
      switchMap((farmId) => {
        const transactions = collection(
          this.firestore,
          'farms',
          farmId,
          'inventoryTransactions',
        );
        return collectionData(
          query(
            transactions,
            where('itemId', '==', itemId),
            orderBy('createdAt', 'desc'),
          ),
          { idField: 'id' },
        ) as Observable<InventoryTransaction[]>;
      }),
    );
  }

  async upsertItem(input: UpsertInventoryItemInput): Promise<string> {
    const callable = httpsCallable<
      UpsertInventoryItemInput,
      { ok: boolean; itemId: string }
    >(this.functions, 'upsert_inventory_item');
    const result = await callable(input);
    return result.data.itemId;
  }

  async recordDelivery(input: RecordDeliveryInput): Promise<void> {
    const callable = httpsCallable<RecordDeliveryInput, { ok: boolean }>(
      this.functions,
      'record_delivery',
    );
    await callable(input);
  }

  async adjustInventory(input: AdjustInventoryInput): Promise<void> {
    const callable = httpsCallable<AdjustInventoryInput, { ok: boolean }>(
      this.functions,
      'adjust_inventory',
    );
    await callable(input);
  }

  /**
   * Days of cover per item, using the active recipe of each herd group.
   *
   * Usage is as-fed: for every group with an active recipe, each recipe line
   * contributes `kgAsFed x headCount` per day. Items without an active ration
   * are 'untracked' rather than 'urgent'.
   */
  async getCover(
    items: InventoryItem[],
    groups: HerdGroup[],
  ): Promise<InventoryCover[]> {
    const usageByFeed = new Map<string, number>();

    for (const group of groups) {
      if (!group.activeRecipeId || group.headCount <= 0) continue;
      try {
        const recipe = await this.recipeService.getRecipeWithFeeds(
          group.activeRecipeId,
        );
        for (const line of recipe?.feeds ?? []) {
          const usage = line.kgAsFed * group.headCount;
          usageByFeed.set(
            line.feedId,
            (usageByFeed.get(line.feedId) ?? 0) + usage,
          );
        }
      } catch (error) {
        console.warn(
          `Could not load active recipe ${group.activeRecipeId} for group ${group.id}`,
          error,
        );
      }
    }

    return items.map((item) => {
      const dailyUsageKgAsFed = usageByFeed.get(item.feedId) ?? 0;
      if (dailyUsageKgAsFed <= 0) {
        return {
          item,
          dailyUsageKgAsFed,
          daysOfCover: null,
          level: 'untracked' as const,
        };
      }
      const daysOfCover = item.onHandKgAsFed / dailyUsageKgAsFed;
      let level: InventoryCover['level'] = 'ok';
      if (daysOfCover < URGENT_DAYS) level = 'urgent';
      else if (daysOfCover < CAUTION_DAYS) level = 'caution';
      return { item, dailyUsageKgAsFed, daysOfCover, level };
    });
  }
}
