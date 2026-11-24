import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideTranslateService } from '@ngx-translate/core';
import { IofcComponent } from './iofc.component';
import { GroupService } from '../../core/services/group.service';
import { RecipeService } from '../../core/services/recipe.service';
import { MilkService } from '../../core/services/milk.service';
import { FeedingService } from '../../core/services/feeding.service';
import { FarmService } from '../../core/services/farm.service';
import { FarmContextService } from '../../core/services/farm-context.service';
import { HerdGroup } from '../../core/models/group.model';
import { Feeding } from '../../core/models/feeding.model';

/**
 * Wiring test: the IOFC component must use the group's head count and the
 * recipe's per-head cost. A synthetic-only test would pass even if the
 * component used animalCount or a per-kg price by mistake.
 */
describe('IofcComponent wiring', () => {
  function group(headCount: number): HerdGroup {
    return {
      id: 'g1',
      farmId: 'f1',
      name: 'High',
      animalGroupId: 'lactating',
      headCount,
      activeRecipeId: 'r1',
      externalId: null,
    };
  }

  let component: IofcComponent;
  let feedingList: Feeding[] = [];

  beforeEach(() => {
    feedingList = [];
    TestBed.configureTestingModule({
      imports: [IofcComponent],
      providers: [
        provideTranslateService(),
        { provide: GroupService, useValue: { getGroups: () => of([]) } },
        {
          provide: RecipeService,
          useValue: { getRecipeWithFeeds: async () => ({ cost: 4.5, feeds: [] }) },
        },
        {
          provide: MilkService,
          useValue: { getMilkRecords: () => of([]), saveRecord: async () => 'id' },
        },
        {
          provide: FeedingService,
          useValue: { getFeedings: () => of(feedingList) },
        },
        {
          provide: FarmService,
          useValue: {
            getMilkPricePerKg: async () => null,
            setMilkPricePerKg: async () => undefined,
          },
        },
        {
          provide: FarmContextService,
          useValue: { activeRole: () => 'owner', loading: () => false },
        },
      ],
    });
    component = TestBed.createComponent(IofcComponent).componentInstance;
  });

  it('uses the latest confirmed feeding and the farm milk price default', async () => {
    feedingList = [
      {
        id: 'f1',
        farmId: 'f1',
        date: '2026-11-20',
        herdGroupId: 'g1',
        feederId: 'feeder-1',
        status: 'confirmed',
        animalCount: 100,
        createdAt: new Date('2026-11-20T06:00:00Z'),
      },
      {
        id: 'f2',
        farmId: 'f1',
        date: '2026-11-20',
        herdGroupId: 'g1',
        feederId: 'feeder-1',
        status: 'confirmed',
        animalCount: 95,
        createdAt: new Date('2026-11-20T18:00:00Z'),
      },
    ] as Feeding[];
    component.farmMilkPrice = 0.55;
    component.groups = [group(100)];
    component.selectedGroupId = 'g1';
    component.date = '2026-11-20';
    await component.onGroupChange();
    component.milkKg = 3000;

    expect(component.milkPricePerKg).toBe(0.55);
    // The latest feeding's 95 head, not the group's 100.
    expect(component.result!.feedCostPerDay).toBeCloseTo(427.5, 6);
  });

  it('uses the group head count and the per-head recipe cost', async () => {
    component.groups = [group(100)];
    component.selectedGroupId = 'g1';
    await component.onGroupChange();
    component.milkKg = 3000;
    component.milkPricePerKg = 0.5;

    expect(component.feedCostPerHead).toBe(4.5);
    expect(component.result!.feedCostPerDay).toBeCloseTo(450, 6);
    expect(component.result!.iofcPerDay).toBeCloseTo(1050, 6);

    component.groups = [group(50)];
    component.selectedGroupId = 'g1';
    await component.onGroupChange();
    component.milkKg = 1500;

    expect(component.result!.feedCostPerDay).toBeCloseTo(225, 6);
    expect(component.result!.iofcPerDay).toBeCloseTo(525, 6);
  });
});
