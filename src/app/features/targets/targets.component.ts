import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AnimalGroupId } from '../../core/models/recipe.model';
import { EffectiveNutrientTarget } from '../../core/models/nutrient.model';
import { TargetService } from '../../core/services/target.service';
import { FarmContextService } from '../../core/services/farm-context.service';

interface TargetDraft {
  minValue: number | null;
  maxValue: number | null;
  reason: string;
}

/**
 * Per-farm target overrides.
 *
 * The workbook reference ranges are always visible. An owner or farm admin
 * can replace one nutrient's range with the farm's own range, with a reason;
 * the callable stores the override and an audit entry together.
 */
@Component({
  selector: 'mf-targets',
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
    MatTooltipModule,
    MatSnackBarModule,
    TranslatePipe,
  ],
  template: `
    <div class="targets-page">
      <h1 class="page-title">{{ 'TARGETS.TITLE' | translate }}</h1>
      <p class="page-subtitle">{{ 'TARGETS.SUBTITLE' | translate }}</p>

      <mat-card appearance="outlined" class="toolbar-card">
        <mat-card-content class="toolbar-row">
          <mat-form-field appearance="outline" class="group-select">
            <mat-label>{{ 'TARGETS.ANIMAL_GROUP' | translate }}</mat-label>
            <mat-select
              [(ngModel)]="animalGroupId"
              (selectionChange)="load()"
            >
              <mat-option value="lactating">{{
                'RECIPES.LACTATING' | translate
              }}</mat-option>
              <mat-option value="dry">{{
                'RECIPES.DRY' | translate
              }}</mat-option>
              <mat-option value="heifer">{{
                'RECIPES.HEIFER' | translate
              }}</mat-option>
            </mat-select>
          </mat-form-field>

          <span class="role-hint" *ngIf="!canEdit">
            {{ 'TARGETS.ADMIN_ONLY' | translate }}
          </span>
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined">
        <mat-card-content>
          <div class="target-header">
            <span>{{ 'TARGETS.NUTRIENT' | translate }}</span>
            <span>{{ 'TARGETS.REFERENCE' | translate }}</span>
            <span>{{ 'TARGETS.FARM' | translate }}</span>
            <span>{{ 'TARGETS.REASON' | translate }}</span>
            <span></span>
          </div>

          @for (target of targets; track target.nutrientCode) {
            <div class="target-row" [class.override]="target.source === 'override'">
              <span class="nutrient">
                {{ target.nutrientCode }}
                @if (target.source === 'override') {
                  <mat-icon
                    class="override-icon"
                    [matTooltip]="target.reason ?? ''"
                    >edit</mat-icon
                  >
                }
              </span>

              <span class="reference">
                {{
                  (target.referenceMinValue ?? target.minValue) === null
                    ? '—'
                    : (target.referenceMinValue ?? target.minValue)
                }}
                –
                {{
                  (target.referenceMaxValue ?? target.maxValue) === null
                    ? '—'
                    : (target.referenceMaxValue ?? target.maxValue)
                }}
              </span>

              @if (canEdit) {
                <span class="farm-inputs">
                  <input
                    type="number"
                    class="range-input"
                    [ngModel]="drafts[target.nutrientCode].minValue"
                    (ngModelChange)="setDraft(target, 'minValue', $event)"
                    [placeholder]="'TARGETS.MIN' | translate"
                  />
                  <input
                    type="number"
                    class="range-input"
                    [ngModel]="drafts[target.nutrientCode].maxValue"
                    (ngModelChange)="setDraft(target, 'maxValue', $event)"
                    [placeholder]="'TARGETS.MAX' | translate"
                  />
                </span>
                <input
                  type="text"
                  class="reason-input"
                  [ngModel]="drafts[target.nutrientCode].reason"
                  (ngModelChange)="setDraft(target, 'reason', $event)"
                  [placeholder]="'TARGETS.REASON_PLACEHOLDER' | translate"
                />
              } @else {
                <span class="farm-inputs">{{
                  target.source === 'override'
                    ? (target.reason ?? '—')
                    : ('TARGETS.REFERENCE' | translate)
                }}</span>
                <span></span>
              }

              <span class="actions">
                @if (canEdit) {
                  <button
                    mat-stroked-button
                    color="primary"
                    (click)="save(target)"
                    [disabled]="saving"
                  >
                    {{ 'TARGETS.SAVE' | translate }}
                  </button>
                  @if (target.source === 'override') {
                    <button
                      mat-button
                      (click)="revert(target)"
                      [disabled]="saving"
                    >
                      {{ 'TARGETS.REVERT' | translate }}
                    </button>
                  }
                }
              </span>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .targets-page {
      max-width: 1100px;
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
      align-items: center;
      gap: 16px;
    }
    .group-select {
      width: 260px;
    }
    .role-hint {
      color: #b26a00;
      font-size: 13px;
    }
    .target-header,
    .target-row {
      display: grid;
      grid-template-columns: 1.1fr 1.2fr 1.4fr 1.6fr 1.2fr;
      gap: 12px;
      align-items: center;
      padding: 8px 4px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    .target-header {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: rgba(0, 0, 0, 0.5);
      border-bottom: 1px solid rgba(0, 0, 0, 0.15);
    }
    .target-row.override {
      background: rgba(178, 106, 0, 0.05);
    }
    .nutrient {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
    }
    .override-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
      color: #b26a00;
    }
    .reference {
      font-size: 13px;
      color: rgba(0, 0, 0, 0.7);
    }
    .reference small {
      color: rgba(0, 0, 0, 0.4);
    }
    .farm-inputs {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .range-input {
      width: 72px;
      padding: 4px 6px;
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }
    .reason-input {
      padding: 4px 6px;
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 4px;
      width: 100%;
    }
    .actions {
      display: flex;
      gap: 4px;
      justify-content: flex-end;
    }
    @media (max-width: 760px) {
      .target-header {
        display: none;
      }
      .target-row {
        grid-template-columns: 1fr;
        gap: 6px;
      }
      .actions {
        justify-content: flex-start;
      }
    }
  `,
})
export class TargetsComponent implements OnInit {
  private targetService = inject(TargetService);
  private farmContext = inject(FarmContextService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  animalGroupId: AnimalGroupId = 'lactating';
  targets: EffectiveNutrientTarget[] = [];
  drafts: Record<string, TargetDraft> = {};
  saving = false;

  get canEdit(): boolean {
    const role = this.farmContext.activeRole();
    return role === 'owner' || role === 'farmAdmin';
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const farmId = this.farmContext.activeFarmId();
    this.targets = await this.targetService.getEffectiveTargets(
      farmId,
      this.animalGroupId,
    );
    this.drafts = {};
    for (const target of this.targets) {
      this.drafts[target.nutrientCode] = {
        minValue: target.minValue,
        maxValue: target.maxValue,
        reason: target.reason ?? '',
      };
    }
  }

  setDraft(
    target: EffectiveNutrientTarget,
    field: 'minValue' | 'maxValue' | 'reason',
    value: unknown,
  ): void {
    const draft = this.drafts[target.nutrientCode];
    if (!draft) return;
    if (field === 'reason') {
      draft.reason = String(value ?? '');
    } else if (value === '' || value === null || value === undefined) {
      draft[field] = null;
    } else {
      const parsed = Number(value);
      draft[field] = Number.isFinite(parsed) ? parsed : null;
    }
  }

  async save(target: EffectiveNutrientTarget): Promise<void> {
    const draft = this.drafts[target.nutrientCode];
    if (!draft) return;
    if (draft.reason.trim().length < 10) {
      this.snackBar.open(
        this.translate.instant('TARGETS.REASON_REQUIRED'),
        undefined,
        { duration: 4000 },
      );
      return;
    }
    this.saving = true;
    try {
      await this.targetService.setOverride({
        farmId: this.farmContext.activeFarmId(),
        animalGroupId: this.animalGroupId,
        nutrientCode: target.nutrientCode,
        minValue: draft.minValue,
        maxValue: draft.maxValue,
        reason: draft.reason.trim(),
      });
      await this.load();
      this.snackBar.open(
        this.translate.instant('TARGETS.SAVED'),
        undefined,
        { duration: 3000 },
      );
    } catch (error) {
      console.error('Failed to save target override', error);
      this.snackBar.open(
        this.translate.instant('TARGETS.SAVE_FAILED'),
        undefined,
        { duration: 5000 },
      );
    } finally {
      this.saving = false;
    }
  }

  async revert(target: EffectiveNutrientTarget): Promise<void> {
    this.saving = true;
    try {
      await this.targetService.clearOverride({
        farmId: this.farmContext.activeFarmId(),
        animalGroupId: this.animalGroupId,
        nutrientCode: target.nutrientCode,
      });
      await this.load();
      this.snackBar.open(
        this.translate.instant('TARGETS.REVERTED'),
        undefined,
        { duration: 3000 },
      );
    } catch (error) {
      console.error('Failed to revert target override', error);
      this.snackBar.open(
        this.translate.instant('TARGETS.SAVE_FAILED'),
        undefined,
        { duration: 5000 },
      );
    } finally {
      this.saving = false;
    }
  }
}
