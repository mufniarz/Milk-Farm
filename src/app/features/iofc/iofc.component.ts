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
import { GroupService } from '../../core/services/group.service';
import { RecipeService } from '../../core/services/recipe.service';
import { MilkService } from '../../core/services/milk.service';
import { computeIofc, IofcResult } from '../../core/utils/iofc';
import { localDateKey } from '../../core/utils/loading-math';

/**
 * Income over feed cost for one herd group and day.
 *
 * Milk is entered as the whole-group daily total; per-cow figures are derived
 * from the group head count. Feed cost uses the active recipe's per-head cost
 * and is snapshotted on each milk record so later recipe changes do not
 * rewrite history.
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
        </mat-card-content>
      </mat-card>

      @if (!selectedGroupId) {
        <p class="empty">{{ 'IOFC.EMPTY' | translate }}</p>
      } @else if (isDry) {
        <div class="banner warning">{{ 'IOFC.DRY' | translate }}</div>
      } @else {
        @if (!feedCostPerHead) {
          <div class="banner warning">{{ 'IOFC.NO_RECIPE' | translate }}</div>
        }

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
                <span>€{{ point.iofcPerCow | number: '1.2-2' }}</span>
              </div>
            } @empty {
              <p class="empty">{{ 'IOFC.EMPTY' | translate }}</p>
            }
          </mat-card-content>
        </mat-card>
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
      grid-template-columns: 1.2fr 1fr 0.8fr 0.8fr auto;
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
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  groups: HerdGroup[] = [];
  records: MilkRecord[] = [];
  selectedGroupId = '';
  date = localDateKey();
  milkKg = 0;
  milkPricePerKg = 0.5;
  feedCostPerHead = 0;
  saving = false;

  ngOnInit(): void {
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

  get isDry(): boolean {
    return this.group?.animalGroupId === 'dry';
  }

  get result(): IofcResult | null {
    const group = this.group;
    if (!group || group.headCount <= 0) return null;
    return computeIofc({
      headCount: group.headCount,
      milkKg: this.milkKg,
      milkPricePerKg: this.milkPricePerKg,
      feedCostPerHead: this.feedCostPerHead,
    });
  }

  get trend(): { date: string; milkKg: number; iofcPerCow: number }[] {
    const group = this.group;
    if (!group || group.headCount <= 0) return [];
    return this.records.slice(0, 4).map((record) => {
      const result = computeIofc({
        headCount: group.headCount,
        milkKg: record.milkKg,
        milkPricePerKg: record.milkPricePerKg,
        feedCostPerHead:
          record.feedCostPerHeadSnapshot ?? this.feedCostPerHead,
      });
      return {
        date: record.date,
        milkKg: record.milkKg,
        iofcPerCow: result.iofcPerCowPerDay,
      };
    });
  }

  async onGroupChange(): Promise<void> {
    const group = this.group;
    this.feedCostPerHead = 0;
    this.records = [];
    this.milkKg = 0;
    this.milkPricePerKg = 0.5;
    if (!group?.id) return;
    if (group.activeRecipeId) {
      const recipe = await this.recipeService.getRecipeWithFeeds(
        group.activeRecipeId,
      );
      this.feedCostPerHead = recipe?.cost ?? 0;
    }
    await this.loadRecords(group.id);
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

  private applyRecordForDate(): void {
    const record = this.records.find((entry) => entry.date === this.date);
    if (record) {
      this.milkKg = record.milkKg;
      this.milkPricePerKg = record.milkPricePerKg;
    } else {
      this.milkKg = 0;
      this.milkPricePerKg = 0.5;
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
      });
      await this.loadRecords(group.id);
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
