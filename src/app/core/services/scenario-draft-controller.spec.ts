import { ScenarioDraftController } from './scenario-draft-controller';

describe('ScenarioDraftController', () => {
  it('tracks mutations and returns changes', () => {
    const controller = new ScenarioDraftController();
    controller.setFeedPrice('corn', 0.2);
    controller.setInclusion('corn', 5);
    controller.setTargetOverride('aNDF', { min: 30, max: 34 });
    expect(controller.dirty()).toBeTrue();
    expect(controller.toChanges()).toEqual({
      feedPrices: { corn: 0.2 },
      inclusions: { corn: 5 },
      targetOverrides: { aNDF: { min: 30, max: 34 } },
    });
  });

  it('load resets dirty and populates the draft', () => {
    const controller = new ScenarioDraftController();
    controller.load({ inclusions: { corn: 4 } });
    expect(controller.dirty()).toBeFalse();
    expect(controller.toChanges()).toEqual({ inclusions: { corn: 4 } });
    controller.clear();
    expect(controller.dirty()).toBeTrue();
    expect(controller.toChanges()).toEqual({});
  });
});
