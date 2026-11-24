import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Feed } from '../../core/models/feed.model';
import { HerdGroup } from '../../core/models/group.model';
import {
  InventoryCover,
  InventoryItem,
} from '../../core/models/inventory.model';
import { FeedService } from '../../core/services/feed.service';
import { GroupService } from '../../core/services/group.service';
import { InventoryService } from '../../core/services/inventory.service';
import { FeedingService } from '../../core/services/feeding.service';
import { FarmContextService } from '../../core/services/farm-context.service';

/**
 * Feed inventory and the manual ledger.
 *
 * The loading sheet and its automatic depletion are the next increment; this
 * screen proves the ledger mechanics (transactional on-hand + append-only
 * entries) and the days-of-cover signal the pilot needs.
 */
@Component({
  selector: 'mf-inventory',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatSnackBarModule,
    TranslatePipe,
  ],
  template: `
    <div class="inventory-page">
      <h1 class="page-title">{{ 'INVENTORY.TITLE' | translate }}</h1>
      <p class="page-subtitle">{{ 'INVENTORY.SUBTITLE' | translate }}</p>

      @if (overdrawnCount > 0) {
        <div class="alert urgent">
          {{ overdrawnCount }} {{ 'INVENTORY.OVERDRAWN_ALERT' | translate }}
        </div>
      } @else if (urgentCount > 0) {
        <div class="alert urgent">
          {{ urgentCount }} {{ 'INVENTORY.URGENT_ALERT' | translate }}
        </div>
      } @else if (cautionCount > 0) {
        <div class="alert caution">
          {{ cautionCount }} {{ 'INVENTORY.CAUTION_ALERT' | translate }}
        </div>
      }

      @if (pendingSkippedFeedIds.size > 0) {
        <div class="alert caution">
          {{ 'INVENTORY.PENDING_SKIPPED' | translate }}:
          {{ pendingSkippedNames() }}
        </div>
      }

      <mat-card appearance="outlined" class="form-card">
        <mat-card-content class="form-grid">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'INVENTORY.FEED' | translate }}</mat-label>
            <mat-select [(ngModel)]="itemDraft.feedId">
              @for (feed of feeds; track feed.id) {
                <mat-option [value]="feed.id">{{ feed.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'INVENTORY.REORDER_DAYS' | translate }}</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="itemDraft.reorderPointDays" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'INVENTORY.LOCATION' | translate }}</mat-label>
            <input matInput [(ngModel)]="itemDraft.location" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'INVENTORY.UNIT_COST' | translate }}</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="itemDraft.unitCostPerKgAsFed" />
          </mat-form-field>
          <button
            mat-flat-button
            color="primary"
            (click)="createItem()"
            [disabled]="saving || !itemDraft.feedId"
          >
            {{ 'INVENTORY.ADD_ITEM' | translate }}
          </button>
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined">
        <mat-card-content>
          <div class="item-header">
            <span>{{ 'INVENTORY.FEED' | translate }}</span>
            <span>{{ 'INVENTORY.ON_HAND' | translate }}</span>
            <span>{{ 'INVENTORY.DAILY_USE' | translate }}</span>
            <span>{{ 'INVENTORY.DAYS' | translate }}</span>
            <span>{{ 'INVENTORY.LOCATION' | translate }}</span>
            <span></span>
          </div>
          @for (cover of covers; track cover.item.id) {
            <div class="item-row">
              <span class="feed-name">
                {{ cover.item.feedName || cover.item.feedId }}
                @if (pendingSkippedFeedIds.has(cover.item.feedId)) {
                  <mat-icon class="pending-icon">warning</mat-icon>
                }
              </span>
              <span>{{ cover.item.onHandKgAsFed | number: '1.0-0' }} kg</span>
              <span>{{ cover.dailyUsageKgAsFed | number: '1.0-0' }} kg</span>
              <span [class]="'level ' + cover.level">
                @if (cover.level === 'overdrawn') {
                  {{ 'INVENTORY.OVERDRAWN_BY' | translate }}
                  {{ cover.shortfallKgAsFed | number: '1.0-0' }} kg
                } @else if (cover.daysOfCover === null) {
                  {{ 'INVENTORY.UNTRACKED' | translate }}
                } @else {
                  {{ cover.daysOfCover | number: '1.1-1' }}
                }
              </span>
              <span>{{ cover.item.location || '—' }}</span>
              <button mat-icon-button (click)="selectItem(cover.item)">
                <mat-icon>playlist_add</mat-icon>
              </button>
            </div>
          } @empty {
            <p class="empty">{{ 'INVENTORY.EMPTY' | translate }}</p>
          }
        </mat-card-content>
      </mat-card>

      @if (selectedItem) {
        <mat-card appearance="outlined" class="form-card">
          <mat-card-header>
            <mat-card-title>
              {{ selectedItem.feedName || selectedItem.feedId }}
            </mat-card-title>
          </mat-card-header>
          <mat-card-content class="movement-grid">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'INVENTORY.DELIVERY_QTY' | translate }}</mat-label>
              <input matInput type="number" min="0" [(ngModel)]="delivery.quantityKgAsFed" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'INVENTORY.UNIT_COST' | translate }}</mat-label>
              <input matInput type="number" min="0" [(ngModel)]="delivery.unitCostPerKgAsFed" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'INVENTORY.NOTE' | translate }}</mat-label>
              <input matInput [(ngModel)]="delivery.note" />
            </mat-form-field>
            <button
              mat-flat-button
              color="primary"
              (click)="recordDelivery()"
              [disabled]="saving"
            >
              {{ 'INVENTORY.RECORD_DELIVERY' | translate }}
            </button>

            <mat-form-field appearance="outline">
              <mat-label>{{ 'INVENTORY.ADJUST_DELTA' | translate }}</mat-label>
              <input matInput type="number" [(ngModel)]="adjustment.deltaKgAsFed" />
            </mat-form-field>
            <mat-form-field appearance="outline">
              <mat-label>{{ 'INVENTORY.REASON' | translate }}</mat-label>
              <input matInput [(ngModel)]="adjustment.reason" />
            </mat-form-field>
            <button
              mat-stroked-button
              color="primary"
              (click)="adjust()"
              [disabled]="saving"
            >
              {{ 'INVENTORY.ADJUST' | translate }}
            </button>
            @if (canAdmin) {
              <button
                mat-stroked-button
                (click)="postSkipped(selectedItem)"
                [disabled]="saving"
              >
                {{ 'INVENTORY.RETRO_POST' | translate }}
              </button>
            }
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: `
    .inventory-page {
      max-width: 1150px;
    }
    .page-title {
      font-size: 28px;
      font-weight: 700;
      margin: 0 0 4px;
    }
    .page-subtitle {
      color: rgba(0, 0, 0, 0.55);
      margin: 0 0 20px;
    }
    .alert {
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-weight: 600;
    }
    .alert.urgent {
      background: #fdecea;
      color: #a02525;
    }
    .alert.caution {
      background: #fff4e0;
      color: #8a5300;
    }
    .form-card {
      margin-bottom: 16px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1.5fr 0.8fr 1fr 0.9fr auto;
      gap: 12px;
      align-items: center;
    }
    .movement-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr) auto;
      gap: 12px;
      align-items: center;
    }
    .item-header,
    .item-row {
      display: grid;
      grid-template-columns: 1.5fr 1fr 1fr 0.8fr 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 8px 4px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    .item-header {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: rgba(0, 0, 0, 0.5);
      border-bottom: 1px solid rgba(0, 0, 0, 0.15);
    }
    .feed-name {
      font-weight: 600;
    }
    .level {
      font-weight: 600;
    }
    .level.urgent {
      color: #a02525;
    }
    .level.caution {
      color: #8a5300;
    }
    .level.ok {
      color: #2b7a5b;
    }
    .level.untracked {
      color: rgba(0, 0, 0, 0.4);
    }
    .level.overdrawn {
      color: #a02525;
    }
    .pending-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      color: #8a5300;
      vertical-align: middle;
      margin-left: 4px;
    }
    .empty {
      color: rgba(0, 0, 0, 0.5);
      padding: 16px 4px;
    }
    @media (max-width: 800px) {
      .form-grid,
      .movement-grid,
      .item-header,
      .item-row {
        grid-template-columns: 1fr;
      }
      .item-header {
        display: none;
      }
    }
  `,
})
export class InventoryComponent implements OnInit {
  private feedService = inject(FeedService);
  private groupService = inject(GroupService);
  private inventoryService = inject(InventoryService);
  private feedingService = inject(FeedingService);
  private farmContext = inject(FarmContextService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  feeds: Feed[] = [];
  groups: HerdGroup[] = [];
  items: InventoryItem[] = [];
  covers: InventoryCover[] = [];
  pendingSkippedFeedIds = new Set<string>();
  selectedItem: InventoryItem | null = null;
  saving = false;

  itemDraft = {
    feedId: '',
    reorderPointDays: 7,
    location: '',
    unitCostPerKgAsFed: 0,
  };

  delivery = {
    quantityKgAsFed: 0,
    unitCostPerKgAsFed: 0,
    note: '',
  };

  adjustment = {
    deltaKgAsFed: 0,
    reason: '',
  };

  readonly loading = signal(false);

  get canViewFeedings(): boolean {
    const role = this.farmContext.activeRole();
    return role === 'owner' || role === 'farmAdmin' || role === 'consultant';
  }

  get canAdmin(): boolean {
    const role = this.farmContext.activeRole();
    return role === 'owner' || role === 'farmAdmin';
  }

  get overdrawnCount(): number {
    return this.covers.filter((cover) => cover.level === 'overdrawn').length;
  }

  get urgentCount(): number {
    return this.covers.filter((cover) => cover.level === 'urgent').length;
  }

  get cautionCount(): number {
    return this.covers.filter((cover) => cover.level === 'caution').length;
  }

  ngOnInit(): void {
    this.feedService
      .getFeeds()
      .subscribe((feeds) => (this.feeds = feeds));
    this.groupService
      .getGroups()
      .subscribe((groups) => {
        this.groups = groups;
        void this.refreshCover();
      });
    this.inventoryService
      .getItems()
      .subscribe((items) => {
        this.items = items;
        void this.refreshCover();
      });
    if (this.canViewFeedings) {
      this.feedingService.getFeedings().subscribe((feedings) => {
        const ids = new Set<string>();
        for (const feeding of feedings) {
          for (const feedId of feeding.inventorySkippedFeedIds ?? []) {
            ids.add(feedId);
          }
        }
        this.pendingSkippedFeedIds = ids;
      });
    }
  }

  pendingSkippedNames(): string {
    return this.items
      .filter((item) => this.pendingSkippedFeedIds.has(item.feedId))
      .map((item) => item.feedName || item.feedId)
      .join(', ');
  }

  private async refreshCover(): Promise<void> {
    this.covers = await this.inventoryService.getCover(this.items, this.groups);
  }

  selectItem(item: InventoryItem): void {
    this.selectedItem = item;
    this.delivery = {
      quantityKgAsFed: 0,
      unitCostPerKgAsFed: item.unitCostPerKgAsFed,
      note: '',
    };
    this.adjustment = { deltaKgAsFed: 0, reason: '' };
  }

  async createItem(): Promise<void> {
    if (!this.itemDraft.feedId) return;
    this.saving = true;
    try {
      await this.inventoryService.upsertItem({
        farmId: this.farmContext.activeFarmId(),
        feedId: this.itemDraft.feedId,
        reorderPointDays: this.itemDraft.reorderPointDays,
        location: this.itemDraft.location,
        unitCostPerKgAsFed: this.itemDraft.unitCostPerKgAsFed,
      });
      this.itemDraft = {
        feedId: '',
        reorderPointDays: 7,
        location: '',
        unitCostPerKgAsFed: 0,
      };
    } finally {
      this.saving = false;
    }
  }

  async recordDelivery(): Promise<void> {
    if (!this.selectedItem) return;
    this.saving = true;
    try {
      await this.inventoryService.recordDelivery({
        farmId: this.farmContext.activeFarmId(),
        feedId: this.selectedItem.feedId,
        quantityKgAsFed: this.delivery.quantityKgAsFed,
        unitCostPerKgAsFed: this.delivery.unitCostPerKgAsFed,
        note: this.delivery.note,
        idempotencyKey: crypto.randomUUID(),
      });
      this.delivery = {
        quantityKgAsFed: 0,
        unitCostPerKgAsFed: this.selectedItem.unitCostPerKgAsFed,
        note: '',
      };
      await this.refreshCover();
      this.snackBar.open(
        this.translate.instant('INVENTORY.DELIVERY_SAVED'),
        undefined,
        { duration: 3000 },
      );
    } finally {
      this.saving = false;
    }
  }

  async postSkipped(item: InventoryItem): Promise<void> {
    this.saving = true;
    try {
      const result = await this.inventoryService.postSkipped(item.feedId);
      await this.refreshCover();
      this.snackBar.open(
        `${this.translate.instant('INVENTORY.RETRO_POSTED')}: ${result.postedLines}`,
        undefined,
        { duration: 4000 },
      );
    } catch (error) {
      console.error('Failed to post skipped consumption', error);
      this.snackBar.open(
        this.translate.instant('INVENTORY.RETRO_FAILED'),
        undefined,
        { duration: 5000 },
      );
    } finally {
      this.saving = false;
    }
  }

  async adjust(): Promise<void> {
    if (!this.selectedItem) return;
    this.saving = true;
    try {
      await this.inventoryService.adjustInventory({
        farmId: this.farmContext.activeFarmId(),
        itemId: this.selectedItem.id ?? this.selectedItem.feedId,
        deltaKgAsFed: this.adjustment.deltaKgAsFed,
        reason: this.adjustment.reason,
        idempotencyKey: crypto.randomUUID(),
      });
      this.adjustment = { deltaKgAsFed: 0, reason: '' };
      await this.refreshCover();
      this.snackBar.open(
        this.translate.instant('INVENTORY.ADJUST_SAVED'),
        undefined,
        { duration: 3000 },
      );
    } finally {
      this.saving = false;
    }
  }
}
