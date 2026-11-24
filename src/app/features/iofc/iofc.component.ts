import { Component, OnInit, inject } from '@angular/core';
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
import { firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { HerdGroup } from '../../core/models/group.model';
import { MilkRecord } from '../../core/models/milk.model';
import { Feeding } from '../../core/models/feeding.model';
import { GroupService } from '../../core/services/group.service';
import { RecipeService } from '../../core/services/recipe.service';
import { MilkService } from '../../core/services/milk.service';
import { FeedingService } from '../../core/services/feeding.service';
import { FarmService } from '../../core/services/farm.service';
import { FarmContextService } from '../../core/services/farm-context.service';
import { computeIofc, IofcResult } from '../../core/utils/iofc';
import { localDateKey } from '../../core/utils/loading-math';

/**
 * Income over feed cost for one herd group and day.
 *
 * The current date uses the active recipe's per-head cost; an existing milk
 * record uses its own snapshot (per-head cost and head count) so historical
 * IOFC does not move when the herd or the recipe changes. A group without a
 * recipe and without a snapshot renders n/a, never a zero feed cost.
 */
@Component({
  selector: 'mf-iofc',
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
    <div class="iofc-page">
      <h1 class="page-title">{{ 'IOFC.TITLE' | translate }}</h1>
      <p class="page-subtitle">{{ 'IOFC.SUBTITLE' | translate }}</p>

      @if (!canView) {
        <div class="banner warning">{{ 'IOFC.RESTRICTED' | translate }}</div>
      } @else {
      <mat-card appearance="outlined" class="form-card">
        <mat-card-content class="form-grid">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'IOFC.GROUP' | translate }}</mat-label>
            <mat-select
              [(ngModel)]="selectedGroupId"
              (selectionChange)="onGroupChange()"
            >
              @for (group of groups; track group.id) {
                <mat-option [value]="group.id">{{ group.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'IOFC.DATE' | translate }}</mat-label>
            <input
              matInput
              type="date"
              [(ngModel)]="date"
              (ngModelChange)="onDateChange()"
            />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'IOFC.MILK_KG' | translate }}</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="milkKg" />
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'IOFC.MILK_PRICE' | translate }}</mat-label>
            <input
              matInput
              type="number"
              min="0"
              step="0.01"
              [(ngModel)]="milkPricePerKg"
            />
          </mat-form-field>

          <button
            mat-flat-button
            color="primary"
            (click)="save()"
            [disabled]="saving || !selectedGroupId"
          >
            {{ 'IOFC.SAVE' | translate }}
          </button>
          @if (canEditFarm) {
            <button
              mat-stroked-button
              (click)="saveFarmDefault()"
              [disabled]="saving"
            >
              {{ 'IOFC.SAVE_DEFAULT' | translate }}
            </button>
          }
        </mat-card-content>
      </mat-card>

      @if (!selectedGroupId) {
        <p class="empty">{{ 'IOFC.EMPTY' | translate }}</p>
      } @else if (isDry) {
        <div class="banner warning">{{ 'IOFC.DRY' | translate }}</div>
      } @else {
        @if (!hasFeedingForDate && !hasRecordForDate) {
          <div class="banner warning">
            {{ 'IOFC.AWAITING_FEEDING' | translate }}
          </div>
        }
        @if (incompleteSnapshot) {
          <div class="banner warning">
            {{ 'IOFC.INCOMPLETE_SNAPSHOT' | translate }}
          </div>
        } @else if (zeroHeadCount) {
          <div class="banner warning">{{ 'IOFC.ZERO_HEAD' | translate }}</div>
        } @else if (!hasRecordForDate && milkKg === 0) {
          <p class="empty">{{ 'IOFC.NO_RECORD' | translate }}</p>
        } @else {
          @if (result; as r) {
          <div class="stats-grid">
            <mat-card appearance="outlined"><mat-card-content>
              <span class="stat-value">€{{ r.milkRevenuePerDay | number: '1.2-2' }}</span>
              <span class="stat-label">{{ 'IOFC.REVENUE' | translate }}</span>
            </mat-card-content></mat-card>
            <mat-card appearance="outlined"><mat-card-content>
              <span class="stat-value">€{{ r.feedCostPerDay | number: '1.2-2' }}</span>
              <span class="stat-label">{{ 'IOFC.FEED_COST' | translate }}</span>
            </mat-card-content></mat-card>
            <mat-card appearance="outlined" class="highlight"><mat-card-content>
              <span class="stat-value">€{{ r.iofcPerDay | number: '1.2-2' }}</span>
              <span class="stat-label">{{ 'IOFC.IOFC_DAY' | translate }}</span>
            </mat-card-content></mat-card>
            <mat-card appearance="outlined"><mat-card-content>
              <span class="stat-value">€{{ r.iofcPerCowPerDay | number: '1.2-2' }}</span>
              <span class="stat-label">{{ 'IOFC.IOFC_COW' | translate }}</span>
            </mat-card-content></mat-card>
            <mat-card appearance="outlined"><mat-card-content>
              <span class="stat-value">{{ r.milkPerCow | number: '1.1-1' }} kg</span>
              <span class="stat-label">{{ 'IOFC.MILK_COW' | translate }}</span>
            </mat-card-content></mat-card>
            <mat-card appearance="outlined"><mat-card-content>
              <span class="stat-value">
                {{
                  r.feedCostPerKgMilk === null
                    ? '—'
                    : '€' + (r.feedCostPerKgMilk | number: '1.3-3')
                }}
              </span>
              <span class="stat-label">{{ 'IOFC.FEED_PER_KG' | translate }}</span>
            </mat-card-content></mat-card>
          </div>
          } @else {
            <div class="banner warning">{{ 'IOFC.NO_COST' | translate }}</div>
          }
        }

        <mat-card appearance="outlined" class="trend-card">
          <mat-card-header>
            <mat-card-title>{{ 'IOFC.TREND' | translate }}</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="trend-row header">
              <span>{{ 'IOFC.DATE' | translate }}</span>
              <span>{{ 'IOFC.MILK_KG' | translate }}</span>
              <span>{{ 'IOFC.IOFC_COW' | translate }}</span>
            </div>
            @for (point of trend; track point.date) {
              <div class="trend-row">
                <span>{{ point.date }}</span>
                <span>{{ point.milkKg | number: '1.0-0' }} kg</span>
                <span>
                  {{
                    point.iofcPerCow === null
                      ? '—'
                      : '€' + (point.iofcPerCow | number: '1.2-2')
                  }}
                </span>
              </div>
            } @empty {
              <p class="empty">{{ 'IOFC.EMPTY' | translate }}</p>
            }
          </mat-card-content>
        </mat-card>
      }
      }
    </div>
  `,
  styles: `
    .iofc-page { max-width: 1200px; }
    .page-title { font-size: 28px; font-weight: 700; margin: 0 0 4px; }
    .page-subtitle { color: rgba(0,0,0,.55); margin: 0 0 20px; }
    .form-card { margin-bottom: 16px; }
    .form-grid {
      display: grid;
      grid-template-columns: 1.2fr 1fr 0.8fr 0.8fr auto auto;
      gap: 12px;
      align-items: center;
    }
    .banner.warning {
      background: #fff4e0; color: #8a5300; padding: 10px 14px;
      border-radius: 6px; font-weight: 600; margin-bottom: 16px;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-bottom: 16px;
    }
    .stats-grid mat-card-content {
      display: flex; flex-direction: column; gap: 4px; padding: 16px;
    }
    .stat-value { font-size: 22px; font-weight: 700; }
    .stat-label { font-size: 12px; color: rgba(0,0,0,.55); text-transform: uppercase; }
    .highlight { border: 1px solid #2b7a5b; }
    .trend-card { margin-top: 8px; }
    .trend-row {
      display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 12px;
      padding: 6px 4px; border-bottom: 1px solid rgba(0,0,0,.06);
    }
    .trend-row.header {
      font-size: 12px; font-weight: 600; text-transform: uppercase;
      color: rgba(0,0,0,.5); border-bottom: 1px solid rgba(0,0,0,.15);
    }
    .empty { color: rgba(0,0,0,.5); padding: 16px 4px; }
    @media (max-width: 800px) {
      .form-grid, .stats-grid, .trend-row { grid-template-columns: 1fr; }
      .trend-row.header { display: none; }
    }
  `,
})
export class IofcComponent implements OnInit {
  private groupService = inject(GroupService);
  private recipeService = inject(RecipeService);
  private milkService = inject(MilkService);
  private feedingService = inject(FeedingService);
  private farmService = inject(FarmService);
  private farmContext = inject(FarmContextService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  groups: HerdGroup[] = [];
  records: MilkRecord[] = [];
  feedings: Feeding[] = [];
  farmMilkPrice: number | null = null;
  selectedGroupId = '';
  date = localDateKey();
  milkKg = 0;
  milkPricePerKg = 0.5;
  feedCostPerHead: number | null = null;
  hasRecordForDate = false;
  saving = false;

  get canView(): boolean {
    if (this.farmContext.loading()) return true;
    const role = this.farmContext.activeRole();
    return role === 'owner' || role === 'farmAdmin' || role === 'consultant';
  }

  ngOnInit(): void {
    if (!this.canView) return;
    void this.loadFarmDefault();
    this.groupService.getGroups().subscribe((groups) => {
      this.groups = groups;
      if (!this.selectedGroupId && groups.length > 0) {
        this.selectedGroupId = groups[0].id ?? '';
        void this.onGroupChange();
      }
    });
  }

  get group(): HerdGroup | undefined {
    return this.groups.find((group) => group.id === this.selectedGroupId);
  }

  private get recordForDate(): MilkRecord | undefined {
    return this.records.find((record) => record.date === this.date);
  }

  private get feedingForDate(): Feeding | undefined {
    // TMR groups can have more than one feeding a day; the latest confirmed
    // feeding reflects the herd at the time the milk record is entered.
    return this.feedings
      .filter(
        (feeding) =>
          feeding.date === this.date && feeding.status === 'confirmed',
      )
      .sort(
        (a, b) =>
          (b.createdAt?.getTime?.() ?? 0) -
          (a.createdAt?.getTime?.() ?? 0),
      )[0];
  }

  get hasFeedingForDate(): boolean {
    return !!this.feedingForDate;
  }

  get zeroHeadCount(): boolean {
    const record = this.recordForDate;
    const count = record
      ? record.headCountSnapshot
      : this.headCountForEntry;
    return count === 0;
  }

  private get headCountForEntry(): number {
    return this.feedingForDate?.animalCount ?? this.group?.headCount ?? 0;
  }

  get incompleteSnapshot(): boolean {
    const record = this.recordForDate;
    return (
      !!record &&
      (record.feedCostPerHeadSnapshot == null ||
        record.headCountSnapshot == null)
    );
  }

  get canEditFarm(): boolean {
    const role = this.farmContext.activeRole();
    return role === 'owner' || role === 'farmAdmin';
  }

  get isDry(): boolean {
    return this.group?.animalGroupId === 'dry';
  }

  get result(): IofcResult | null {
    const group = this.group;
    if (!group) return null;
    const record = this.recordForDate;
    if (record) {
      if (
        record.feedCostPerHeadSnapshot == null ||
        record.headCountSnapshot == null ||
        record.headCountSnapshot <= 0
      ) {
        return null;
      }
      return computeIofc({
        headCount: record.headCountSnapshot,
        milkKg: this.milkKg,
        milkPricePerKg: this.milkPricePerKg,
        feedCostPerHead: record.feedCostPerHeadSnapshot,
      });
    }
    if (this.feedCostPerHead === null) return null;
    const headCount = this.headCountForEntry;
    if (!headCount || headCount <= 0) return null;
    return computeIofc({
      headCount,
      milkKg: this.milkKg,
      milkPricePerKg: this.milkPricePerKg,
      feedCostPerHead: this.feedCostPerHead,
    });
  }

  get trend(): {
    date: string;
    milkKg: number;
    iofcPerCow: number | null;
  }[] {
    const points: {
      date: string;
      milkKg: number;
      iofcPerCow: number | null;
    }[] = [];
    for (const record of this.records.slice(0, 7)) {
      if (
        record.feedCostPerHeadSnapshot == null ||
        record.headCountSnapshot == null
      ) {
        points.push({
          date: record.date,
          milkKg: record.milkKg,
          iofcPerCow: null,
        });
        continue;
      }
      const result = computeIofc({
        headCount: record.headCountSnapshot,
        milkKg: record.milkKg,
        milkPricePerKg: record.milkPricePerKg,
        feedCostPerHead: record.feedCostPerHeadSnapshot,
      });
      points.push({
        date: record.date,
        milkKg: record.milkKg,
        iofcPerCow: result.iofcPerCowPerDay,
      });
    }
    return points;
  }

  async onGroupChange(): Promise<void> {
    const group = this.group;
    this.feedCostPerHead = null;
    this.records = [];
    this.feedings = [];
    this.milkKg = 0;
    this.milkPricePerKg = this.farmMilkPrice ?? 0.5;
    this.hasRecordForDate = false;
    if (!group?.id) return;
    if (group.activeRecipeId) {
      const recipe = await this.recipeService.getRecipeWithFeeds(
        group.activeRecipeId,
      );
      this.feedCostPerHead = recipe?.cost ?? null;
    }
    try {
      this.feedings = await firstValueFrom(
        this.feedingService.getFeedings(group.id).pipe(take(1)),
      );
    } catch {
      this.feedings = [];
    }
    try {
      await this.loadRecords(group.id);
    } catch {
      this.records = [];
    }
    this.applyRecordForDate();
  }

  onDateChange(): void {
    this.applyRecordForDate();
  }

  private async loadRecords(herdGroupId: string): Promise<void> {
    this.records = await firstValueFrom(
      this.milkService.getMilkRecords(herdGroupId).pipe(take(1)),
    );
  }

  private async loadFarmDefault(): Promise<void> {
    this.farmMilkPrice = await this.farmService.getMilkPricePerKg();
    if (!this.hasRecordForDate) {
      this.milkPricePerKg = this.farmMilkPrice ?? 0.5;
    }
  }

  private applyRecordForDate(): void {
    const record = this.recordForDate;
    this.hasRecordForDate = !!record;
    if (record) {
      this.milkKg = record.milkKg;
      this.milkPricePerKg = record.milkPricePerKg;
    } else {
      this.milkKg = 0;
      this.milkPricePerKg = this.farmMilkPrice ?? 0.5;
    }
  }

  async saveFarmDefault(): Promise<void> {
    this.saving = true;
    try {
      await this.farmService.setMilkPricePerKg(this.milkPricePerKg);
      this.farmMilkPrice = this.milkPricePerKg;
      this.snackBar.open(
        this.translate.instant('IOFC.DEFAULT_SAVED'),
        undefined,
        { duration: 3000 },
      );
    } catch (error) {
      console.error('Failed to save farm milk price', error);
      this.snackBar.open(
        this.translate.instant('IOFC.DEFAULT_FAILED'),
        undefined,
        { duration: 5000 },
      );
    } finally {
      this.saving = false;
    }
  }

  async save(): Promise<void> {
    const group = this.group;
    if (!group?.id) return;
    this.saving = true;
    try {
      await this.milkService.saveRecord({
        herdGroupId: group.id,
        date: this.date,
        milkKg: this.milkKg,
        milkPricePerKg: this.milkPricePerKg,
        feedCostPerHeadSnapshot: this.feedCostPerHead,
        headCountSnapshot: this.headCountForEntry,
        hasFeedingSnapshot: this.hasFeedingForDate,
      });
      await this.loadRecords(group.id);
      this.applyRecordForDate();
      this.snackBar.open(
        this.translate.instant('IOFC.SAVED'),
        undefined,
        { duration: 3000 },
      );
    } catch (error) {
      console.error('Failed to save milk record', error);
      this.snackBar.open(
        this.translate.instant('IOFC.SAVE_FAILED'),
        undefined,
        { duration: 5000 },
      );
    } finally {
      this.saving = false;
    }
  }
}
