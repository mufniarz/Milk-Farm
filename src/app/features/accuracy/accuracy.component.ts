import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { Feeding } from '../../core/models/feeding.model';
import { Feeder } from '../../core/models/feeder.model';
import { HerdGroup } from '../../core/models/group.model';
import { FeedingService } from '../../core/services/feeding.service';
import { FeederService } from '../../core/services/feeder.service';
import { GroupService } from '../../core/services/group.service';
import { FarmContextService } from '../../core/services/farm-context.service';
import {
  AccuracyRow,
  FeederAccuracy,
  accuracyRowsToCsv,
  buildAccuracyRows,
  filterRowsSince,
  summarizeByFeeder,
} from '../../core/utils/feeder-accuracy';

/**
 * Feeder accuracy report.
 *
 * One CSV row per feeding line; the on-screen table aggregates per feeder
 * within the selected window and herd group. Drafts are excluded; confirmed
 * but not-yet-posted feedings are included (the CSV `status` column says so).
 */
@Component({
  selector: 'mf-accuracy',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatIconModule,
    MatSnackBarModule,
    TranslatePipe,
  ],
  template: `
    <div class="accuracy-page">
      <h1 class="page-title">{{ 'ACCURACY.TITLE' | translate }}</h1>
      <p class="page-subtitle">{{ 'ACCURACY.SUBTITLE' | translate }}</p>

      @if (!canView) {
        <div class="banner warning">
          {{ 'ACCURACY.RESTRICTED' | translate }}
        </div>
      } @else {
      <mat-card appearance="outlined" class="toolbar-card">
        <mat-card-content class="toolbar-row">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'ACCURACY.WINDOW' | translate }}</mat-label>
            <mat-select [(ngModel)]="days">
              <mat-option [value]="7">{{
                'ACCURACY.DAYS' | translate: { days: 7 }
              }}</mat-option>
              <mat-option [value]="28">{{
                'ACCURACY.DAYS' | translate: { days: 28 }
              }}</mat-option>
              <mat-option [value]="90">{{
                'ACCURACY.DAYS' | translate: { days: 90 }
              }}</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'ACCURACY.GROUP' | translate }}</mat-label>
            <mat-select [(ngModel)]="groupId">
              <mat-option value="">{{ 'ACCURACY.ALL_GROUPS' | translate }}</mat-option>
              @for (group of groups; track group.id) {
                <mat-option [value]="group.id">{{ group.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <span class="line-count">
            {{ filteredRows.length }} {{ 'ACCURACY.LINES' | translate }}
          </span>

          <button
            mat-flat-button
            color="primary"
            (click)="downloadCsv()"
            [disabled]="filteredRows.length === 0"
          >
            {{ 'ACCURACY.EXPORT' | translate }}
          </button>
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined">
        <mat-card-content>
          <div class="row header">
            <span>{{ 'ACCURACY.FEEDER' | translate }}</span>
            <span>{{ 'ACCURACY.LOADS' | translate }}</span>
            <span>{{ 'ACCURACY.LINE_COUNT' | translate }}</span>
            <span>{{ 'ACCURACY.MEAN_ABS' | translate }}</span>
            <span>{{ 'ACCURACY.WEIGHTED' | translate }}</span>
            <span [title]="'ACCURACY.INTAKE_TOOLTIP' | translate">{{
              'ACCURACY.INTAKE_EFF' | translate
            }}</span>
            <span>{{ 'ACCURACY.ANOMALIES' | translate }}</span>
            <span [title]="'ACCURACY.WORST_TOOLTIP' | translate">{{
              'ACCURACY.WORST' | translate
            }}</span>
            <span [title]="'ACCURACY.TREND_TOOLTIP' | translate">{{
              'ACCURACY.TREND' | translate
            }}</span>
          </div>
          @for (summary of summaries; track summary.feederId) {
            <div class="row body">
              <span class="feeder">{{ feederName(summary.feederId) }}</span>
              <span>{{ summary.loadCount }}</span>
              <span>{{ summary.lineCount }}</span>
              <span>{{ summary.meanAbsDeviationPct | number: '1.1-1' }}%</span>
              <span>{{ summary.loadWeightedDeviationPct | number: '1.1-1' }}%</span>
              <span
                [class.alert]="summary.refusalError"
                [title]="
                  summary.refusalError
                    ? ('ACCURACY.REFUSAL_ERROR' | translate)
                    : ''
                "
              >
                {{
                  summary.intakeEfficiencyPct === null
                    ? '—'
                    : (summary.intakeEfficiencyPct | number: '1.1-1') + '%'
                }}
              </span>
              <span
                [class.alert]="
                  summary.overdrawnLoads > 0 || summary.skippedLoads > 0
                "
              >
                {{ summary.overdrawnLoads }} / {{ summary.skippedLoads }}
              </span>
              <span class="ingredients">
                @for (item of summary.worstIngredients; track item.feedId) {
                  <span class="chip">
                    {{ item.feedName }}
                    {{ item.totalAbsDeviationKg | number: '1.0-0' }} kg
                    ({{ item.meanAbsDeviationPct | number: '1.1-1' }}%)
                  </span>
                }
              </span>
              <span class="trend">
                @for (week of summary.weekly; track week.weekStart) {
                  <span>
                    {{ week.weekStart.slice(5) }}:
                    {{ week.meanAbsDeviationPct | number: '1.1-1' }}%
                  </span>
                }
              </span>
            </div>
          } @empty {
            <p class="empty">{{ 'ACCURACY.EMPTY' | translate }}</p>
          }
        </mat-card-content>
      </mat-card>

      <p class="note">{{ 'ACCURACY.PENDING_NOTE' | translate }}</p>
      }
    </div>
  `,
  styles: `
    .accuracy-page {
      max-width: 1250px;
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
    .toolbar-card {
      margin-bottom: 16px;
    }
    .toolbar-row {
      display: flex;
      gap: 16px;
      align-items: center;
      flex-wrap: wrap;
    }
    .banner.warning {
      background: #fff4e0;
      color: #8a5300;
      padding: 10px 14px;
      border-radius: 6px;
      font-weight: 600;
      margin-bottom: 16px;
    }
    .line-count {
      color: rgba(0, 0, 0, 0.6);
      font-size: 13px;
      margin-left: auto;
    }
    .row {
      display: grid;
      grid-template-columns: 1.1fr 0.5fr 0.5fr 0.7fr 0.7fr 0.7fr 0.7fr 1.6fr 1.4fr;
      gap: 12px;
      align-items: center;
      padding: 8px 4px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    .row.header {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: rgba(0, 0, 0, 0.5);
      border-bottom: 1px solid rgba(0, 0, 0, 0.15);
    }
    .feeder {
      font-weight: 600;
    }
    .alert {
      color: #a02525;
      font-weight: 600;
    }
    .chip {
      display: inline-block;
      background: #f2f5f3;
      border-radius: 12px;
      padding: 2px 8px;
      margin: 2px 4px 2px 0;
      font-size: 12px;
    }
    .trend {
      display: flex;
      flex-direction: column;
      font-size: 12px;
      color: rgba(0, 0, 0, 0.6);
    }
    .empty {
      color: rgba(0, 0, 0, 0.5);
      padding: 16px 4px;
    }
    .note {
      color: rgba(0, 0, 0, 0.5);
      font-size: 12px;
      margin-top: 10px;
    }
    @media (max-width: 900px) {
      .row.header {
        display: none;
      }
      .row.body {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class AccuracyComponent implements OnInit {
  private feedingService = inject(FeedingService);
  private feederService = inject(FeederService);
  private groupService = inject(GroupService);
  private farmContext = inject(FarmContextService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  feedings: Feeding[] = [];
  feeders: Feeder[] = [];
  groups: HerdGroup[] = [];
  days = 28;
  groupId = '';

  ngOnInit(): void {
    this.feedingService
      .getFeedings()
      .subscribe((feedings) => (this.feedings = feedings));
    this.feederService
      .getFeeders()
      .subscribe((feeders) => (this.feeders = feeders));
    this.groupService
      .getGroups()
      .subscribe((groups) => (this.groups = groups));
  }

  get canView(): boolean {
    if (this.farmContext.loading()) return true;
    const role = this.farmContext.activeRole();
    return role === 'owner' || role === 'farmAdmin' || role === 'consultant';
  }

  get rows(): AccuracyRow[] {
    return buildAccuracyRows(this.feedings);
  }

  get filteredRows(): AccuracyRow[] {
    const recent = filterRowsSince(this.rows, this.days);
    return this.groupId
      ? recent.filter((row) => row.herdGroupId === this.groupId)
      : recent;
  }

  get summaries(): FeederAccuracy[] {
    return summarizeByFeeder(this.filteredRows);
  }

  feederName(feederId: string): string {
    return this.feeders.find((feeder) => feeder.id === feederId)?.name ?? feederId;
  }

  downloadCsv(): void {
    const rows = this.filteredRows;
    if (rows.length === 0) return;
    const csv = accuracyRowsToCsv(rows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `feeder-accuracy-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.snackBar.open(
      this.translate.instant('ACCURACY.EXPORTED'),
      undefined,
      { duration: 3000 },
    );
  }
}
