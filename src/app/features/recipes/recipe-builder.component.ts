import {
  Component,
  effect,
  inject,
  OnInit,
  signal,
  computed,
  AfterViewInit,
  ViewChild,
  NgZone,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { BaseChartDirective } from 'ng2-charts';
import { take } from 'rxjs/operators';
import { FeedService } from '../../core/services/feed.service';
import { RecipeService } from '../../core/services/recipe.service';
import {
  OptimizationService,
  OptimizationConstraints,
  OptimizationWarning,
} from '../../core/services/optimization.service';
import {
  warningIssueKey,
  warningLimit,
  warningReferenceLimit,
} from '../../core/utils/recipe-warning';
import {
  RationCalculatorService,
  RationResult,
} from '../../core/services/ration-calculator.service';
import { Feed } from '../../core/models/feed.model';
import { AnimalGroupId } from '../../core/models/recipe.model';
import {
  EffectiveNutrientTarget,
  NutrientTarget,
} from '../../core/models/nutrient.model';
import { TargetService } from '../../core/services/target.service';
import { FarmContextService } from '../../core/services/farm-context.service';
import { ScenarioService } from '../../core/services/scenario.service';
import { buildBuilderScenarioPayload } from '../../core/utils/scenario-payload';
import { loadScenarioFlow } from '../../core/utils/scenario-load-flow';
import { ScenarioDraftController } from '../../core/services/scenario-draft-controller';
import { TARGET_RANGES } from '../../core/data/initial-data';
import { ChartData, ChartType } from 'chart.js';

interface RecipeFeedEntry {
  feed: Feed;
  kgAsFed: number;
  selected: boolean;
}

/** Nutrient targets are loaded per animal group from the Excel-derived TARGET_RANGES. */
@Component({
  selector: 'mf-recipe-builder',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatTableModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatExpansionModule,
    MatTooltipModule,
    BaseChartDirective,
    TranslatePipe,
  ],
  template: `
    <div class="recipe-builder">
      <div class="page-header">
        <h1 class="page-title">{{ 'RECIPES.BUILDER_TITLE' | translate }}</h1>
      </div>

      <div class="builder-grid">
        <!-- Left Panel: Feed Selection & Quantities -->
        <div class="left-panel">
          <mat-card appearance="outlined" class="panel-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>settings</mat-icon>
                {{ 'RECIPES.CONSTRAINTS' | translate }}
              </mat-card-title>
            </mat-card-header>
            <mat-card-content>
              <div class="config-row">
                <mat-form-field appearance="outline" class="flex-1">
                  <mat-label>{{ 'RECIPES.NAME' | translate }}</mat-label>
                  <input matInput [(ngModel)]="recipeName" id="recipe-name" />
                </mat-form-field>

                <mat-form-field appearance="outline" class="flex-1">
                  <mat-label>{{
                    'RECIPES.ANIMAL_GROUP' | translate
                  }}</mat-label>
                  <mat-select
                    [(ngModel)]="animalGroupId"
                    (selectionChange)="onAnimalGroupChange()"
                    id="animal-group-select"
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

                <mat-form-field appearance="outline" class="flex-1">
                  <mat-label>{{ 'RECIPES.NUM_ANIMALS' | translate }}</mat-label>
                  <input
                    matInput
                    type="number"
                    [(ngModel)]="animalCount"
                    min="1"
                    step="1"
                    id="animal-count"
                  />
                </mat-form-field>
              </div>

              <mat-expansion-panel class="constraints-panel">
                <mat-expansion-panel-header>
                  <mat-panel-title>
                    {{ 'RECIPES.CONSTRAINTS' | translate }}
                  </mat-panel-title>
                </mat-expansion-panel-header>

                <div class="config-row">
                  <mat-form-field appearance="outline" class="flex-1">
                    <mat-label>{{
                      'RECIPES.TOTAL_DM_CONSTRAINT' | translate
                    }}</mat-label>
                    <input
                      matInput
                      type="number"
                      [(ngModel)]="constraints.totalDM"
                      step="0.1"
                    />
                    <span matSuffix>kg</span>
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="flex-1">
                    <mat-label>{{
                      'RECIPES.MIN_FORAGE_RATIO' | translate
                    }}</mat-label>
                    <input
                      matInput
                      type="number"
                      [(ngModel)]="constraints.minForageRatio"
                      step="0.01"
                      min="0"
                      max="1"
                    />
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="flex-1">
                    <mat-label>{{
                      'RECIPES.MAX_FORAGE_RATIO' | translate
                    }}</mat-label>
                    <input
                      matInput
                      type="number"
                      [(ngModel)]="constraints.maxForageRatio"
                      step="0.01"
                      min="0"
                      max="1"
                    />
                  </mat-form-field>
                </div>
              </mat-expansion-panel>
            </mat-card-content>
          </mat-card>

          <mat-card appearance="outlined" class="panel-card">
            <mat-card-header>
              <mat-card-title>
                <mat-icon>grass</mat-icon>
                {{ 'RECIPES.SELECT_FEEDS' | translate }}
              </mat-card-title>
            </mat-card-header>
            <mat-card-content>
              @if (feedEntries().length === 0) {
                <p class="muted-text">{{ 'FEEDS.NO_FEEDS' | translate }}</p>
              } @else {
                <table
                  mat-table
                  [dataSource]="feedEntries()"
                  class="feeds-table"
                >
                  <!-- Checkbox -->
                  <ng-container matColumnDef="select">
                    <th mat-header-cell *matHeaderCellDef></th>
                    <td mat-cell *matCellDef="let entry">
                      <mat-checkbox
                        [(ngModel)]="entry.selected"
                        (ngModelChange)="recalculate()"
                        color="primary"
                      ></mat-checkbox>
                    </td>
                  </ng-container>

                  <!-- Name -->
                  <ng-container matColumnDef="name">
                    <th mat-header-cell *matHeaderCellDef>
                      {{ 'RECIPES.FEED_NAME' | translate }}
                    </th>
                    <td mat-cell *matCellDef="let entry">
                      <span class="feed-name">{{ entry.feed.name }}</span>
                      <span
                        class="category-badge"
                        [class]="entry.feed.category"
                      >
                        {{ entry.feed.category === 'forage' ? 'F' : 'C' }}
                      </span>
                    </td>
                  </ng-container>

                  <!-- Quantity -->
                  <ng-container matColumnDef="quantity">
                    <th mat-header-cell *matHeaderCellDef>
                      {{ 'RECIPES.QUANTITY_KG' | translate }}
                    </th>
                    <td mat-cell *matCellDef="let entry">
                      <mat-form-field appearance="outline" class="qty-field">
                        <input
                          matInput
                          type="number"
                          [(ngModel)]="entry.kgAsFed"
                          (ngModelChange)="recalculate()"
                          [disabled]="!entry.selected"
                          step="0.1"
                          min="0"
                        />
                      </mat-form-field>
                    </td>
                  </ng-container>

                  <!-- Price -->
                  <ng-container matColumnDef="price">
                    <th mat-header-cell *matHeaderCellDef>€/kg</th>
                    <td mat-cell *matCellDef="let entry">
                      {{ entry.feed.pricePerKg | number: '1.3-3' }}
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="feedColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: feedColumns"></tr>
                </table>
              }
            </mat-card-content>

            <mat-card-actions>
              <button
                mat-flat-button
                color="primary"
                (click)="optimize()"
                [disabled]="optimizing() || selectedFeeds().length < 2"
                class="optimize-btn"
                id="optimize-btn"
              >
                @if (optimizing()) {
                  <mat-spinner diameter="20"></mat-spinner>
                  {{ 'RECIPES.OPTIMIZING' | translate }}
                } @else {
                  <span>
                    <mat-icon>auto_fix_high</mat-icon>
                    {{ 'RECIPES.OPTIMIZE' | translate }}
                  </span>
                }
              </button>
            </mat-card-actions>
          </mat-card>
        </div>

        <!-- Right Panel: Results -->
        <div class="right-panel">
          @if (rationResult()) {
            <!-- Summary Stats -->
            <mat-card appearance="outlined" class="panel-card results-card">
              <mat-card-header>
                <mat-card-title>
                  <mat-icon>analytics</mat-icon>
                  {{ 'RECIPES.RESULTS' | translate }}
                </mat-card-title>
              </mat-card-header>
              <mat-card-content>
                @if (optimizationMessage()) {
                  <div
                    class="optimization-message"
                    [class]="optimizationStatus()"
                  >
                    <mat-icon>{{
                      optimizationStatus() === 'optimal'
                        ? 'check_circle'
                        : 'warning'
                    }}</mat-icon>
                    {{ optimizationMessage() }}
                  </div>
                }

                @if (optimizationWarnings().length) {
                  @if (optimizationStatus() === 'infeasible') {
                    <p class="optimization-hint">
                      {{ 'RECIPES.UNREACHABLE_HINT' | translate }}
                    </p>
                  }
                  <ul class="optimization-warnings">
                    @for (warning of optimizationWarnings(); track warning.code) {
                      <li>
                        <strong>{{ warning.code }}</strong>
                        {{ warning.value | number: '1.2-2' }} —
                        {{ warningLabel(warning) | translate }}
                        {{ warningLimitValue(warning) }}
                        @if (warningReferenceValue(warning); as reference) {
                          <span class="reference-floor">
                            ({{ 'RECIPES.REFERENCE_SHORT' | translate }}
                            {{ reference }})
                          </span>
                        }
                      </li>
                    }
                  </ul>
                }

                <div class="results-summary">
                  <div class="result-item">
                    <span class="result-label">{{
                      'RECIPES.TOTAL_DM' | translate
                    }}</span>
                    <span class="result-value"
                      >{{ rationResult()!.totalDM | number: '1.2-2' }} kg</span
                    >
                  </div>
                  <div class="result-item">
                    <span class="result-label">{{
                      'RECIPES.TOTAL_AS_FED' | translate
                    }}</span>
                    <span class="result-value"
                      >{{
                        rationResult()!.totalAsFed | number: '1.2-2'
                      }}
                      kg</span
                    >
                  </div>
                  <div class="result-item">
                    <span class="result-label">{{
                      'RECIPES.TOTAL_COST' | translate
                    }}</span>
                    <span class="result-value highlight"
                      >€{{ rationResult()!.totalCost | number: '1.2-4' }}</span
                    >
                  </div>
                  <div class="result-item">
                    <span class="result-label">{{
                      'RECIPES.COST_PER_KG' | translate
                    }}</span>
                    <span class="result-value"
                      >€{{ costPerKg | number: '1.3-3' }}/kg</span
                    >
                  </div>
                  <div class="result-item">
                    <span class="result-label">{{
                      'RECIPES.FORAGE_RATIO' | translate
                    }}</span>
                    <span class="result-value">{{
                      rationResult()!.forageRatio | percent: '1.1-1'
                    }}</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">{{
                      'RECIPES.MOISTURE_PCT' | translate
                    }}</span>
                    <span class="result-value"
                      >{{
                        rationResult()!.moisturePct | number: '1.1-1'
                      }}%</span
                    >
                  </div>
                  <div class="result-item">
                    <span class="result-label">{{
                      'RECIPES.TOTAL_LOAD' | translate
                    }}</span>
                    <span class="result-value"
                      >{{ batchLoadAsFed | number: '1.0-1' }} kg</span
                    >
                  </div>
                  <div class="result-item">
                    <span class="result-label">{{
                      'RECIPES.LOAD_COST' | translate
                    }}</span>
                    <span class="result-value"
                      >€{{ batchLoadCost | number: '1.2-2' }}</span
                    >
                  </div>
                </div>
              </mat-card-content>
            </mat-card>

            <!-- Radar Chart: Nutrient Profile -->
            <mat-card appearance="outlined" class="panel-card chart-card">
              <mat-card-header>
                <mat-card-title>
                  <mat-icon>scatter_plot</mat-icon>
                  {{ 'RECIPES.NUTRIENT_PROFILE' | translate }}
                </mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <div class="chart-container">
                  <canvas
                    baseChart
                    [type]="'radar'"
                    [data]="radarChartData"
                    [options]="radarChartOptions"
                  ></canvas>
                </div>
              </mat-card-content>
            </mat-card>

            <!-- Nutrient Analysis with Traffic Lights -->
            <mat-card appearance="outlined" class="panel-card">
              <mat-card-header>
                <mat-card-title>
                  <mat-icon>science</mat-icon>
                  {{ 'RECIPES.NUTRIENT_ANALYSIS' | translate }}
                </mat-card-title>
              </mat-card-header>
              <mat-card-content>
                <div class="nutrient-bars">
                  @for (target of targets; track target.nutrientCode) {
                    @if (
                      rationResult()!.nutrients[target.nutrientCode] !==
                      undefined
                    ) {
                      <div class="nutrient-row">
                        <div class="nutrient-label">
                          <span class="nutrient-code">
                            {{ target.nutrientCode }}
                            @if (target.source === 'override') {
                              <mat-icon
                                class="override-badge"
                                [matTooltip]="target.reason ?? ''"
                                >edit</mat-icon
                              >
                            }
                          </span>
                          <span class="nutrient-value">
                            {{
                              rationResult()!.nutrients[target.nutrientCode]
                                | number: '1.2-2'
                            }}
                          </span>
                        </div>
                        <div class="nutrient-bar-container">
                          <mat-progress-bar
                            mode="determinate"
                            [value]="getNutrientBarValue(target)"
                            [class]="getNutrientStatus(target)"
                          ></mat-progress-bar>
                          <div class="target-range-label">
                            {{
                              target.minValue !== null ? target.minValue : '—'
                            }}
                            –
                            {{
                              target.maxValue !== null ? target.maxValue : '—'
                            }}
                          </div>
                        </div>
                        <mat-icon
                          class="status-icon"
                          [class]="getNutrientStatus(target)"
                          [matTooltip]="getNutrientStatus(target)"
                        >
                          {{
                            getNutrientStatus(target) === 'good'
                              ? 'check_circle'
                              : getNutrientStatus(target) === 'warning'
                                ? 'warning'
                                : 'error'
                          }}
                        </mat-icon>
                      </div>
                    }
                  }
                </div>
              </mat-card-content>
            </mat-card>

            <mat-card class="scenario-card">
              <mat-card-title>{{ 'RECIPES.SCENARIO_CHANGES' | translate }}</mat-card-title>
              <mat-card-content>
                <div class="scenario-row">
                  <mat-form-field appearance="outline">
                    <mat-label>{{ 'RECIPES.FEED' | translate }}</mat-label>
                    <mat-select [(ngModel)]="scenarioFeedId">
                      @for (entry of selectedFeeds(); track entry.feed.id) {
                        <mat-option [value]="entry.feed.id">{{ entry.feed.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>{{ 'RECIPES.NEW_PRICE' | translate }}</mat-label>
                    <input matInput type="number" [(ngModel)]="scenarioPrice" />
                  </mat-form-field>
                  <button mat-stroked-button (click)="addPriceChange()">
                    {{ 'RECIPES.ADD_PRICE' | translate }}
                  </button>
                  <mat-form-field appearance="outline">
                    <mat-label>{{ 'RECIPES.NEW_KG' | translate }}</mat-label>
                    <input matInput type="number" [(ngModel)]="scenarioKg" />
                  </mat-form-field>
                  <button mat-stroked-button (click)="addInclusionChange()">
                    {{ 'RECIPES.ADD_INCLUSION' | translate }}
                  </button>
                </div>
                <div class="scenario-row">
                  <mat-form-field appearance="outline">
                    <mat-label>{{ 'RECIPES.NUTRIENT' | translate }}</mat-label>
                    <mat-select [(ngModel)]="scenarioNutrient">
                      @for (target of targets; track target.nutrientCode) {
                        <mat-option [value]="target.nutrientCode">{{ target.nutrientCode }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>{{ 'RECIPES.MIN' | translate }}</mat-label>
                    <input matInput type="number" [(ngModel)]="scenarioMin" />
                  </mat-form-field>
                  <mat-form-field appearance="outline">
                    <mat-label>{{ 'RECIPES.MAX' | translate }}</mat-label>
                    <input matInput type="number" [(ngModel)]="scenarioMax" />
                  </mat-form-field>
                  <button mat-stroked-button (click)="addOverrideChange()">
                    {{ 'RECIPES.ADD_OVERRIDE' | translate }}
                  </button>
                  <button mat-button (click)="clearScenarioChanges()">
                    {{ 'RECIPES.CLEAR_CHANGES' | translate }}
                  </button>
                </div>
              </mat-card-content>
            </mat-card>

            <!-- Save Button -->
            <button
              mat-stroked-button
              color="primary"
              class="save-btn"
              (click)="saveScenario()"
              [disabled]="saving() || selectedFeeds().length === 0"
              id="save-scenario-btn"
            >
              <mat-icon>bookmark_add</mat-icon>
              {{ 'RECIPES.SAVE_SCENARIO' | translate }}
            </button>
            <button
              mat-flat-button
              color="primary"
              class="save-btn"
              (click)="saveRecipe()"
              [disabled]="saving() || !recipeName"
              id="save-recipe-btn"
            >
              @if (saving()) {
                <mat-spinner diameter="20"></mat-spinner>
              } @else {
                <span>
                  <mat-icon>save</mat-icon>
                  {{ 'RECIPES.SAVE' | translate }}
                </span>
              }
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .recipe-builder {
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .page-header {
      margin-bottom: 24px;
    }

    .page-title {
      font-size: 28px;
      font-weight: 700;
      margin: 0;
    }

    .builder-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      align-items: start;
    }

    .panel-card {
      border-radius: 16px !important;
      margin-bottom: 20px;
    }

    .panel-card mat-card-title {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 18px;
    }

    .config-row {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .flex-1 {
      flex: 1;
      min-width: 120px;
    }

    .constraints-panel {
      margin-top: 12px;
    }

    .feeds-table {
      width: 100%;
    }

    .feed-name {
      font-weight: 500;
      margin-right: 6px;
    }

    .category-badge {
      display: inline-block;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      font-size: 10px;
      font-weight: 700;
      text-align: center;
      line-height: 20px;
    }

    .category-badge.forage {
      background: rgba(76, 175, 80, 0.15);
      color: #2e7d32;
    }

    .category-badge.concentrate {
      background: rgba(255, 152, 0, 0.15);
      color: #e65100;
    }

    .qty-field {
      width: 100px;
    }

    .optimize-btn {
      width: 100%;
      height: 48px;
      font-size: 16px;
      border-radius: 12px !important;
      gap: 8px;
    }

    .results-card mat-card-content {
      padding-top: 0;
    }

    .optimization-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 16px;
    }

    .optimization-message.optimal {
      background: rgba(76, 175, 80, 0.1);
      color: #2e7d32;
    }

    .optimization-message.infeasible {
      background: rgba(244, 67, 54, 0.1);
      color: #c62828;
    }

    .optimization-message.relaxed {
      background: rgba(255, 152, 0, 0.12);
      color: #e65100;
    }

    .results-summary {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 16px;
    }

    .result-item {
      display: flex;
      flex-direction: column;
    }

    .result-label {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .optimization-warnings {
      margin: 8px 0 0;
      padding-left: 18px;
      font-size: 12px;
      color: #b26a00;
    }

    .result-value {
      font-size: 20px;
      font-weight: 600;
      margin-top: 2px;
    }

    .result-value.highlight {
      color: #4ecca3;
    }

    /* Radar chart */
    .chart-card mat-card-content {
      padding: 16px !important;
    }

    .chart-container {
      display: flex;
      justify-content: center;
      padding: 8px 0;
    }

    /* Nutrient traffic-light bars */
    .nutrient-bars {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .nutrient-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .nutrient-label {
      width: 120px;
      display: flex;
      flex-direction: column;
      font-size: 13px;
    }

    .nutrient-code {
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .override-badge {
      font-size: 14px;
      width: 14px;
      height: 14px;
      color: #b26a00;
    }

    .nutrient-value {
      font-weight: 600;
      font-size: 15px;
    }

    .nutrient-bar-container {
      flex: 1;
    }

    .target-range-label {
      font-size: 11px;
      color: rgba(0, 0, 0, 0.4);
      margin-top: 2px;
    }

    mat-progress-bar.good ::ng-deep .mdc-linear-progress__bar-inner {
      border-color: #4caf50 !important;
    }

    mat-progress-bar.warning ::ng-deep .mdc-linear-progress__bar-inner {
      border-color: #ff9800 !important;
    }

    mat-progress-bar.danger ::ng-deep .mdc-linear-progress__bar-inner {
      border-color: #f44336 !important;
    }

    .status-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .status-icon.good {
      color: #4caf50;
    }
    .status-icon.warning {
      color: #ff9800;
    }
    .status-icon.danger {
      color: #f44336;
    }

    .save-btn {
      width: 100%;
      height: 48px;
      font-size: 16px;
      border-radius: 12px !important;
      gap: 8px;
    }

    .muted-text {
      color: rgba(0, 0, 0, 0.4);
      text-align: center;
      padding: 24px;
    }

    @media (max-width: 960px) {
      .builder-grid {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class RecipeBuilderComponent implements OnInit, AfterViewInit {
  private feedService = inject(FeedService);
  private recipeService = inject(RecipeService);
  private optimizationService = inject(OptimizationService);
  private calculator = inject(RationCalculatorService);
  private targetService = inject(TargetService);
  private farmContext = inject(FarmContextService);
  private scenarioService = inject(ScenarioService);
  private scenarioDraftController = inject(ScenarioDraftController);
  private snackBar = inject(MatSnackBar);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private translate = inject(TranslateService);
  private ngZone = inject(NgZone);

  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  feedColumns = ['select', 'name', 'quantity', 'price'];

  recipeName = '';
  /** Set when editing a saved recipe; null while creating a new one. */
  private recipeId: string | null = null;
  animalGroupId: AnimalGroupId = 'lactating';
  /** Herd size the ration is mixed for; 1 keeps per-head figures. */
  animalCount = 1;
  constraints: OptimizationConstraints = {};
  targets: EffectiveNutrientTarget[] = this.referenceTargets('lactating');
  scenarioFeedId = '';
  scenarioPrice: number | null = null;
  scenarioKg: number | null = null;
  scenarioNutrient = '';
  scenarioMin: number | null = null;
  scenarioMax: number | null = null;

  feedEntries = signal<RecipeFeedEntry[]>([]);
  rationResult = signal<RationResult | null>(null);
  optimizing = signal(false);
  saving = signal(false);
  optimizationMessage = signal('');
  optimizationStatus = signal<'optimal' | 'relaxed' | 'infeasible' | ''>('');
  /** Targets the relaxed solution could not satisfy, shown to the user. */
  optimizationWarnings = signal<OptimizationWarning[]>([]);

  // Chart data
  radarChartType: ChartType = 'radar';
  radarChartData: ChartData<'radar'> = { labels: [], datasets: [] };
  radarChartOptions: any = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        min: 0,
        ticks: { display: false },
        grid: { color: 'rgba(0, 0, 0, 0.08)' },
        pointLabels: { font: { size: 12 } },
        angleLines: { color: 'rgba(0, 0, 0, 0.08)' },
      },
    },
    plugins: {
      legend: { display: false },
    },
  };

  selectedFeeds = computed(() =>
    this.feedEntries().filter((e) => e.selected && e.kgAsFed > 0),
  );

  /**
   * Cost of one kg of ration as fed (€/kg t.q.), matching the
   * "costo razione al Kg" row of the reference spreadsheet.
   */
  get costPerKg(): number {
    const result = this.rationResult();
    if (!result || result.totalAsFed <= 0) return 0;
    return result.totalCost / result.totalAsFed;
  }

  /**
   * Load to mix for the whole group ("Totale carico"): per-head kg as fed
   * multiplied by the number of animals.
   */
  get batchLoadAsFed(): number {
    return (this.rationResult()?.totalAsFed ?? 0) * (this.animalCount || 1);
  }

  /** Total feed cost for the whole group ("costo razione"). */
  get batchLoadCost(): number {
    return (this.rationResult()?.totalCost ?? 0) * (this.animalCount || 1);
  }

  constructor() {
    // Overrides can only be read once the active farm is known.
    effect(() => {
      if (this.farmContext.activeFarmId()) {
        void this.loadTargets();
      }
    });
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');

    // Wait for the first feed emission before restoring a saved recipe:
    // matching quantities against an empty list silently loses them.
    this.feedService
      .getAvailableFeeds()
      .pipe(take(1))
      .subscribe((feeds) => {
        this.feedEntries.set(
          feeds.map((f) => ({ feed: f, kgAsFed: 0, selected: false })),
        );
        if (this.route.snapshot.queryParamMap.get('scenario')) {
          void this.loadScenarioFromQuery();
        } else if (id) {
          this.loadRecipe(id);
        } else {
          void this.loadTargets();
        }
      });
  }

  ngAfterViewInit(): void {
    this.updateRadarChart();
  }

  /** Switch the active nutrient targets when the animal group changes. */
  onAnimalGroupChange(): void {
    this.targets = this.referenceTargets(this.animalGroupId);
    this.updateRadarChart();
    void this.loadTargets();
  }

  /** Reference ranges with the source flag the template renders. */
  private referenceTargets(groupId: AnimalGroupId): EffectiveNutrientTarget[] {
    return (TARGET_RANGES[groupId] ?? []).map((target) => ({
      ...target,
      source: 'reference' as const,
    }));
  }

  /**
   * Load the farm's effective targets. A request token prevents a slow
   * response for a previous animal group from overwriting the current one.
   */
  private targetLoadToken = 0;
  private async loadTargets(): Promise<void> {
    const token = ++this.targetLoadToken;
    const groupId = this.animalGroupId;
    const effective = await this.targetService.getEffectiveTargets(
      this.farmContext.activeFarmId(),
      groupId,
    );
    if (token !== this.targetLoadToken || groupId !== this.animalGroupId) {
      return;
    }
    this.targets = effective;
    this.updateRadarChart();
  }

  private updateRadarChart(): void {
    const result = this.rationResult();
    if (!result) return;

    const labels = this.targets.map((t) => t.nutrientCode);
    const values = labels.map((code) => result.nutrients[code] ?? 0);

    const maxRange = Math.max(
      ...this.targets.map(
        (t) => t.maxValue ?? (t.minValue ? t.minValue * 2 : 100),
      ),
      ...values,
    );

    const c = this.chart;
    if (!c) return;

    this.ngZone.runOutsideAngular(() => {
      c.chart!.data.labels = labels;
      c.chart!.data.datasets = [
        {
          label: this.translate.instant('RECIPES.CURRENT_RATION'),
          data: values,
          backgroundColor: 'rgba(78, 204, 163, 0.2)',
          borderColor: '#4ecca3',
          borderWidth: 2,
          pointBackgroundColor: '#4ecca3',
          pointRadius: 4,
        },
      ];
      (c.chart!.options as any).scales.r.min = 0;
      (c.chart!.options as any).scales.r.max = Math.ceil(maxRange * 1.1);
      c.chart!.update();
    });
  }

  private async loadRecipe(id: string): Promise<void> {
    const recipe = await this.recipeService.getRecipeWithFeeds(id);
    if (recipe) {
      this.recipeId = id;
      this.recipeName = recipe.name;
      this.animalGroupId = recipe.animalGroupId;
      this.animalCount = recipe.animalCount ?? 1;
      this.targets = this.referenceTargets(this.animalGroupId);
      void this.loadTargets();

      // Match recipe feeds to available feeds
      if (recipe.feeds) {
        const entries = this.feedEntries();
        for (const rf of recipe.feeds) {
          const entry = entries.find((e) => e.feed.id === rf.feedId);
          if (entry) {
            entry.selected = true;
            entry.kgAsFed = rf.kgAsFed;
          }
        }
        this.feedEntries.set([...entries]);
        this.recalculate();
      }
    }
  }

  recalculate(): void {
    const selected = this.feedEntries().filter(
      (e) => e.selected && e.kgAsFed > 0,
    );
    if (selected.length === 0) {
      this.rationResult.set(null);
      this.radarChartData = { labels: [], datasets: [] };
      return;
    }

    const feeds = selected.map((e) => e.feed);
    const quantities = selected.map((e) => e.kgAsFed);

    const result = this.calculator.calculateRation(feeds, quantities);
    this.rationResult.set(result);
    this.updateRadarChart();
  }

  warningLabel(warning: OptimizationWarning): string {
    const target = this.targets.find(
      (entry) => entry.nutrientCode === warning.code,
    );
    return warningIssueKey(
      warning.issue,
      target?.source === 'override',
    );
  }

  warningLimitValue(warning: OptimizationWarning): number | null {
    return warningLimit(warning);
  }

  warningReferenceValue(warning: OptimizationWarning): number | null {
    const target = this.targets.find(
      (entry) => entry.nutrientCode === warning.code,
    );
    return warningReferenceLimit(warning, target);
  }

  async optimize(): Promise<void> {
    const selected = this.feedEntries().filter((e) => e.selected);
    if (selected.length < 2) return;

    // The solver fixes total dry matter. Without a target, the cost-minimising
    // answer is the smallest possible ration (about 1 kg DM), which is useless.
    // Fall back to the dry matter of the ration already on screen.
    const totalDM =
      this.constraints.totalDM ?? this.rationResult()?.totalDM ?? null;
    if (!totalDM) {
      this.optimizationStatus.set('infeasible');
      this.optimizationMessage.set(
        this.translate.instant('RECIPES.NEED_TOTAL_DM'),
      );
      return;
    }
    const constraints: OptimizationConstraints = {
      ...this.constraints,
      totalDM,
    };

    this.optimizing.set(true);
    this.optimizationMessage.set('');
    this.optimizationWarnings.set([]);

    try {
      const feeds = selected.map((e) => e.feed);
      const result = await this.optimizationService.optimize(
        feeds,
        this.targets,
        constraints,
        'relaxed',
      );

      if (result.status === 'optimal' && result.feeds) {
        // Update quantities from optimizer result
        const entries = this.feedEntries();
        for (const rf of result.feeds) {
          const entry = entries.find((e) => e.feed.id === rf.feedId);
          if (entry) {
            entry.kgAsFed = rf.kgAsFed;
          }
        }
        // Deselect feeds with 0 quantity
        for (const entry of entries) {
          if (
            entry.selected &&
            !result.feeds.find((rf) => rf.feedId === entry.feed.id)
          ) {
            entry.kgAsFed = 0;
          }
        }
        this.feedEntries.set([...entries]);
        this.recalculate();

        this.optimizationStatus.set('optimal');
        this.optimizationMessage.set(this.translate.instant('RECIPES.OPTIMAL'));
      } else if (result.status === 'relaxed' && result.feeds) {
        // Apply the closest feasible ration and surface which targets are unmet.
        const entries = this.feedEntries();
        for (const entry of entries) {
          const rf = result.feeds.find((r) => r.feedId === entry.feed.id);
          entry.kgAsFed = rf ? rf.kgAsFed : 0;
        }
        this.feedEntries.set([...entries]);
        this.recalculate();

        this.optimizationStatus.set('relaxed');
        this.optimizationMessage.set(this.translate.instant('RECIPES.RELAXED'));
        this.optimizationWarnings.set(result.warnings ?? []);
      } else {
        this.optimizationStatus.set('infeasible');
        this.optimizationMessage.set(
          result.message || this.translate.instant('RECIPES.INFEASIBLE'),
        );
        this.optimizationWarnings.set(
          result.warnings ?? result.unreachableTargets ?? [],
        );
      }
    } catch (e: any) {
      this.optimizationStatus.set('infeasible');
      this.optimizationMessage.set(
        e.message || this.translate.instant('RECIPES.OPTIMIZE_FAILED'),
      );
    } finally {
      this.optimizing.set(false);
    }
  }

  async loadScenarioFromQuery(): Promise<void> {
    const id = this.route.snapshot.queryParamMap.get('scenario');
    const farmId = this.farmContext.activeFarmId();
    if (!id || !farmId) return;
    await loadScenarioFlow({
      isDirty: () => this.scenarioDraftController.dirty(),
      confirmDiscard: () =>
        confirm(this.translate.instant('RECIPES.DISCARD_CHANGES')),
      getScenario: () => this.scenarioService.get(farmId, id),
      applyBaseLines: (baseLines) => {
        const lines = new Map(baseLines.map((line) => [line.feedId, line.kgAsFed]));
        this.feedEntries.update((entries) =>
          entries.map((entry) => ({
            ...entry,
            selected: lines.has(entry.feed.id ?? ''),
            kgAsFed: lines.get(entry.feed.id ?? '') ?? entry.kgAsFed,
          })),
        );
      },
      loadChanges: (changes) => this.scenarioDraftController.load(changes),
    });
  }

  clearScenarioChanges(): void {
    this.scenarioDraftController.clear();
  }

  addPriceChange(): void {
    if (!this.scenarioFeedId || this.scenarioPrice === null) return;
    this.scenarioDraftController.setFeedPrice(
      this.scenarioFeedId,
      Number(this.scenarioPrice),
    );
  }

  addInclusionChange(): void {
    if (!this.scenarioFeedId || this.scenarioKg === null) return;
    this.scenarioDraftController.setInclusion(
      this.scenarioFeedId,
      Number(this.scenarioKg),
    );
  }

  addOverrideChange(): void {
    if (!this.scenarioNutrient) return;
    this.scenarioDraftController.setTargetOverride(this.scenarioNutrient, {
      min: this.scenarioMin === null ? null : Number(this.scenarioMin),
      max: this.scenarioMax === null ? null : Number(this.scenarioMax),
    });
  }

  async saveScenario(): Promise<void> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId || this.selectedFeeds().length === 0) return;
    const baseLines = this.selectedFeeds()
      .filter((entry) => entry.feed.id)
      .map((entry) => ({
        feedId: entry.feed.id as string,
        kgAsFed: entry.kgAsFed,
      }));
    const payload = buildBuilderScenarioPayload({
      farmId,
      recipeName: this.recipeName,
      animalGroupId: this.animalGroupId,
      baseLines,
      now: new Date(),
      scenarioId: crypto.randomUUID(),
    });
    const name = prompt(
      this.translate.instant('RECIPES.SCENARIO_NAME'),
      payload.name,
    );
    if (!name) return;
    try {
      await this.scenarioService.save({
        ...payload,
        name,
        changes: this.scenarioDraftController.toChanges(),
      });
      this.scenarioDraftController.saved();
      this.snackBar.open(
        this.translate.instant('RECIPES.SCENARIO_SAVED'),
        undefined,
        { duration: 4000 },
      );
    } catch {
      this.snackBar.open(
        this.translate.instant('RECIPES.SCENARIO_FAILED'),
        undefined,
        { duration: 5000 },
      );
    }
  }

  async saveRecipe(): Promise<void> {
    if (!this.recipeName) return;

    const result = this.rationResult();
    if (!result) return;

    this.saving.set(true);

    try {
      const selected = this.feedEntries().filter(
        (e) => e.selected && e.kgAsFed > 0,
      );
      const recipeFeeds = selected.map((e) => ({
        feedId: e.feed.id!,
        feedName: e.feed.name,
        feedCategory: e.feed.category,
        kgAsFed: e.kgAsFed,
        kgDM: e.kgAsFed * (1 - e.feed.moisturePct / 100),
        cost: e.kgAsFed * e.feed.pricePerKg,
      }));

      // Herd size is a batch multiplier: keep it a sane positive integer.
      const animalCount = Math.min(
        Math.max(Math.round(this.animalCount || 1), 1),
        100000,
      );
      this.animalCount = animalCount;

      const payload = {
        name: this.recipeName,
        animalGroupId: this.animalGroupId,
        totalAsFed: result.totalAsFed,
        totalDM: result.totalDM,
        cost: result.totalCost,
        animalCount,
        nutrientAnalysis: result.nutrients,
      };

      if (this.recipeId) {
        await this.recipeService.updateRecipe(this.recipeId, payload, recipeFeeds);
      } else {
        this.recipeId = await this.recipeService.saveRecipe(payload, recipeFeeds);
      }

      this.snackBar.open(this.translate.instant('RECIPES.SAVED'), '', {
        duration: 3000,
      });
      this.router.navigate(['/recipes']);
    } catch (e) {
      this.snackBar.open(this.translate.instant('RECIPES.SAVE_FAILED'), '', {
        duration: 3000,
      });
    } finally {
      this.saving.set(false);
    }
  }

  getNutrientBarValue(target: NutrientTarget): number {
    const value = this.rationResult()?.nutrients[target.nutrientCode] ?? 0;
    const max =
      target.maxValue ?? (target.minValue ? target.minValue * 2 : 100);
    return Math.min((value / max) * 100, 100);
  }

  getNutrientStatus(target: NutrientTarget): 'good' | 'warning' | 'danger' {
    const value = this.rationResult()?.nutrients[target.nutrientCode] ?? 0;
    return this.calculator.evaluateNutrientStatus(
      value,
      target.minValue,
      target.maxValue,
    );
  }
}
