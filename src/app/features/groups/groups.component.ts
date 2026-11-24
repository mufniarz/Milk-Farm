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
import { take } from 'rxjs/operators';
import { HerdGroup } from '../../core/models/group.model';
import { Recipe } from '../../core/models/recipe.model';
import { AnimalGroupId } from '../../core/models/recipe.model';
import { GroupService } from '../../core/services/group.service';
import { RecipeService } from '../../core/services/recipe.service';
import { FarmContextService } from '../../core/services/farm-context.service';

/**
 * Herd groups: name, nutritional category, head count and active recipe.
 * The head count here is the source of truth for group economics; the recipe's
 * own `animalCount` is only the builder's batch default.
 */
@Component({
  selector: 'mf-groups',
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
    <div class="groups-page">
      <h1 class="page-title">{{ 'GROUPS.TITLE' | translate }}</h1>
      <p class="page-subtitle">{{ 'GROUPS.SUBTITLE' | translate }}</p>

      <mat-card appearance="outlined" class="form-card">
        <mat-card-content class="form-grid">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'GROUPS.NAME' | translate }}</mat-label>
            <input matInput [(ngModel)]="draft.name" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'GROUPS.CATEGORY' | translate }}</mat-label>
            <mat-select [(ngModel)]="draft.animalGroupId">
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
          <mat-form-field appearance="outline">
            <mat-label>{{ 'GROUPS.HEAD_COUNT' | translate }}</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="draft.headCount" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>{{ 'GROUPS.ACTIVE_RECIPE' | translate }}</mat-label>
            <mat-select [(ngModel)]="draft.activeRecipeId">
              <mat-option [value]="null">{{ 'GROUPS.NONE' | translate }}</mat-option>
              @for (recipe of recipes; track recipe.id) {
                <mat-option [value]="recipe.id">{{ recipe.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <button
            mat-flat-button
            color="primary"
            (click)="create()"
            [disabled]="saving || !draft.name.trim()"
          >
            {{ 'GROUPS.CREATE' | translate }}
          </button>
        </mat-card-content>
      </mat-card>

      <mat-card appearance="outlined">
        <mat-card-content>
          <div class="group-header">
            <span>{{ 'GROUPS.NAME' | translate }}</span>
            <span>{{ 'GROUPS.CATEGORY' | translate }}</span>
            <span>{{ 'GROUPS.HEAD_COUNT' | translate }}</span>
            <span>{{ 'GROUPS.ACTIVE_RECIPE' | translate }}</span>
            <span></span>
          </div>
          @for (group of groups; track group.id) {
            <div class="group-row">
              <span class="group-name">{{ group.name }}</span>
              <span>{{ group.animalGroupId }}</span>
              <span>{{ group.headCount }}</span>
              <mat-form-field appearance="outline" class="inline-select">
                <mat-select
                  [ngModel]="group.activeRecipeId"
                  (ngModelChange)="setActiveRecipe(group, $event)"
                >
                  <mat-option [value]="null">{{
                    'GROUPS.NONE' | translate
                  }}</mat-option>
                  @for (recipe of recipes; track recipe.id) {
                    <mat-option [value]="recipe.id">{{ recipe.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
              <button mat-icon-button (click)="remove(group)">
                <mat-icon>delete</mat-icon>
              </button>
            </div>
          } @empty {
            <p class="empty">{{ 'GROUPS.EMPTY' | translate }}</p>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .groups-page {
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
    .form-card {
      margin-bottom: 16px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr 1fr 1.4fr auto;
      gap: 12px;
      align-items: center;
    }
    .group-header,
    .group-row {
      display: grid;
      grid-template-columns: 1.4fr 1fr 0.8fr 1.6fr auto;
      gap: 12px;
      align-items: center;
      padding: 8px 4px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    .group-header {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: rgba(0, 0, 0, 0.5);
      border-bottom: 1px solid rgba(0, 0, 0, 0.15);
    }
    .group-name {
      font-weight: 600;
    }
    .inline-select {
      width: 100%;
    }
    .empty {
      color: rgba(0, 0, 0, 0.5);
      padding: 16px 4px;
    }
    @media (max-width: 760px) {
      .form-grid,
      .group-header,
      .group-row {
        grid-template-columns: 1fr;
      }
      .group-header {
        display: none;
      }
    }
  `,
})
export class GroupsComponent implements OnInit {
  private groupService = inject(GroupService);
  private recipeService = inject(RecipeService);
  private farmContext = inject(FarmContextService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  groups: HerdGroup[] = [];
  recipes: Recipe[] = [];
  saving = false;

  draft = {
    name: '',
    animalGroupId: 'lactating' as AnimalGroupId,
    headCount: 1,
    activeRecipeId: null as string | null,
  };

  ngOnInit(): void {
    this.groupService
      .getGroups()
      .subscribe((groups) => (this.groups = groups));
    this.recipeService
      .getRecipes()
      .pipe(take(1))
      .subscribe((recipes) => (this.recipes = recipes));
  }

  async create(): Promise<void> {
    if (!this.draft.name.trim()) return;
    this.saving = true;
    try {
      await this.groupService.createGroup({
        name: this.draft.name,
        animalGroupId: this.draft.animalGroupId,
        headCount: this.draft.headCount,
        activeRecipeId: this.draft.activeRecipeId,
      });
      this.draft = {
        name: '',
        animalGroupId: 'lactating',
        headCount: 1,
        activeRecipeId: null,
      };
      this.snackBar.open(
        this.translate.instant('GROUPS.CREATED'),
        undefined,
        { duration: 3000 },
      );
    } finally {
      this.saving = false;
    }
  }

  async setActiveRecipe(
    group: HerdGroup,
    recipeId: string | null,
  ): Promise<void> {
    if (!group.id) return;
    await this.groupService.updateGroup(group.id, {
      activeRecipeId: recipeId,
    });
  }

  async remove(group: HerdGroup): Promise<void> {
    if (!group.id) return;
    await this.groupService.deleteGroup(group.id);
  }
}
