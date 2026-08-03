import { Component, inject, OnInit, signal, computed } from '@angular/core';
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
import { FeedService } from '../../core/services/feed.service';
import { RecipeService } from '../../core/services/recipe.service';
import { OptimizationService, OptimizationConstraints } from '../../core/services/optimization.service';
import { RationCalculatorService, RationResult } from '../../core/services/ration-calculator.service';
import { Feed } from '../../core/models/feed.model';
import { AnimalGroupId } from '../../core/models/recipe.model';
import { NutrientTarget } from '../../core/models/nutrient.model';

interface RecipeFeedEntry {
  feed: Feed;
  kgAsFed: number;
  selected: boolean;
}

/** Default nutrient targets for lactating cows (placeholder) */
const DEFAULT_TARGETS: NutrientTarget[] = [
  { nutrientCode: 'proteina', minValue: 15.0, maxValue: 17.5, isActive: true },
  { nutrientCode: 'ee', minValue: 3.0, maxValue: 5.5, isActive: true },
  { nutrientCode: 'amido', minValue: 24.0, maxValue: 30.0, isActive: true },
  { nutrientCode: 'aNDF', minValue: 28.0, maxValue: 36.0, isActive: true },
  { nutrientCode: 'ADF', minValue: 17.0, maxValue: 23.0, isActive: true },
  { nutrientCode: 'NFC', minValue: 35.0, maxValue: 42.0, isActive: true },
  { nutrientCode: 'ceneri', minValue: null, maxValue: 8.0, isActive: true },
  { nutrientCode: 'Ca', minValue: 0.6, maxValue: 1.0, isActive: true },
  { nutrientCode: 'P', minValue: 0.35, maxValue: 0.5, isActive: true },
];

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
                  <mat-label>{{ 'RECIPES.ANIMAL_GROUP' | translate }}</mat-label>
                  <mat-select [(ngModel)]="animalGroupId" id="animal-group-select">
                    <mat-option value="lactating">{{ 'RECIPES.LACTATING' | translate }}</mat-option>
                    <mat-option value="dry">{{ 'RECIPES.DRY' | translate }}</mat-option>
                    <mat-option value="heifer">{{ 'RECIPES.HEIFER' | translate }}</mat-option>
                  </mat-select>
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
                    <mat-label>{{ 'RECIPES.TOTAL_DM_CONSTRAINT' | translate }}</mat-label>
                    <input matInput type="number" [(ngModel)]="constraints.totalDM" step="0.1" />
                    <span matSuffix>kg</span>
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="flex-1">
                    <mat-label>{{ 'RECIPES.MIN_FORAGE_RATIO' | translate }}</mat-label>
                    <input matInput type="number" [(ngModel)]="constraints.minForageRatio" step="0.01" min="0" max="1" />
                  </mat-form-field>
                  <mat-form-field appearance="outline" class="flex-1">
                    <mat-label>{{ 'RECIPES.MAX_FORAGE_RATIO' | translate }}</mat-label>
                    <input matInput type="number" [(ngModel)]="constraints.maxForageRatio" step="0.01" min="0" max="1" />
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
                <table mat-table [dataSource]="feedEntries()" class="feeds-table">
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
                    <th mat-header-cell *matHeaderCellDef>{{ 'RECIPES.FEED_NAME' | translate }}</th>
                    <td mat-cell *matCellDef="let entry">
                      <span class="feed-name">{{ entry.feed.name }}</span>
                      <span class="category-badge" [class]="entry.feed.category">
                        {{ entry.feed.category === 'forage' ? 'F' : 'C' }}
                      </span>
                    </td>
                  </ng-container>

                  <!-- Quantity -->
                  <ng-container matColumnDef="quantity">
                    <th mat-header-cell *matHeaderCellDef>{{ 'RECIPES.QUANTITY_KG' | translate }}</th>
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
                      {{ entry.feed.pricePerKg | number:'1.3-3' }}
                    </td>
                  </ng-container>

                  <tr mat-header-row *matHeaderRowDef="feedColumns"></tr>
                  <tr mat-row *matRowDef="let row; columns: feedColumns;"></tr>
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
                  <mat-icon>auto_fix_high</mat-icon>
                  {{ 'RECIPES.OPTIMIZE' | translate }}
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
                  <div class="optimization-message" [class]="optimizationStatus()">
                    <mat-icon>{{ optimizationStatus() === 'optimal' ? 'check_circle' : 'warning' }}</mat-icon>
                    {{ optimizationMessage() }}
                  </div>
                }

                <div class="results-summary">
                  <div class="result-item">
                    <span class="result-label">{{ 'RECIPES.TOTAL_DM' | translate }}</span>
                    <span class="result-value">{{ rationResult()!.totalDM | number:'1.2-2' }} kg</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">{{ 'RECIPES.TOTAL_AS_FED' | translate }}</span>
                    <span class="result-value">{{ rationResult()!.totalAsFed | number:'1.2-2' }} kg</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">{{ 'RECIPES.TOTAL_COST' | translate }}</span>
                    <span class="result-value highlight">€{{ rationResult()!.totalCost | number:'1.2-4' }}</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">{{ 'RECIPES.FORAGE_RATIO' | translate }}</span>
                    <span class="result-value">{{ rationResult()!.forageRatio | percent:'1.1-1' }}</span>
                  </div>
                  <div class="result-item">
                    <span class="result-label">{{ 'RECIPES.MOISTURE_PCT' | translate }}</span>
                    <span class="result-value">{{ rationResult()!.moisturePct | number:'1.1-1' }}%</span>
                  </div>
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
                    @if (rationResult()!.nutrients[target.nutrientCode] !== undefined) {
                      <div class="nutrient-row">
                        <div class="nutrient-label">
                          <span>{{ target.nutrientCode }}</span>
                          <span class="nutrient-value">
                            {{ rationResult()!.nutrients[target.nutrientCode] | number:'1.2-2' }}
                          </span>
                        </div>
                        <div class="nutrient-bar-container">
                          <mat-progress-bar
                            mode="determinate"
                            [value]="getNutrientBarValue(target)"
                            [class]="getNutrientStatus(target)"
                          ></mat-progress-bar>
                          <div class="target-range-label">
                            {{ target.minValue !== null ? target.minValue : '—' }}
                            –
                            {{ target.maxValue !== null ? target.maxValue : '—' }}
                          </div>
                        </div>
                        <mat-icon
                          class="status-icon"
                          [class]="getNutrientStatus(target)"
                          [matTooltip]="getNutrientStatus(target)"
                        >
                          {{ getNutrientStatus(target) === 'good' ? 'check_circle' : getNutrientStatus(target) === 'warning' ? 'warning' : 'error' }}
                        </mat-icon>
                      </div>
                    }
                  }
                </div>
              </mat-card-content>
            </mat-card>

            <!-- Save Button -->
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
                <mat-icon>save</mat-icon>
                {{ 'RECIPES.SAVE' | translate }}
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
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
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

    .flex-1 { flex: 1; min-width: 120px; }

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

    .result-value {
      font-size: 20px;
      font-weight: 600;
      margin-top: 2px;
    }

    .result-value.highlight {
      color: #4ecca3;
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

    .status-icon.good { color: #4caf50; }
    .status-icon.warning { color: #ff9800; }
    .status-icon.danger { color: #f44336; }

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
export class RecipeBuilderComponent implements OnInit {
  private feedService = inject(FeedService);
  private recipeService = inject(RecipeService);
  private optimizationService = inject(OptimizationService);
  private calculator = inject(RationCalculatorService);
  private snackBar = inject(MatSnackBar);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private translate = inject(TranslateService);

  feedColumns = ['select', 'name', 'quantity', 'price'];

  recipeName = '';
  animalGroupId: AnimalGroupId = 'lactating';
  constraints: OptimizationConstraints = {};
  targets: NutrientTarget[] = DEFAULT_TARGETS;

  feedEntries = signal<RecipeFeedEntry[]>([]);
  rationResult = signal<RationResult | null>(null);
  optimizing = signal(false);
  saving = signal(false);
  optimizationMessage = signal('');
  optimizationStatus = signal<'optimal' | 'infeasible' | ''>('');

  selectedFeeds = computed(() =>
    this.feedEntries().filter((e) => e.selected && e.kgAsFed > 0)
  );

  ngOnInit(): void {
    this.feedService.getAvailableFeeds().subscribe((feeds) => {
      this.feedEntries.set(
        feeds.map((f) => ({ feed: f, kgAsFed: 0, selected: false }))
      );
    });

    // If editing an existing recipe, load it
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadRecipe(id);
    }
  }

  private async loadRecipe(id: string): Promise<void> {
    const recipe = await this.recipeService.getRecipeWithFeeds(id);
    if (recipe) {
      this.recipeName = recipe.name;
      this.animalGroupId = recipe.animalGroupId;

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
    const selected = this.feedEntries().filter((e) => e.selected && e.kgAsFed > 0);
    if (selected.length === 0) {
      this.rationResult.set(null);
      return;
    }

    const feeds = selected.map((e) => e.feed);
    const quantities = selected.map((e) => e.kgAsFed);

    const result = this.calculator.calculateRation(feeds, quantities);
    this.rationResult.set(result);
  }

  async optimize(): Promise<void> {
    const selected = this.feedEntries().filter((e) => e.selected);
    if (selected.length < 2) return;

    this.optimizing.set(true);
    this.optimizationMessage.set('');

    try {
      const feeds = selected.map((e) => e.feed);
      const result = await this.optimizationService.optimize(
        feeds,
        this.targets,
        this.constraints
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
          if (entry.selected && !result.feeds.find((rf) => rf.feedId === entry.feed.id)) {
            entry.kgAsFed = 0;
          }
        }
        this.feedEntries.set([...entries]);
        this.recalculate();

        this.optimizationStatus.set('optimal');
        this.optimizationMessage.set(this.translate.instant('RECIPES.OPTIMAL'));
      } else {
        this.optimizationStatus.set('infeasible');
        this.optimizationMessage.set(
          result.message || this.translate.instant('RECIPES.INFEASIBLE')
        );
      }
    } catch (e: any) {
      this.optimizationStatus.set('infeasible');
      this.optimizationMessage.set(e.message || 'Optimization failed');
    } finally {
      this.optimizing.set(false);
    }
  }

  async saveRecipe(): Promise<void> {
    if (!this.recipeName) return;

    const result = this.rationResult();
    if (!result) return;

    this.saving.set(true);

    try {
      const selected = this.feedEntries().filter((e) => e.selected && e.kgAsFed > 0);
      const recipeFeeds = selected.map((e) => ({
        feedId: e.feed.id!,
        feedName: e.feed.name,
        feedCategory: e.feed.category,
        kgAsFed: e.kgAsFed,
        kgDM: e.kgAsFed * (1 - e.feed.moisturePct / 100),
        cost: e.kgAsFed * e.feed.pricePerKg,
      }));

      await this.recipeService.saveRecipe(
        {
          name: this.recipeName,
          animalGroupId: this.animalGroupId,
          totalAsFed: result.totalAsFed,
          totalDM: result.totalDM,
          cost: result.totalCost,
          nutrientAnalysis: result.nutrients,
        },
        recipeFeeds
      );

      this.snackBar.open('Recipe saved!', '', { duration: 3000 });
      this.router.navigate(['/recipes']);
    } catch (e) {
      this.snackBar.open('Failed to save recipe', '', { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }

  getNutrientBarValue(target: NutrientTarget): number {
    const value = this.rationResult()?.nutrients[target.nutrientCode] ?? 0;
    const max = target.maxValue ?? (target.minValue ? target.minValue * 2 : 100);
    return Math.min((value / max) * 100, 100);
  }

  getNutrientStatus(target: NutrientTarget): 'good' | 'warning' | 'danger' {
    const value = this.rationResult()?.nutrients[target.nutrientCode] ?? 0;
    return this.calculator.evaluateNutrientStatus(value, target.minValue, target.maxValue);
  }
}
