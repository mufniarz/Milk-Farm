import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { LoadingComponent } from './loading.component';
import { FarmRole } from '../../core/models/user.model';
import { GroupService } from '../../core/services/group.service';
import { RecipeService } from '../../core/services/recipe.service';
import { FeedingService } from '../../core/services/feeding.service';
import { InventoryService } from '../../core/services/inventory.service';
import { FeederService } from '../../core/services/feeder.service';
import { FeedingFailureService } from '../../core/services/feeding-failure.service';
import { SystemHealthService } from '../../core/services/system-health.service';
import { FarmContextService } from '../../core/services/farm-context.service';

describe('LoadingComponent queue health', () => {
  it('subscribes to failures and heartbeat when the role resolves late', () => {
    const role = signal<FarmRole | null>(null);
    TestBed.configureTestingModule({
      imports: [LoadingComponent],
      providers: [
        provideTranslateService(),
        { provide: GroupService, useValue: { getGroups: () => of([]) } },
        { provide: RecipeService, useValue: { getRecipeWithFeeds: async () => null } },
        { provide: FeedingService, useValue: { getFeedings: () => of([]) } },
        { provide: InventoryService, useValue: { getItems: () => of([]) } },
        { provide: FeederService, useValue: { getFeeders: () => of([]) } },
        {
          provide: FeedingFailureService,
          useValue: {
            getOpenFailures: () =>
              of([
                {
                  farmId: 'f1',
                  feedingId: 'feeding-1',
                  error: 'boom',
                  status: 'dead',
                  retryCount: 5,
                },
              ]),
            retryAll: async () => ({ ok: true, resolved: 0, failed: 0 }),
            markHandled: async () => undefined,
          },
        },
        {
          provide: SystemHealthService,
          useValue: {
            getRetryScanHeartbeat: () =>
              of({
                lastRunAt: new Date(Date.now() - 30 * 60 * 1000),
                lastRunStatus: 'error',
                docsScanned: 0,
                openFailures: 0,
              }),
          },
        },
        {
          provide: FarmContextService,
          useValue: {
            activeRole: role,
            loading: signal(false),
            activeFarmId: signal('f1'),
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(LoadingComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.failures.length).toBe(0);

    role.set('owner');
    fixture.detectChanges();

    expect(component.failures.length).toBe(1);
    expect(component.heartbeatLoaded).toBeTrue();
    expect(component.scanUnavailable).toBeTrue();
  });
});
