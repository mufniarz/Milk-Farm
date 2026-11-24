import { Component, OnDestroy, OnInit, inject } from '@angular/core';
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
import { HerdGroup } from '../../core/models/group.model';
import { Feeder } from '../../core/models/feeder.model';
import { InventoryItem } from '../../core/models/inventory.model';
import { Feeding, FeedingLine } from '../../core/models/feeding.model';
import { FeedingFailure } from '../../core/models/feeding-failure.model';
import { GroupService } from '../../core/services/group.service';
import { RecipeService } from '../../core/services/recipe.service';
import { FeedingService } from '../../core/services/feeding.service';
import { InventoryService } from '../../core/services/inventory.service';
import { FeederService } from '../../core/services/feeder.service';
import { FeedingFailureService } from '../../core/services/feeding-failure.service';
import { FarmContextService } from '../../core/services/farm-context.service';
import {
  OverdrawnFeed,
  computeCalledKg,
  computeDeviationPct,
  findOverdrawnFeeds,
  findUntrackedFeedIds,
  localDateKey,
} from '../../core/utils/loading-math';

/**
 * The barn loading sheet.
 *
 * Shows the called-for quantity per ingredient (recipe x group head count)
 * and records what the feeder actually loaded. Confirming creates the feeding
 * transactionally and lets the trigger post consumption to inventory.
 *
 * The untracked-lines banner is the UI half of the trigger's
 * `inventorySkippedLines`: a line whose feed has no inventory item would be
 * silently skipped by the trigger, so the feeder is warned before confirming.
 * The recent list shows the skipped lines after the trigger runs.
 */
