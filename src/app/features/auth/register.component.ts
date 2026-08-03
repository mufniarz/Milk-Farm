import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'mf-register',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatDividerModule,
    MatProgressSpinnerModule,
    TranslatePipe,
  ],
  template: `
    <div class="auth-container">
      <div class="auth-card-wrapper">
        <div class="auth-branding">
          <mat-icon class="auth-logo">agriculture</mat-icon>
          <h1 class="auth-title">Milk Farm</h1>
          <p class="auth-subtitle">Ration Formulation Platform</p>
        </div>

        <mat-card class="auth-card" appearance="outlined">
          <mat-card-header>
            <mat-card-title>{{ 'AUTH.REGISTER' | translate }}</mat-card-title>
          </mat-card-header>

          <mat-card-content>
            @if (error()) {
              <div class="error-message">
                <mat-icon>error_outline</mat-icon>
                {{ error() }}
              </div>
            }

            <form (ngSubmit)="register()" class="auth-form">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'AUTH.DISPLAY_NAME' | translate }}</mat-label>
                <input
                  matInput
                  type="text"
                  [(ngModel)]="displayName"
                  name="displayName"
                  required
                  id="register-name"
                />
                <mat-icon matPrefix>person</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'AUTH.FARM_NAME' | translate }}</mat-label>
                <input
                  matInput
                  type="text"
                  [(ngModel)]="farmName"
                  name="farmName"
                  required
                  id="register-farm"
                />
                <mat-icon matPrefix>agriculture</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'AUTH.EMAIL' | translate }}</mat-label>
                <input
                  matInput
                  type="email"
                  [(ngModel)]="email"
                  name="email"
                  required
                  id="register-email"
                />
                <mat-icon matPrefix>email</mat-icon>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'AUTH.PASSWORD' | translate }}</mat-label>
                <input
                  matInput
                  [type]="hidePassword() ? 'password' : 'text'"
                  [(ngModel)]="password"
                  name="password"
                  required
                  minlength="6"
                  id="register-password"
                />
                <mat-icon matPrefix>lock</mat-icon>
                <button
                  mat-icon-button
                  matSuffix
                  type="button"
                  (click)="hidePassword.set(!hidePassword())"
                >
                  <mat-icon>{{ hidePassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
              </mat-form-field>

              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'AUTH.CONFIRM_PASSWORD' | translate }}</mat-label>
                <input
                  matInput
                  [type]="hidePassword() ? 'password' : 'text'"
                  [(ngModel)]="confirmPassword"
                  name="confirmPassword"
                  required
                  id="register-confirm-password"
                />
                <mat-icon matPrefix>lock_outline</mat-icon>
              </mat-form-field>

              <button
                mat-flat-button
                color="primary"
                type="submit"
                class="full-width auth-submit"
                [disabled]="loading()"
                id="register-submit"
              >
                @if (loading()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  {{ 'AUTH.REGISTER' | translate }}
                }
              </button>
            </form>

            <mat-divider class="auth-divider"></mat-divider>

            <button
              mat-stroked-button
              class="full-width google-btn"
              (click)="loginWithGoogle()"
              [disabled]="loading()"
              id="register-google"
            >
              <mat-icon>login</mat-icon>
              {{ 'AUTH.LOGIN_WITH_GOOGLE' | translate }}
            </button>
          </mat-card-content>

          <mat-card-actions align="end">
            <span class="auth-link-text">
              {{ 'AUTH.HAS_ACCOUNT' | translate }}
              <a routerLink="/login" class="auth-link">
                {{ 'AUTH.LOGIN_HERE' | translate }}
              </a>
            </span>
          </mat-card-actions>
        </mat-card>
      </div>
    </div>
  `,
  styles: `
    .auth-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%);
      padding: 16px;
    }

    .auth-card-wrapper {
      width: 100%;
      max-width: 440px;
    }

    .auth-branding {
      text-align: center;
      margin-bottom: 32px;
    }

    .auth-logo {
      font-size: 56px;
      width: 56px;
      height: 56px;
      color: #4ecca3;
      margin-bottom: 12px;
    }

    .auth-title {
      color: #ffffff;
      font-size: 32px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -1px;
    }

    .auth-subtitle {
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
      margin: 4px 0 0;
    }

    .auth-card {
      border-radius: 16px !important;
      padding: 24px;
    }

    .auth-form {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 16px;
    }

    .full-width {
      width: 100%;
    }

    .auth-submit {
      height: 48px;
      font-size: 16px;
      border-radius: 12px !important;
      margin-top: 8px;
    }

    .auth-divider {
      margin: 24px 0;
    }

    .google-btn {
      height: 48px;
      border-radius: 12px !important;
      gap: 8px;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(244, 67, 54, 0.1);
      color: #f44336;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 8px;
    }

    .auth-link-text {
      font-size: 14px;
      color: rgba(0, 0, 0, 0.6);
    }

    .auth-link {
      color: #4ecca3;
      text-decoration: none;
      font-weight: 500;
    }

    .auth-link:hover {
      text-decoration: underline;
    }
  `,
})
export class RegisterComponent {
  private authService = inject(AuthService);

  displayName = '';
  farmName = '';
  email = '';
  password = '';
  confirmPassword = '';
  loading = signal(false);
  error = signal('');
  hidePassword = signal(true);

  async register(): Promise<void> {
    if (!this.displayName || !this.farmName || !this.email || !this.password) return;

    if (this.password !== this.confirmPassword) {
      this.error.set('Passwords do not match');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    try {
      await this.authService.register(
        this.email,
        this.password,
        this.displayName,
        this.farmName
      );
    } catch (e: any) {
      this.error.set(e.message || 'Registration failed');
    } finally {
      this.loading.set(false);
    }
  }

  async loginWithGoogle(): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      await this.authService.loginWithGoogle();
    } catch (e: any) {
      this.error.set(e.message || 'Google login failed');
    } finally {
      this.loading.set(false);
    }
  }
}
