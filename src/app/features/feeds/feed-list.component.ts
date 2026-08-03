import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FeedService } from '../../core/services/feed.service';
import { Feed, FeedCategory } from '../../core/models/feed.model';
import { FeedFormComponent } from './feed-form.component';

/** Well-known nutrient codes used in the feed form */
const NUTRIENT_CODES = [
  'proteina',
  'ee',
  'amido',
  'zuccheri',
  'ceneri',
  'aNDF',
  'uNDF',
  'ADF',
  'ADL',
];

@Component({
  selector: 'mf-feed-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatTableModule,
    MatSortModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatChipsModule,
    MatDialogModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    TranslatePipe,
  ],
  template: `
    <div class="feed-list-page">
      <div class="page-header">
        <h1 class="page-title">{{ 'FEEDS.TITLE' | translate }}</h1>
        <div class="header-actions">
          <button
            mat-stroked-button
            (click)="importFeeds()"
            id="import-feeds-btn"
          >
            <mat-icon>upload_file</mat-icon>
            {{ 'FEEDS.IMPORT_CSV' | translate }}
          </button>
          <button
            mat-flat-button
            color="primary"
            (click)="openAddDialog()"
            id="add-feed-btn"
          >
            <mat-icon>add</mat-icon>
            {{ 'FEEDS.ADD' | translate }}
          </button>
        </div>
      </div>

      <!-- Filters -->
      <div class="filters-row">
        <mat-form-field appearance="outline" class="search-field">
          <mat-label>{{ 'FEEDS.SEARCH' | translate }}</mat-label>
          <input
            matInput
            [(ngModel)]="searchQuery"
            (ngModelChange)="applyFilter()"
            id="feed-search"
          />
          <mat-icon matPrefix>search</mat-icon>
        </mat-form-field>

        <mat-form-field appearance="outline" class="category-filter">
          <mat-label>{{ 'FEEDS.CATEGORY' | translate }}</mat-label>
          <mat-select
            [(ngModel)]="categoryFilter"
            (ngModelChange)="applyFilter()"
            id="category-filter"
          >
            <mat-option value="all">{{ 'FEEDS.ALL' | translate }}</mat-option>
            <mat-option value="forage">{{
              'FEEDS.FORAGE' | translate
            }}</mat-option>
            <mat-option value="concentrate">{{
              'FEEDS.CONCENTRATE' | translate
            }}</mat-option>
          </mat-select>
        </mat-form-field>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else if (filteredFeeds().length === 0) {
        <div class="empty-state">
          <mat-icon class="empty-icon">grass</mat-icon>
          <p>{{ 'FEEDS.NO_FEEDS' | translate }}</p>
        </div>
      } @else {
        <div class="table-container">
          <table
            mat-table
            [dataSource]="filteredFeeds()"
            matSort
            (matSortChange)="sortData($event)"
          >
            <!-- Name Column -->
            <ng-container matColumnDef="name">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>
                {{ 'FEEDS.NAME' | translate }}
              </th>
              <td mat-cell *matCellDef="let feed">
                <span class="feed-name">{{ feed.name }}</span>
              </td>
            </ng-container>

            <!-- Category Column -->
            <ng-container matColumnDef="category">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>
                {{ 'FEEDS.CATEGORY' | translate }}
              </th>
              <td mat-cell *matCellDef="let feed">
                <span class="category-chip" [class]="feed.category">
                  {{
                    feed.category === 'forage'
                      ? ('FEEDS.FORAGE' | translate)
                      : ('FEEDS.CONCENTRATE' | translate)
                  }}
                </span>
              </td>
            </ng-container>

            <!-- Price Column -->
            <ng-container matColumnDef="pricePerKg">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>
                {{ 'FEEDS.PRICE_PER_KG' | translate }}
              </th>
              <td mat-cell *matCellDef="let feed">
                €{{ feed.pricePerKg | number: '1.3-3' }}
              </td>
            </ng-container>

            <!-- Moisture Column -->
            <ng-container matColumnDef="moisturePct">
              <th mat-header-cell *matHeaderCellDef mat-sort-header>
                {{ 'FEEDS.MOISTURE' | translate }}
              </th>
              <td mat-cell *matCellDef="let feed">
                {{ feed.moisturePct | number: '1.1-1' }}%
              </td>
            </ng-container>

            <!-- Available Column -->
            <ng-container matColumnDef="isAvailable">
              <th mat-header-cell *matHeaderCellDef>
                {{ 'FEEDS.AVAILABLE' | translate }}
              </th>
              <td mat-cell *matCellDef="let feed">
                <mat-slide-toggle
                  [checked]="feed.isAvailable"
                  (change)="toggleAvailability(feed)"
                  color="primary"
                ></mat-slide-toggle>
              </td>
            </ng-container>

            <!-- Actions Column -->
            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>
                {{ 'COMMON.ACTIONS' | translate }}
              </th>
              <td mat-cell *matCellDef="let feed">
                <button
                  mat-icon-button
                  matTooltip="Edit"
                  (click)="openEditDialog(feed)"
                >
                  <mat-icon>edit</mat-icon>
                </button>
                <button
                  mat-icon-button
                  matTooltip="Delete"
                  color="warn"
                  (click)="deleteFeed(feed)"
                >
                  <mat-icon>delete</mat-icon>
                </button>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr
              mat-row
              *matRowDef="let row; columns: displayedColumns"
              class="feed-row"
            ></tr>
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    .feed-list-page {
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
      flex-wrap: wrap;
      gap: 16px;
    }

    .page-title {
      font-size: 28px;
      font-weight: 700;
      margin: 0;
      letter-spacing: -0.5px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }

    .filters-row {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }

    .search-field {
      flex: 1;
      min-width: 200px;
    }

    .category-filter {
      min-width: 160px;
    }

    .table-container {
      border-radius: 12px;
      overflow: hidden;
      border: 1px solid rgba(0, 0, 0, 0.08);
    }

    table {
      width: 100%;
    }

    .feed-name {
      font-weight: 500;
    }

    .category-chip {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .category-chip.forage {
      background: rgba(76, 175, 80, 0.12);
      color: #2e7d32;
    }

    .category-chip.concentrate {
      background: rgba(255, 152, 0, 0.12);
      color: #e65100;
    }

    .feed-row {
      transition: background 0.15s ease;
    }

    .feed-row:hover {
      background: rgba(0, 0, 0, 0.02);
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
  `,
})
export class FeedListComponent implements OnInit {
  private feedService = inject(FeedService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  displayedColumns = [
    'name',
    'category',
    'pricePerKg',
    'moisturePct',
    'isAvailable',
    'actions',
  ];

  feeds = signal<Feed[]>([]);
  filteredFeeds = signal<Feed[]>([]);
  loading = signal(true);

  searchQuery = '';
  categoryFilter = 'all';

  ngOnInit(): void {
    this.feedService.getFeeds().subscribe((feeds) => {
      this.feeds.set(feeds);
      this.applyFilter();
      this.loading.set(false);
    });
  }

  applyFilter(): void {
    let result = this.feeds();

    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }

    if (this.categoryFilter !== 'all') {
      result = result.filter((f) => f.category === this.categoryFilter);
    }

    this.filteredFeeds.set(result);
  }

