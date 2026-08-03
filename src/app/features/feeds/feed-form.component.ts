import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogRef, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { FeedService } from '../../core/services/feed.service';
import { Feed, FeedCategory } from '../../core/models/feed.model';

/** Well-known nutrient codes for the form */
const NUTRIENT_FIELDS = [
  { code: 'proteina', labelIt: 'Proteina Grezza', labelEn: 'Crude Protein', unit: '% SS' },
  { code: 'ee', labelIt: 'Estratto Etereo', labelEn: 'Ether Extract', unit: '% SS' },
  { code: 'amido', labelIt: 'Amido', labelEn: 'Starch', unit: '% SS' },
  { code: 'aNDF', labelIt: 'aNDF', labelEn: 'aNDF', unit: '% SS' },
  { code: 'ADF', labelIt: 'ADF', labelEn: 'ADF', unit: '% SS' },
  { code: 'ADL', labelIt: 'ADL (Lignina)', labelEn: 'ADL (Lignin)', unit: '% SS' },
  { code: 'ceneri', labelIt: 'Ceneri', labelEn: 'Ash', unit: '% SS' },
  { code: 'Ca', labelIt: 'Calcio', labelEn: 'Calcium', unit: '% SS' },
  { code: 'P', labelIt: 'Fosforo', labelEn: 'Phosphorus', unit: '% SS' },
  { code: 'UFL', labelIt: 'UFL', labelEn: 'UFL', unit: '/kg SS' },
  { code: 'NFC', labelIt: 'Carboidrati Non Fibrosi', labelEn: 'Non-Fiber Carbohydrates', unit: '% SS' },
  { code: 'peNDF', labelIt: 'peNDF', labelEn: 'peNDF', unit: '% SS' },
];

@Component({
  selector: 'mf-feed-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatSlideToggleModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    TranslatePipe,
  ],
  template: `
    <h2 mat-dialog-title>
      {{ data.mode === 'add' ? ('FEEDS.ADD' | translate) : ('FEEDS.EDIT' | translate) }}
    </h2>

    <mat-dialog-content class="dialog-content">
      <form [formGroup]="form" class="feed-form">
        <!-- Basic Info -->
        <div class="form-row">
          <mat-form-field appearance="outline" class="flex-2">
            <mat-label>{{ 'FEEDS.NAME' | translate }}</mat-label>
            <input matInput formControlName="name" id="feed-name" />
          </mat-form-field>

          <mat-form-field appearance="outline" class="flex-1">
            <mat-label>{{ 'FEEDS.CATEGORY' | translate }}</mat-label>
            <mat-select formControlName="category" id="feed-category">
              <mat-option value="forage">{{ 'FEEDS.FORAGE' | translate }}</mat-option>
              <mat-option value="concentrate">{{ 'FEEDS.CONCENTRATE' | translate }}</mat-option>
            </mat-select>
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline" class="flex-1">
            <mat-label>{{ 'FEEDS.PRICE_PER_KG' | translate }}</mat-label>
            <input matInput type="number" formControlName="pricePerKg" step="0.001" id="feed-price" />
            <span matPrefix>€&nbsp;</span>
          </mat-form-field>

          <mat-form-field appearance="outline" class="flex-1">
            <mat-label>{{ 'FEEDS.MOISTURE' | translate }}</mat-label>
            <input matInput type="number" formControlName="moisturePct" step="0.1" id="feed-moisture" />
            <span matSuffix>%</span>
          </mat-form-field>

          <div class="toggle-wrapper flex-1">
            <mat-slide-toggle formControlName="isAvailable" color="primary">
              {{ 'FEEDS.AVAILABLE' | translate }}
            </mat-slide-toggle>
          </div>
        </div>

        <mat-divider></mat-divider>

        <!-- Nutrients -->
        <h3 class="section-label">{{ 'FEEDS.NUTRIENTS' | translate }} (% SS / DM basis)</h3>

        <div class="nutrients-grid" formGroupName="nutrients">
          @for (nutrient of nutrientFields; track nutrient.code) {
            <mat-form-field appearance="outline" class="nutrient-field">
              <mat-label>{{ nutrient.labelIt }}</mat-label>
              <input
                matInput
                type="number"
                [formControlName]="nutrient.code"
                step="0.01"
                [id]="'nutrient-' + nutrient.code"
              />
              <span matSuffix class="unit-suffix">{{ nutrient.unit }}</span>
            </mat-form-field>
          }
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'FEEDS.CANCEL' | translate }}</button>
      <button
        mat-flat-button
        color="primary"
        (click)="save()"
        [disabled]="form.invalid || saving()"
        id="feed-save-btn"
      >
        @if (saving()) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          {{ 'FEEDS.SAVE' | translate }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .dialog-content {
      min-width: 500px;
      max-height: 70vh;
    }

    .feed-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-row {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }

    .flex-1 { flex: 1; }
    .flex-2 { flex: 2; }

    .toggle-wrapper {
      display: flex;
      align-items: center;
      padding-top: 16px;
    }

    .section-label {
      font-size: 14px;
      font-weight: 600;
      color: rgba(0, 0, 0, 0.6);
      margin: 16px 0 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .nutrients-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px 16px;
    }

    .unit-suffix {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.4);
    }

    @media (max-width: 600px) {
      .dialog-content {
        min-width: unset;
      }

      .form-row {
        flex-direction: column;
        gap: 0;
      }

      .nutrients-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }
  `,
})
export class FeedFormComponent {
  private fb = inject(FormBuilder);
  private feedService = inject(FeedService);
  private dialogRef = inject(MatDialogRef<FeedFormComponent>);
  data = inject<{ mode: 'add' | 'edit'; feed?: Feed }>(MAT_DIALOG_DATA);

  nutrientFields = NUTRIENT_FIELDS;
  saving = signal(false);

  form: FormGroup;

  constructor() {
    // Build nutrient form controls
    const nutrientControls: Record<string, any> = {};
    for (const n of NUTRIENT_FIELDS) {
      nutrientControls[n.code] = [
        this.data.feed?.nutrients?.[n.code] ?? 0,
        [Validators.min(0)],
      ];
    }

    this.form = this.fb.group({
      name: [this.data.feed?.name ?? '', Validators.required],
      category: [this.data.feed?.category ?? 'forage', Validators.required],
      pricePerKg: [this.data.feed?.pricePerKg ?? 0, [Validators.required, Validators.min(0)]],
      moisturePct: [
        this.data.feed?.moisturePct ?? 0,
        [Validators.required, Validators.min(0), Validators.max(100)],
      ],
      isAvailable: [this.data.feed?.isAvailable ?? true],
      nutrients: this.fb.group(nutrientControls),
    });
  }

  async save(): Promise<void> {
    if (this.form.invalid) return;

    this.saving.set(true);
    const value = this.form.value;

    try {
      if (this.data.mode === 'add') {
        await this.feedService.addFeed({
          name: value.name,
          category: value.category as FeedCategory,
          pricePerKg: value.pricePerKg,
          moisturePct: value.moisturePct,
          isAvailable: value.isAvailable,
          nutrients: value.nutrients,
        });
      } else if (this.data.feed?.id) {
        await this.feedService.updateFeed(this.data.feed.id, {
          name: value.name,
          category: value.category as FeedCategory,
          pricePerKg: value.pricePerKg,
          moisturePct: value.moisturePct,
          isAvailable: value.isAvailable,
          nutrients: value.nutrients,
        });
      }
      this.dialogRef.close(true);
    } catch (e) {
      console.error('Failed to save feed:', e);
    } finally {
      this.saving.set(false);
    }
  }
}
