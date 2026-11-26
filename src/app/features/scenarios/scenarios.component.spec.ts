import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslateService } from '@ngx-translate/core';
import { ScenariosComponent } from './scenarios.component';
import { ScenarioService } from '../../core/services/scenario.service';
import { FarmContextService } from '../../core/services/farm-context.service';
import { ScenarioRow } from '../../core/models/scenario-row.model';

function row(id: string): ScenarioRow {
  return {
    id,
    name: id,
    baseSource: 'saved-recipe',
    baseRecipeId: 'r1',
    changes: {},
    savedAt: null,
    diverged: null,
    snapshot: {
      status: 'computed',
      totalAsFed: 10,
      totalDM: 5,
      totalCost: 2,
      nutrients: {},
      lines: [],
      targets: [],
      compliance: {},
      warnings: [],
      computedAt: '2026-11-27T00:00:00Z',
    },
  };
}

describe('ScenariosComponent', () => {
  let component: ScenariosComponent;
  let scenarioService: jasmine.SpyObj<ScenarioService>;
  let snackBar: jasmine.SpyObj<MatSnackBar>;

  beforeEach(() => {
    scenarioService = jasmine.createSpyObj('ScenarioService', [
      'list',
      'remove',
    ]);
    snackBar = jasmine.createSpyObj('MatSnackBar', ['open']);
    TestBed.configureTestingModule({
      providers: [
        { provide: ScenarioService, useValue: scenarioService },
        {
          provide: FarmContextService,
          useValue: { activeFarmId: () => 'f1' },
        },
        { provide: MatSnackBar, useValue: snackBar },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    });
    component = TestBed.runInInjectionContext(() => new ScenariosComponent());
  });

  it('renders rows from the service', async () => {
    scenarioService.list.and.resolveTo([row('a')]);
    await component.load();
    expect(component.rows().map((entry) => entry.id)).toEqual(['a']);
  });

  it('caps selection at 20', () => {
    component.selected.set(new Set(Array.from({ length: 20 }, (_, i) => `s${i}`)));
    component.toggle('s20', true);
    expect(component.selected().size).toBe(20);
    expect(component.selected().has('s20')).toBeFalse();
    expect(snackBar.open).toHaveBeenCalled();
  });

  it('deletes after confirmation and reloads', async () => {
    scenarioService.remove.and.resolveTo();
    scenarioService.list.and.resolveTo([]);
    spyOn(window, 'confirm').and.returnValue(true);
    await component.remove(row('a'));
    expect(scenarioService.remove).toHaveBeenCalledWith('f1', 'a');
  });
});
