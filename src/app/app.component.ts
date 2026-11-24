import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'mf-root',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    TranslatePipe,
  ],
  template: `
    @if (authService.isAuthenticated()) {
      <mat-sidenav-container class="app-container">
        <mat-sidenav #sidenav mode="side" [opened]="true" class="app-sidenav">
          <div class="sidenav-header">
            <div class="logo-container">
              <mat-icon class="logo-icon">agriculture</mat-icon>
              <span class="logo-text">Milk Farm</span>
            </div>
          </div>

          <mat-nav-list>
            <a
              mat-list-item
              routerLink="/dashboard"
              routerLinkActive="active-link"
            >
              <mat-icon matListItemIcon>dashboard</mat-icon>
              <span matListItemTitle>{{ 'NAV.DASHBOARD' | translate }}</span>
            </a>
            <a mat-list-item routerLink="/feeds" routerLinkActive="active-link">
              <mat-icon matListItemIcon>grass</mat-icon>
              <span matListItemTitle>{{ 'NAV.FEEDS' | translate }}</span>
            </a>
            <a
              mat-list-item
              routerLink="/recipes"
              routerLinkActive="active-link"
            >
              <mat-icon matListItemIcon>science</mat-icon>
              <span matListItemTitle>{{ 'NAV.RECIPES' | translate }}</span>
            </a>
            <a
              mat-list-item
              routerLink="/accuracy"
              routerLinkActive="active-link"
            >
              <mat-icon matListItemIcon>insights</mat-icon>
              <span matListItemTitle>{{ 'NAV.ACCURACY' | translate }}</span>
            </a>
            <a
              mat-list-item
              routerLink="/loading"
              routerLinkActive="active-link"
            >
              <mat-icon matListItemIcon>scale</mat-icon>
              <span matListItemTitle>{{ 'NAV.LOADING' | translate }}</span>
            </a>
            <a
              mat-list-item
              routerLink="/groups"
              routerLinkActive="active-link"
            >
              <mat-icon matListItemIcon>pets</mat-icon>
              <span matListItemTitle>{{ 'NAV.GROUPS' | translate }}</span>
            </a>
            <a
              mat-list-item
              routerLink="/inventory"
              routerLinkActive="active-link"
            >
              <mat-icon matListItemIcon>inventory_2</mat-icon>
              <span matListItemTitle>{{ 'NAV.INVENTORY' | translate }}</span>
            </a>
            <a
              mat-list-item
              routerLink="/targets"
              routerLinkActive="active-link"
            >
              <mat-icon matListItemIcon>track_changes</mat-icon>
              <span matListItemTitle>{{ 'NAV.TARGETS' | translate }}</span>
            </a>
          </mat-nav-list>

          <div class="sidenav-footer">
            <mat-nav-list>
              <a mat-list-item (click)="authService.logout()">
                <mat-icon matListItemIcon>logout</mat-icon>
                <span matListItemTitle>{{ 'NAV.LOGOUT' | translate }}</span>
              </a>
            </mat-nav-list>
          </div>
        </mat-sidenav>

        <mat-sidenav-content class="app-content">
          <mat-toolbar class="app-toolbar">
            <button
              mat-icon-button
              (click)="sidenav.toggle()"
              class="menu-toggle"
            >
              <mat-icon>menu</mat-icon>
            </button>

            <span class="toolbar-spacer"></span>

            <!-- Language Toggle -->
            <button mat-icon-button [matMenuTriggerFor]="langMenu">
              <mat-icon>language</mat-icon>
            </button>
            <mat-menu #langMenu="matMenu">
              <button mat-menu-item (click)="switchLanguage('it')">
                🇮🇹 Italiano
              </button>
              <button mat-menu-item (click)="switchLanguage('en')">
                🇬🇧 English
              </button>
            </mat-menu>

            <!-- User Menu -->
            <button mat-icon-button [matMenuTriggerFor]="userMenu">
              <mat-icon>account_circle</mat-icon>
            </button>
            <mat-menu #userMenu="matMenu">
              <div class="user-menu-header" mat-menu-item disabled>
                <strong>{{ authService.displayName() }}</strong>
              </div>
              <button mat-menu-item (click)="authService.logout()">
                <mat-icon>logout</mat-icon>
                {{ 'NAV.LOGOUT' | translate }}
              </button>
            </mat-menu>
          </mat-toolbar>

          <main class="main-content">
            <router-outlet />
          </main>
        </mat-sidenav-content>
      </mat-sidenav-container>
    } @else {
      <router-outlet />
    }
  `,
  styles: `
    .app-container {
      height: 100vh;
    }

    .app-sidenav {
      width: 260px;
      background: linear-gradient(180deg, #0f0c29 0%, #1a1a3e 100%);
      color: #ffffff;
      border-right: none;
      display: flex;
      flex-direction: column;
    }

    .sidenav-header {
      padding: 24px 16px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #4ecca3;
    }

    .logo-text {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.5px;
    }

    .app-sidenav mat-nav-list a {
      color: rgba(255, 255, 255, 0.78) !important;
    }

    .app-sidenav mat-nav-list a span[matListItemTitle] {
      color: rgba(255, 255, 255, 0.78) !important;
    }

    .app-sidenav mat-nav-list a.active-link span[matListItemTitle] {
      color: #ffffff !important;
    }

    .app-sidenav mat-nav-list a.active-link {
      background: rgba(78, 204, 163, 0.22) !important;
      color: #ffffff !important;
    }

    .sidenav-footer {
      margin-top: auto;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .app-toolbar {
      background: transparent;
      color: inherit;
      box-shadow: none;
      border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    }

    .menu-toggle {
      display: none;
    }

    .toolbar-spacer {
      flex: 1;
    }

    .main-content {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .active-link {
      background: rgba(78, 204, 163, 0.12) !important;
    }

    .user-menu-header {
      padding: 8px 16px;
      opacity: 1 !important;
    }

    @media (max-width: 768px) {
      .menu-toggle {
        display: inline-flex;
      }

      .app-sidenav {
        width: 240px;
      }
    }
  `,
})
export class AppComponent {
  private translate = inject(TranslateService);
  authService = inject(AuthService);

  constructor() {
    this.translate.addLangs(['it', 'en']);
    this.translate.use('it');
  }

  switchLanguage(lang: string): void {
    this.translate.use(lang);
  }
}