@Component({
  selector: 'mf-loading',
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
    <div class="loading-page">
      <h1 class="page-title">{{ 'LOADING.TITLE' | translate }}</h1>
      <p class="page-subtitle">{{ 'LOADING.SUBTITLE' | translate }}</p>

      @if (failures.length > 0) {
        <div class="alert caution">
          {{ 'LOADING.FAILURES' | translate }}: {{ failures.length }}
          @if (canRetry) {
            <button
              mat-button
              color="primary"
              (click)="retryFailures()"
              [disabled]="saving"
            >
              {{ 'LOADING.RETRY_ALL' | translate }}
            </button>
          }
        </div>
      }

      <mat-card appearance="outlined" class="form-card">
        <mat-card-content class="form-grid">
          <mat-form-field appearance="outline">
            <mat-label>{{ 'LOADING.GROUP' | translate }}</mat-label>
            <mat-select
              [(ngModel)]="selectedGroupId"
              (selectionChange)="selectGroup()"
            >
              @for (group of groups; track group.id) {
                <mat-option [value]="group.id">{{ group.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'LOADING.FEEDER' | translate }}</mat-label>
            <mat-select [(ngModel)]="selectedFeederId">
              @for (feeder of feeders; track feeder.id) {
                <mat-option [value]="feeder.id">{{ feeder.name }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <div class="feeder-add">
            <mat-form-field appearance="outline">
              <mat-label>{{ 'LOADING.NEW_FEEDER' | translate }}</mat-label>
              <input matInput [(ngModel)]="newFeederName" />
            </mat-form-field>
            <button
              mat-stroked-button
              (click)="addFeeder()"
              [disabled]="!newFeederName.trim()"
            >
              {{ 'LOADING.ADD_FEEDER' | translate }}
            </button>
          </div>

          <mat-form-field appearance="outline">
            <mat-label>{{ 'LOADING.REFUSED' | translate }}</mat-label>
            <input matInput type="number" min="0" [(ngModel)]="refusedKgAsFed" />
          </mat-form-field>
        </mat-card-content>
      </mat-card>

      @if (selectedGroupId) {
        @if (!recipeId) {
          <div class="banner warning">{{ 'LOADING.NO_RECIPE' | translate }}</div>
        } @else if (lines.length > 0) {
          @if (untrackedLines.length > 0 || overdrawnFeeds.length > 0) {
            <div class="banner warning warning-stack">
              @if (untrackedLines.length > 0) {
                <div class="warning-line">
                  <mat-icon>warning</mat-icon>
                  {{ untrackedLines.length }}
                  {{ 'LOADING.UNTRACKED_BANNER' | translate }}:
                  {{ untrackedNames() }}
                </div>
              }
              @if (overdrawnFeeds.length > 0) {
                <div class="warning-line danger-line">
                  <mat-icon>error</mat-icon>
                  {{ 'LOADING.OVERDRAWN_BANNER' | translate }}:
                  {{ overdrawnNames() }}
                </div>
                <label class="ack">
                  <input
                    type="checkbox"
                    [(ngModel)]="overdraftAcknowledged"
                  />
                  {{ 'LOADING.OVERDRAFT_ACK' | translate }}
                </label>
              }
            </div>
          }

          <mat-card appearance="outlined">
            <mat-card-content>
              <div class="line-header">
                <span>{{ 'LOADING.FEED' | translate }}</span>
                <span>{{ 'LOADING.CALLED' | translate }}</span>
                <span>{{ 'LOADING.LOADED' | translate }}</span>
                <span>{{ 'LOADING.DEVIATION' | translate }}</span>
              </div>
              @for (line of lines; track line.lineId) {
                <div class="line-row">
                  <span class="feed-name">{{ line.feedName }}</span>
                  <span>{{ line.calledKgAsFed | number: '1.0-1' }} kg</span>
                  <input
                    class="loaded-input"
                    type="number"
                    min="0"
                    [(ngModel)]="line.loadedKgAsFed"
                    (ngModelChange)="onLoadedChange()"
                  />
                  <span [class]="'deviation ' + deviationClass(line)">
                    {{ deviationLabel(line) }}
                  </span>
                </div>
              }
              <div class="totals">
                <span>{{ 'LOADING.TOTAL_CALLED' | translate }}:
                  {{ totalCalled() | number: '1.0-1' }} kg</span>
                <span>{{ 'LOADING.TOTAL_LOADED' | translate }}:
                  {{ totalLoaded() | number: '1.0-1' }} kg</span>
              </div>
              <div class="actions">
                <button
                  mat-stroked-button
                  (click)="save(false)"
                  [disabled]="saving || !selectedFeederId"
                >
                  {{ 'LOADING.SAVE_DRAFT' | translate }}
                </button>
                <button
                  mat-flat-button
                  color="primary"
                  (click)="save(true)"
                  [disabled]="saving || !selectedFeederId"
                >
                  {{ 'LOADING.CONFIRM' | translate }}
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        }
      }

      <mat-card appearance="outlined" class="recent-card">
        <mat-card-header>
          <mat-card-title>{{ 'LOADING.RECENT' | translate }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @for (feeding of feedings; track feeding.id) {
            <div class="recent-row">
              <span class="date">{{ feeding.date }}</span>
              <span>{{ groupName(feeding.herdGroupId) }}</span>
              <span>{{ feederName(feeding.feederId) }}</span>
              <span class="status">{{ feeding.status }}</span>
              <span>{{ totalLoadedFor(feeding) | number: '1.0-1' }} kg</span>
              @if (failureFor(feeding.id); as failure) {
                <span class="failed" [title]="failure.error">
                  <mat-icon>error</mat-icon>
                  {{ 'LOADING.FAILED' | translate }}
                </span>
              }
              @if (feeding.status === 'confirmed' && !feeding.inventoryPostedAt) {
                <span class="posting">
                  {{
                    (postingDelayed
                      ? 'LOADING.POSTING_DELAYED'
                      : 'LOADING.POSTING') | translate
                  }}
                </span>
              } @else if (feeding.inventoryOverdrawn?.length) {
                <span class="overdrawn" [title]="feedingOverdrawnNames(feeding)">
                  <mat-icon>error</mat-icon>
                  {{ feeding.inventoryOverdrawn!.length }}
                  {{ 'LOADING.OVERDRAWN' | translate }}
                </span>
              } @else if (feeding.inventorySkippedLines?.length) {
                <span class="skipped" [title]="skippedNames(feeding)">
                  <mat-icon>warning</mat-icon>
                  {{ feeding.inventorySkippedLines!.length }}
                  {{ 'LOADING.SKIPPED' | translate }}
                </span>
              } @else {
                <span class="ok">{{ 'LOADING.TRACKED' | translate }}</span>
              }
            </div>
          } @empty {
            <p class="empty">{{ 'LOADING.EMPTY' | translate }}</p>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: `
    .loading-page {
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
      grid-template-columns: 1.2fr 1fr 1.4fr 0.8fr;
      gap: 12px;
      align-items: center;
    }
    .feeder-add {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      border-radius: 6px;
      margin-bottom: 16px;
      font-weight: 600;
    }
    .banner.warning {
      background: #fff4e0;
      color: #8a5300;
    }
    .banner.warning-stack {
      display: block;
    }
    .warning-line {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 2px 0;
    }
    .danger-line {
      color: #a02525;
    }
    .ack {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 6px;
      font-weight: 500;
      cursor: pointer;
    }
    .line-header,
    .line-row {
      display: grid;
      grid-template-columns: 1.6fr 1fr 1fr 0.8fr;
      gap: 12px;
      align-items: center;
      padding: 8px 4px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }
    .line-header {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: rgba(0, 0, 0, 0.5);
      border-bottom: 1px solid rgba(0, 0, 0, 0.15);
    }
    .feed-name {
      font-weight: 600;
    }
    .loaded-input {
      width: 100px;
      padding: 4px 6px;
      border: 1px solid rgba(0, 0, 0, 0.2);
      border-radius: 4px;
    }
    .deviation.over {
      color: #8a5300;
      font-weight: 600;
    }
    .deviation.under {
      color: #a02525;
      font-weight: 600;
    }
    .deviation.ok {
      color: #2b7a5b;
      font-weight: 600;
    }
    .totals {
      display: flex;
      gap: 24px;
      padding: 12px 4px;
      font-weight: 600;
    }
    .actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .recent-card {
      margin-top: 16px;
    }
    .recent-row {
      display: grid;
      grid-template-columns: 0.8fr 1.1fr 1fr 0.8fr 0.8fr 1.2fr;
      gap: 12px;
      align-items: center;
      padding: 8px 4px;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      font-size: 13px;
    }
    .recent-row .date {
      font-weight: 600;
    }
    .failed {
      color: #a02525;
      font-weight: 600;
      white-space: nowrap;
    }
    .failed mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      vertical-align: middle;
    }
    .recent-row .status {
      text-transform: uppercase;
      font-size: 11px;
      color: rgba(0, 0, 0, 0.5);
    }
    .skipped,
    .overdrawn {
      color: #8a5300;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-weight: 600;
    }
    .overdrawn {
      color: #a02525;
    }
    .skipped mat-icon,
    .overdrawn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }
    .posting {
      color: rgba(0, 0, 0, 0.5);
      font-style: italic;
    }
    .ok {
      color: #2b7a5b;
      font-size: 12px;
    }
    .empty {
      color: rgba(0, 0, 0, 0.5);
      padding: 16px 4px;
    }
    @media (max-width: 800px) {
      .form-grid,
      .line-header,
      .line-row,
      .recent-row {
        grid-template-columns: 1fr;
      }
      .line-header {
        display: none;
      }
      .actions {
        justify-content: flex-start;
      }
    }
  `,
})
export class LoadingComponent implements OnInit, OnDestroy {
  private groupService = inject(GroupService);
  private recipeService = inject(RecipeService);
  private feedingService = inject(FeedingService);
  private inventoryService = inject(InventoryService);
  private feederService = inject(FeederService);
  private failureService = inject(FeedingFailureService);
  private farmContext = inject(FarmContextService);
  private snackBar = inject(MatSnackBar);
  private translate = inject(TranslateService);

  groups: HerdGroup[] = [];
  feeders: Feeder[] = [];
  inventoryItems: InventoryItem[] = [];
  feedings: Feeding[] = [];
  failures: FeedingFailure[] = [];

  selectedGroupId = '';
  selectedFeederId = '';
  /** Client-generated id: a failed confirm retries the same draft. */
  feedingId = '';
  newFeederName = '';
  refusedKgAsFed = 0;
  lines: FeedingLine[] = [];
  recipeId = '';
  saving = false;
  overdraftAcknowledged = false;
  postingDelayed = false;
  private postingTimer?: ReturnType<typeof setTimeout>;

  readonly today = localDateKey();

  ngOnInit(): void {
    this.groupService
      .getGroups()
      .subscribe((groups) => (this.groups = groups));
    this.feederService
      .getFeeders()
      .subscribe((feeders) => (this.feeders = feeders));
    this.inventoryService
      .getItems()
      .subscribe((items) => (this.inventoryItems = items));
    this.feedingService
      .getFeedings()
      .subscribe((feedings) => (this.feedings = feedings));
    if (this.canRetry) {
      this.failureService
        .getOpenFailures()
        .subscribe((failures) => (this.failures = failures));
    }
  }

  get canRetry(): boolean {
    const role = this.farmContext.activeRole();
    return role === 'owner' || role === 'farmAdmin';
  }

  failureFor(feedingId: string | undefined): FeedingFailure | undefined {
    return this.failures.find((failure) => failure.feedingId === feedingId);
  }

  async retryFailures(): Promise<void> {
    this.saving = true;
    try {
      const result = await this.failureService.retryAll();
      this.snackBar.open(
        `${this.translate.instant('LOADING.RETRY_DONE')}: ${result.resolved}/${result.failed}`,
        undefined,
        { duration: 5000 },
      );
    } catch (error) {
      console.error('Failed to retry feedings', error);
      this.snackBar.open(
        this.translate.instant('LOADING.RETRY_FAILED'),
        undefined,
        { duration: 5000 },
      );
    } finally {
      this.saving = false;
    }
  }

  ngOnDestroy(): void {
    if (this.postingTimer) clearTimeout(this.postingTimer);
  }

  onLoadedChange(): void {
    this.overdraftAcknowledged = false;
  }

  private startPostingTimer(): void {
    if (this.postingTimer) clearTimeout(this.postingTimer);
    this.postingDelayed = false;
    this.postingTimer = setTimeout(() => {
      this.postingDelayed = true;
    }, 30000);
  }

  async selectGroup(): Promise<void> {
    const group = this.groups.find((g) => g.id === this.selectedGroupId);
    this.lines = [];
    this.overdraftAcknowledged = false;
    this.feedingId = crypto.randomUUID();
    this.recipeId = group?.activeRecipeId ?? '';
    if (!group || !this.recipeId) return;

    const recipe = await this.recipeService.getRecipeWithFeeds(this.recipeId);
    this.lines = (recipe?.feeds ?? []).map((line) => {
      const calledKgAsFed = computeCalledKg(line.kgAsFed, group.headCount);
      return {
        lineId: crypto.randomUUID(),
        feedId: line.feedId,
        feedName: line.feedName,
        calledKgAsFed,
        loadedKgAsFed: calledKgAsFed,
        costPerKgAsFed: line.kgAsFed > 0 ? line.cost / line.kgAsFed : 0,
      };
    });
  }

  get untrackedLines(): FeedingLine[] {
    const ids = findUntrackedFeedIds(
      this.lines,
      this.inventoryItems.map((item) => item.feedId),
    );
    return this.lines.filter((line) => ids.includes(line.feedId));
  }

  get overdrawnFeeds(): OverdrawnFeed[] {
    return findOverdrawnFeeds(this.lines, this.inventoryItems);
  }

  overdrawnNames(): string {
    return this.overdrawnFeeds.map((feed) => feed.feedName).join(', ');
  }

  feedingOverdrawnNames(feeding: Feeding): string {
    return (feeding.inventoryOverdrawn ?? [])
      .map((feed) => feed.feedName || feed.feedId)
      .join(', ');
  }

  untrackedNames(): string {
    return [...new Set(this.untrackedLines.map((line) => line.feedName))].join(
      ', ',
    );
  }

  deviation(line: FeedingLine): number | null {
    return computeDeviationPct(line.loadedKgAsFed, line.calledKgAsFed);
  }

  deviationLabel(line: FeedingLine): string {
    const value = this.deviation(line);
    return value === null ? '—' : `${value.toFixed(1)}%`;
  }

  deviationClass(line: FeedingLine): 'over' | 'under' | 'ok' {
    const value = this.deviation(line);
    if (value === null) return 'ok';
    if (value > 1) return 'over';
    if (value < -1) return 'under';
    return 'ok';
  }

  totalCalled(): number {
    return this.lines.reduce((sum, line) => sum + line.calledKgAsFed, 0);
  }

  totalLoaded(): number {
    return this.lines.reduce((sum, line) => sum + line.loadedKgAsFed, 0);
  }

  totalLoadedFor(feeding: Feeding): number {
    return (feeding.lines ?? []).reduce(
      (sum, line) => sum + line.loadedKgAsFed,
      0,
    );
  }

  groupName(groupId: string): string {
    return this.groups.find((group) => group.id === groupId)?.name ?? groupId;
  }

  feederName(feederId: string): string {
    return this.feeders.find((feeder) => feeder.id === feederId)?.name ?? feederId;
  }

  skippedNames(feeding: Feeding): string {
    return (feeding.inventorySkippedLines ?? [])
      .map((line) => line.feedName || line.feedId)
      .join(', ');
  }

  async addFeeder(): Promise<void> {
    if (!this.newFeederName.trim()) return;
    const id = await this.feederService.createFeeder(this.newFeederName);
    this.selectedFeederId = id;
    this.newFeederName = '';
  }

  async save(confirm: boolean): Promise<void> {
    const group = this.groups.find((g) => g.id === this.selectedGroupId);
    if (!group || !group.id || !this.selectedFeederId || this.lines.length === 0) {
      return;
    }
    if (
      confirm &&
      this.overdrawnFeeds.length > 0 &&
      !this.overdraftAcknowledged
    ) {
      this.snackBar.open(
        this.translate.instant('LOADING.OVERDRAFT_ACK_REQUIRED'),
        undefined,
        { duration: 4000 },
      );
      return;
    }
    this.saving = true;
    try {
      if (!this.feedingId) this.feedingId = crypto.randomUUID();
      await this.feedingService.saveDraft(this.feedingId, {
        date: this.today,
        herdGroupId: group.id,
        recipeId: this.recipeId,
        animalCount: group.headCount,
        feederId: this.selectedFeederId,
        lines: this.lines.map((line) => ({ ...line })),
        refusedKgAsFed: this.refusedKgAsFed,
      });
      if (confirm) {
        await this.feedingService.confirm(this.feedingId);
        this.snackBar.open(
          this.translate.instant('LOADING.CONFIRMED'),
          undefined,
          { duration: 4000 },
        );
        this.feedingId = '';
        this.lines = [];
        this.selectedGroupId = '';
        this.selectedFeederId = '';
        this.refusedKgAsFed = 0;
        this.overdraftAcknowledged = false;
        this.startPostingTimer();
      } else {
        // Keep the load on screen (and the same id) so a later edit or
        // confirm updates this draft rather than creating a duplicate.
        this.snackBar.open(
          this.translate.instant('LOADING.DRAFT_SAVED'),
          undefined,
          { duration: 3000 },
        );
      }
    } catch (error) {
      console.error('Failed to save feeding', error);
      this.snackBar.open(
        this.translate.instant('LOADING.SAVE_FAILED'),
        undefined,
        { duration: 5000 },
      );
    } finally {
      this.saving = false;
    }
  }
}
