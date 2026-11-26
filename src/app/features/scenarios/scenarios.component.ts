import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { MatTableModule } from '@angular/material/table';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ScenarioService } from '../../core/services/scenario.service';
import { ScenarioRow } from '../../core/models/scenario-row.model';
import { FarmContextService } from '../../core/services/farm-context.service';

const MAX_SELECTION = 20;

@Component({
  selector: 'mf-scenarios',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    DecimalPipe,
    MatTableModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    TranslatePipe,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <h1>{{ 'SCENARIOS.TITLE' | translate }}</h1>
        <button mat-stroked-button (click)="load()" [disabled]="loading()">
          <mat-icon>refresh</mat-icon>
          {{ 'SCENARIOS.REFRESH' | translate }}
        </button>
      </div>

      @if (loading()) {
        <mat-spinner diameter="32" />
      } @else if (rows().length === 0) {
        <p class="empty">{{ 'SCENARIOS.EMPTY' | translate }}</p>
      } @else {
        <table mat-table [dataSource]="rows()" class="scenario-table">
          <ng-container matColumnDef="select">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let row">
              <mat-checkbox
                [checked]="selected().has(row.id)"
                (change)="toggle(row.id, $event.checked)"
              />
            </td>
          </ng-container>
          <ng-container matColumnDef="name">
            <th mat-header-cell *matHeaderCellDef>
              {{ 'SCENARIOS.NAME' | translate }}
            </th>
            <td mat-cell *matCellDef="let row">{{ row.name }}</td>
          </ng-container>
          <ng-container matColumnDef="base">
            <th mat-header-cell *matHeaderCellDef>
              {{ 'SCENARIOS.BASE' | translate }}
            </th>
            <td mat-cell *matCellDef="let row">{{ row.baseRecipeId }}</td>
          </ng-container>
          <ng-container matColumnDef="savedAt">
            <th mat-header-cell *matHeaderCellDef>
              {{ 'SCENARIOS.SAVED_AT' | translate }}
            </th>
            <td mat-cell *matCellDef="let row">
              {{ row.savedAt ? (row.savedAt | date: 'short') : '—' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="status">
            <th mat-header-cell *matHeaderCellDef>
              {{ 'SCENARIOS.STATUS' | translate }}
            </th>
            <td mat-cell *matCellDef="let row">{{ row.snapshot.status }}</td>
          </ng-container>
          <ng-container matColumnDef="cost">
            <th mat-header-cell *matHeaderCellDef>
              {{ 'SCENARIOS.COST' | translate }}
            </th>
            <td mat-cell *matCellDef="let row">
              {{ row.snapshot.totalCost | number: '1.3-3' }}
            </td>
          </ng-container>
          <ng-container matColumnDef="diverged">
            <th mat-header-cell *matHeaderCellDef>
              {{ 'SCENARIOS.DIVERGED' | translate }}
            </th>
            <td mat-cell *matCellDef="let row">
              {{ row.diverged === null ? '—' : (row.diverged ? 'Sì' : 'No') }}
            </td>
          </ng-container>
          <ng-container matColumnDef="actions">
            <th mat-header-cell *matHeaderCellDef></th>
            <td mat-cell *matCellDef="let row">
              <button mat-icon-button (click)="remove(row)">
                <mat-icon>delete</mat-icon>
              </button>
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="columns"></tr>
          <tr mat-row *matRowDef="let row; columns: columns"></tr>
        </table>
      }

      <p class="selection">
        {{ selected().size }} / {{ maxSelection }}
        {{ 'SCENARIOS.SELECTED' | translate }}
      </p>
    </div>
  `,
  styles: [
    `
      .page {
        padding: 24px;
      }
      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }
      .scenario-table {
        width: 100%;
      }
      .empty,
      .selection {
        color: #666;
      }
    `,
  ],
})
export class ScenariosComponent implements OnInit {
  private scenarioService = inject(ScenarioService);
  private farmContext = inject(FarmContextService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  readonly rows = signal<ScenarioRow[]>([]);
  readonly loading = signal(false);
  readonly selected = signal(new Set<string>());
  readonly maxSelection = MAX_SELECTION;
  readonly columns = [
    'select',
    'name',
    'base',
    'savedAt',
    'status',
    'cost',
    'diverged',
    'actions',
  ];

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) return;
    this.loading.set(true);
    try {
      this.rows.set(await this.scenarioService.list(farmId));
    } finally {
      this.loading.set(false);
    }
  }

  toggle(id: string, checked: boolean): void {
    const next = new Set(this.selected());
    if (checked && next.size >= MAX_SELECTION) {
      this.snackBar.open(
        this.translate.instant('SCENARIOS.CAP'),
        undefined,
        { duration: 4000 },
      );
      return;
    }
    if (checked) next.add(id);
    else next.delete(id);
    this.selected.set(next);
  }

  async remove(row: ScenarioRow): Promise<void> {
    const farmId = this.farmContext.activeFarmId();
    if (!farmId) return;
    if (!confirm(this.translate.instant('SCENARIOS.DELETE_CONFIRM'))) {
      return;
    }
    await this.scenarioService.remove(farmId, row.id);
    this.selected.update((current) => {
      const next = new Set(current);
      next.delete(row.id);
      return next;
    });
    await this.load();
  }
}