  sortData(sort: Sort): void {
    const data = [...this.filteredFeeds()];
    if (!sort.active || sort.direction === '') {
      this.filteredFeeds.set(data);
      return;
    }

    data.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      const key = sort.active as keyof Feed;
      const valA = a[key] as any;
      const valB = b[key] as any;
      return (valA < valB ? -1 : valA > valB ? 1 : 0) * (isAsc ? 1 : -1);
    });

    this.filteredFeeds.set(data);
  }

  openAddDialog(): void {
    const dialogRef = this.dialog.open(FeedFormComponent, {
      width: '600px',
      data: { mode: 'add' },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.snackBar.open(this.translate.instant('FEEDS.ADDED'), '', {
          duration: 3000,
        });
      }
    });
  }

  openEditDialog(feed: Feed): void {
    const dialogRef = this.dialog.open(FeedFormComponent, {
      width: '600px',
      data: { mode: 'edit', feed },
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.snackBar.open(this.translate.instant('FEEDS.UPDATED'), '', {
          duration: 3000,
        });
      }
    });
  }

  async toggleAvailability(feed: Feed): Promise<void> {
    await this.feedService.toggleAvailability(feed.id!, !feed.isAvailable);
  }

  async deleteFeed(feed: Feed): Promise<void> {
    const msg = this.translate.instant('FEEDS.DELETE_CONFIRM');
    if (confirm(msg)) {
      await this.feedService.deleteFeed(feed.id!);
      this.snackBar.open(this.translate.instant('FEEDS.DELETED'), '', {
        duration: 3000,
      });
    }
  }

  async importFeeds(): Promise<void> {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.onchange = async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        const feeds = await this.parseImportFile(file);
        if (feeds.length === 0) {
          this.snackBar.open(
            this.translate.instant('FEEDS.IMPORT_NO_FEEDS'),
            '',
            { duration: 4000 },
          );
          return;
        }
        const count = await this.feedService.importFeeds(feeds);
        this.snackBar.open(
          this.translate.instant('FEEDS.IMPORTED_COUNT', { count }),
          '',
          { duration: 4000 },
        );
      } catch (e: any) {
        this.snackBar.open(
          this.translate.instant('FEEDS.IMPORT_FAILED', {
            error: e.message || 'Unknown error',
          }),
          '',
          { duration: 4000 },
        );
      } finally {
        // Reset the file input so the same file can be re-imported
        (input as HTMLInputElement).value = '';
      }
    };
    input.click();
  }

  /**
   * Parse a CSV or Excel file into Feed objects.
   * Expected column headers (case-insensitive):
   *   name, category, pricePerKg, moisturePct, isAvailable, <nutrient codes>
   * Category: "forage" or "concentrate" (or "F"/"C")
   * isAvailable: true/false (or "1"/"0")
   */
  private async parseImportFile(
    file: File,
  ): Promise<Omit<Feed, 'id' | 'farmId'>[]> {
    // Dynamically import xlsx to avoid SSR issues
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, string | number | boolean | undefined>[] =
      XLSX.utils.sheet_to_json(sheet);

    const feeds: Omit<Feed, 'id' | 'farmId'>[] = [];

    for (const row of rows) {
      const name = String(
        row['name'] || row['Name'] || row['NOME'] || '',
      ).trim();
      if (!name) continue;

      // Parse category
      let category: FeedCategory = 'forage';
      const catRaw = String(
        row['category'] ||
          row['Category'] ||
          row['Categoria'] ||
          row['cat'] ||
          'forage',
      ).toLowerCase();
      if (['concentrate', 'concentrato', 'C'].includes(catRaw)) {
        category = 'concentrate';
      }

      const pricePerKg =
        Number(
          row['pricePerKg'] ||
            row['price'] ||
            row['Prezzo'] ||
            row['pricePerKg'] ||
            0,
        ) || 0;
      const moisturePct =
        Number(
          row['moisturePct'] ||
            row['moisture'] ||
            row['Umidita'] ||
            row['moisturePct'] ||
            0,
        ) || 0;
      const isAvailable =
        row['isAvailable'] !== false &&
        row['isAvailable'] !== '0' &&
        row['isAvailable'] !== 'falsa' &&
        row['isAvailable'] !== 'no';

      // Parse nutrients from the row
      const nutrients: Record<string, number> = {};
      for (const code of NUTRIENT_CODES) {
        const val = Number(row[code] || row[code.toUpperCase()] || 0);
        if (!isNaN(val)) {
          nutrients[code] = val;
        }
      }

      feeds.push({
        name,
        category,
        pricePerKg,
        moisturePct,
        isAvailable: !!isAvailable,
        nutrients,
      });
    }

    return feeds;
  }
}
