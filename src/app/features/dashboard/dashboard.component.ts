import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';
import { FeedService } from '../../core/services/feed.service';
import { RecipeService } from '../../core/services/recipe.service';
import { Feed } from '../../core/models/feed.model';
import { Recipe } from '../../core/models/recipe.model';

@Component({
  selector: 'mf-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    TranslatePipe,
  ],
  template: `
    <div class="dashboard">
      <h1 class="page-title">
        {{ 'DASHBOARD.WELCOME' | translate }}, {{ authService.displayName() }}! 👋
      </h1>

      <!-- Stats Cards -->
      <div class="stats-grid">
        <mat-card class="stat-card" appearance="outlined">
          <mat-card-content>
            <div class="stat-icon-wrapper forage">
              <mat-icon>grass</mat-icon>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ totalFeeds() }}</span>
              <span class="stat-label">{{ 'DASHBOARD.TOTAL_FEEDS' | translate }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card" appearance="outlined">
          <mat-card-content>
            <div class="stat-icon-wrapper available">
              <mat-icon>check_circle</mat-icon>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ availableFeeds() }}</span>
              <span class="stat-label">{{ 'DASHBOARD.AVAILABLE_FEEDS' | translate }}</span>
            </div>
          </mat-card-content>
        </mat-card>

        <mat-card class="stat-card" appearance="outlined">
          <mat-card-content>
            <div class="stat-icon-wrapper recipe">
              <mat-icon>science</mat-icon>
            </div>
            <div class="stat-info">
              <span class="stat-value">{{ totalRecipes() }}</span>
              <span class="stat-label">{{ 'DASHBOARD.TOTAL_RECIPES' | translate }}</span>
            </div>
          </mat-card-content>
        </mat-card>
      </div>

      <!-- Quick Actions -->
      <h2 class="section-title">{{ 'DASHBOARD.QUICK_ACTIONS' | translate }}</h2>
      <div class="actions-grid">
        <mat-card
          class="action-card"
          appearance="outlined"
          routerLink="/recipes/new"
        >
          <mat-card-content>
            <mat-icon class="action-icon">add_circle</mat-icon>
            <span class="action-label">{{ 'DASHBOARD.NEW_RECIPE' | translate }}</span>
          </mat-card-content>
        </mat-card>

        <mat-card
          class="action-card"
          appearance="outlined"
          routerLink="/feeds"
        >
          <mat-card-content>
            <mat-icon class="action-icon">grass</mat-icon>
            <span class="action-label">{{ 'DASHBOARD.MANAGE_FEEDS' | translate }}</span>
          </mat-card-content>
        </mat-card>

        <mat-card
          class="action-card"
          appearance="outlined"
          routerLink="/recipes"
        >
          <mat-card-content>
            <mat-icon class="action-icon">list_alt</mat-icon>
            <span class="action-label">{{ 'DASHBOARD.VIEW_RECIPES' | translate }}</span>
          </mat-card-content>
        </mat-card>
      </div>
    </div>
  `,
  styles: `
    .dashboard {
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .page-title {
      font-size: 28px;
      font-weight: 700;
      margin: 0 0 32px;
      letter-spacing: -0.5px;
    }

    .section-title {
      font-size: 20px;
      font-weight: 600;
      margin: 32px 0 16px;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
    }

    .stat-card {
      border-radius: 16px !important;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
    }

    .stat-card mat-card-content {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px !important;
    }

    .stat-icon-wrapper {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stat-icon-wrapper.forage {
      background: rgba(76, 175, 80, 0.12);
      color: #4caf50;
    }

    .stat-icon-wrapper.available {
      background: rgba(78, 204, 163, 0.12);
      color: #4ecca3;
    }

    .stat-icon-wrapper.recipe {
      background: rgba(103, 58, 183, 0.12);
      color: #673ab7;
    }

    .stat-icon-wrapper mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    .stat-info {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 32px;
      font-weight: 700;
      line-height: 1;
    }

    .stat-label {
      font-size: 13px;
      color: rgba(0, 0, 0, 0.5);
      margin-top: 4px;
    }

    .actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
    }

    .action-card {
      border-radius: 16px !important;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    }

    .action-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
      background: rgba(78, 204, 163, 0.04);
    }

    .action-card mat-card-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 32px 16px !important;
    }

    .action-icon {
      font-size: 36px;
      width: 36px;
      height: 36px;
      color: #4ecca3;
    }

    .action-label {
      font-size: 14px;
      font-weight: 600;
      text-align: center;
    }
  `,
})
export class DashboardComponent implements OnInit {
  authService = inject(AuthService);
  private feedService = inject(FeedService);
  private recipeService = inject(RecipeService);

  totalFeeds = signal(0);
  availableFeeds = signal(0);
  totalRecipes = signal(0);

  ngOnInit(): void {
    this.feedService.getFeeds().subscribe((feeds: Feed[]) => {
      this.totalFeeds.set(feeds.length);
      this.availableFeeds.set(feeds.filter((f) => f.isAvailable).length);
    });

    this.recipeService.getRecipes().subscribe((recipes: Recipe[]) => {
      this.totalRecipes.set(recipes.length);
    });
  }
}
