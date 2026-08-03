import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { RecipeService } from '../../core/services/recipe.service';
import { ExportService } from '../../core/services/export.service';
import { Recipe } from '../../core/models/recipe.model';

@Component({
  selector: 'mf-recipe-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatMenuModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    TranslatePipe,
  ],
  template: `
    <div class="recipe-list-page">
      <div class="page-header">
        <h1 class="page-title">{{ 'RECIPES.TITLE' | translate }}</h1>
        <button
          mat-flat-button
          color="primary"
          routerLink="/recipes/new"
          id="new-recipe-btn"
        >
          <mat-icon>add</mat-icon>
          {{ 'RECIPES.NEW' | translate }}
        </button>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else if (recipes().length === 0) {
        <div class="empty-state">
          <mat-icon class="empty-icon">science</mat-icon>
          <p>{{ 'RECIPES.NO_RECIPES' | translate }}</p>
          <button mat-flat-button color="primary" routerLink="/recipes/new">
            <mat-icon>add</mat-icon>
            {{ 'RECIPES.NEW' | translate }}
          </button>
        </div>
      } @else {
        <div class="recipes-grid">
          @for (recipe of recipes(); track recipe.id) {
            <mat-card class="recipe-card" appearance="outlined">
              <mat-card-header>
                <mat-card-title>{{ recipe.name }}</mat-card-title>
                <mat-card-subtitle>
                  <span class="group-chip" [class]="recipe.animalGroupId">
                    {{ getGroupLabel(recipe.animalGroupId) }}
                  </span>
                </mat-card-subtitle>
              </mat-card-header>

              <mat-card-content>
                <div class="recipe-stats">
                  <div class="recipe-stat">
                    <span class="stat-label">{{
                      'RECIPES.TOTAL_DM' | translate
                    }}</span>
                    <span class="stat-value"
                      >{{ recipe.totalDM | number: '1.1-1' }} kg</span
                    >
                  </div>
                  <div class="recipe-stat">
                    <span class="stat-label">{{
                      'RECIPES.TOTAL_COST' | translate
                    }}</span>
                    <span class="stat-value"
                      >€{{ recipe.cost | number: '1.2-2' }}</span
                    >
                  </div>
                  <div class="recipe-stat">
                    <span class="stat-label">{{
                      'RECIPES.TOTAL_AS_FED' | translate
                    }}</span>
                    <span class="stat-value"
                      >{{ recipe.totalAsFed | number: '1.1-1' }} kg</span
                    >
                  </div>
                </div>
              </mat-card-content>

              <mat-card-actions align="end">
                <button
                  mat-button
                  [routerLink]="['/recipes', recipe.id]"
                  color="primary"
                >
                  <mat-icon>edit</mat-icon>
                  {{ 'RECIPES.OPEN' | translate }}
                </button>
                <button mat-icon-button [matMenuTriggerFor]="menu">
                  <mat-icon>more_vert</mat-icon>
                </button>
                <mat-menu #menu="matMenu">
                  <button mat-menu-item (click)="duplicateRecipe(recipe)">
                    <mat-icon>content_copy</mat-icon>
                    {{ 'RECIPES.DUPLICATE' | translate }}
                  </button>
                  <button
                    mat-menu-item
                    (click)="exportRecipe(recipe)"
                    [disabled]="exportingId() === recipe.id"
                  >
                    <mat-icon>download</mat-icon>
                    {{
                      (exportingId() === recipe.id
                        ? 'RECIPES.EXPORTING'
                        : 'RECIPES.EXPORT'
                      ) | translate
                    }}
                  </button>
                  <button
                    mat-menu-item
                    (click)="deleteRecipe(recipe)"
                    class="delete-item"
                  >
                    <mat-icon color="warn">delete</mat-icon>
                    {{ 'FEEDS.DELETE' | translate }}
                  </button>
                </mat-menu>
              </mat-card-actions>
            </mat-card>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .recipe-list-page {
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
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
    }

    .page-title {
      font-size: 28px;
      font-weight: 700;
      margin: 0;
    }

    .recipes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 20px;
    }

    .recipe-card {
      border-radius: 16px !important;
      transition:
        transform 0.2s ease,
        box-shadow 0.2s ease;
    }

    .recipe-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
    }

    .group-chip {
      display: inline-block;
      padding: 2px 10px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
    }

    .group-chip.lactating {
      background: rgba(33, 150, 243, 0.12);
      color: #1565c0;
    }

    .group-chip.dry {
      background: rgba(255, 152, 0, 0.12);
      color: #e65100;
    }

    .group-chip.heifer {
      background: rgba(156, 39, 176, 0.12);
      color: #7b1fa2;
    }

    .recipe-stats {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 12px;
      margin-top: 16px;
    }

    .recipe-stat {
      display: flex;
      flex-direction: column;
    }

    .recipe-stat .stat-label {
      font-size: 11px;
      color: rgba(0, 0, 0, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .recipe-stat .stat-value {
      font-size: 18px;
      font-weight: 600;
      margin-top: 2px;
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 64px 0;
    }

    .empty-state {
      text-align: center;
      padding: 64px 16px;
      color: rgba(0, 0, 0, 0.4);
    }

    .empty-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
    }

    .delete-item {
      color: #f44336;
    }
  `,
})
export class RecipeListComponent implements OnInit {
  private recipeService = inject(RecipeService);
  private exportService = inject(ExportService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  recipes = signal<Recipe[]>([]);
  loading = signal(true);
  exportingId = signal<string | null>(null);

  ngOnInit(): void {
    this.recipeService.getRecipes().subscribe((recipes) => {
      this.recipes.set(recipes);
      this.loading.set(false);
    });
  }

  getGroupLabel(groupId: string): string {
    const key = `RECIPES.${groupId.toUpperCase()}`;
    return this.translate.instant(key);
  }

  async duplicateRecipe(recipe: Recipe): Promise<void> {
    try {
      await this.recipeService.duplicateRecipe(
        recipe.id!,
        `${recipe.name} (copy)`,
      );
      this.snackBar.open(this.translate.instant('RECIPES.DUPLICATED'), '', {
        duration: 3000,
      });
    } catch (e) {
      this.snackBar.open(
        this.translate.instant('RECIPES.DUPLICATE_FAILED'),
        '',
        { duration: 3000 },
      );
    }
  }

  async exportRecipe(recipe: Recipe): Promise<void> {
    this.exportingId.set(recipe.id!);
    try {
      const full = await this.recipeService.getRecipeWithFeeds(recipe.id!);
      await this.exportService.exportRecipeToExcel(full ?? recipe);
    } catch (e) {
      this.snackBar.open(this.translate.instant('RECIPES.EXPORT_FAILED'), '', {
        duration: 3000,
      });
    } finally {
      this.exportingId.set(null);
    }
  }

  async deleteRecipe(recipe: Recipe): Promise<void> {
    const msg = this.translate.instant('RECIPES.DELETE_CONFIRM');
    if (confirm(msg)) {
      await this.recipeService.deleteRecipe(recipe.id!);
      this.snackBar.open(this.translate.instant('RECIPES.DELETED'), '', {
        duration: 3000,
      });
    }
  }
}
