import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'mf-reset-password',
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
    MatProgressSpinnerModule,
    TranslatePipe,
  ],
  template: `
    <div class="auth-container">
      <div class="auth-card-wrapper">
        <div class="auth-branding">
          <mat-icon class="auth-logo">lock_reset</mat-icon>
          <h1 class="auth-title">{{ 'AUTH.RESET_PASSWORD' | translate }}</h1>
          <p class="auth-subtitle">
            {{ 'AUTH.ENTER_EMAIL_FOR_RESET' | translate }}
          </p>
        </div>

        <mat-card class="auth-card" appearance="outlined">
          <mat-card-content>
            @if (error()) {
              <div class="error-message">
                <mat-icon>error_outline</mat-icon>
                {{ error() }}
              </div>
            }

            <form (ngSubmit)="sendReset()" class="auth-form">
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>{{ 'AUTH.EMAIL' | translate }}</mat-label>
                <input
                  matInput
                  type="email"
                  [(ngModel)]="email"
                  name="email"
                  required
                  id="reset-email"
                />
                <mat-icon matPrefix>email</mat-icon>
              </mat-form-field>

              <button
                mat-flat-button
                color="primary"
                type="submit"
                class="full-width auth-submit"
                [disabled]="loading()"
                id="reset-submit"
              >
                @if (loading()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  {{ 'AUTH.SEND_RESET_LINK' | translate }}
                }
              </button>
            </form>

            @if (resetSent()) {
              <div class="success-message">
                <mat-icon>check_circle</mat-icon>
                {{ 'AUTH.PASSWORD_RESET_SENT' | translate }}
              </div>
              <p class="reset-info">
                {{ 'AUTH.RESET_EMAIL_SENT' | translate }}
              </p>
            }

            <a routerLink="/login" class="back-link" id="back-to-login">
              <mat-icon>arrow_back</mat-icon>
              {{ 'AUTH.BACK_TO_LOGIN' | translate }}
            </a>
          </mat-card-content>
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

    .success-message {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: rgba(78, 204, 163, 0.15);
      color: #4ecca3;
      border-radius: 8px;
      font-size: 14px;
      margin-top: 12px;
    }

    .reset-info {
      color: rgba(255, 255, 255, 0.5);
      font-size: 13px;
      margin: 8px 0 0;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      color: #4ecca3;
      text-decoration: none;
      font-size: 14px;
      font-weight: 500;
      margin-top: 16px;
      cursor: pointer;
    }

    .back-link:hover {
      text-decoration: underline;
    }

    .back-link mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }
  `,
})
export class ResetPasswordComponent {
  private authService = inject(AuthService);

  email = '';
  loading = signal(false);
  error = signal('');
  resetSent = signal(false);

  async sendReset(): Promise<void> {
    if (!this.email) return;

    this.loading.set(true);
    this.error.set('');
    this.resetSent.set(false);

    try {
      await this.authService.sendPasswordResetEmail(this.email);
      this.resetSent.set(true);
    } catch (e: any) {
      this.error.set(e.message || 'Failed to send reset email');
    } finally {
      this.loading.set(false);
    }
  }
}
