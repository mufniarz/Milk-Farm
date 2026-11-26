import {
  draftToChanges,
  emptyScenarioDraft,
  setFeedPrice,
  setInclusion,
  setTargetOverride,
} from './scenario-change-draft';

describe('scenario change draft', () => {
  it('builds price, inclusion and override changes', () => {
    let draft = emptyScenarioDraft();
    draft = setFeedPrice(draft, 'corn', 0.2);
    draft = setInclusion(draft, 'corn', 5);
    draft = setTargetOverride(draft, 'aNDF', { min: 30, max: 34 });
    expect(draftToChanges(draft)).toEqual({
      feedPrices: { corn: 0.2 },
      inclusions: { corn: 5 },
      targetOverrides: { aNDF: { min: 30, max: 34 } },
    });
  });

  it('omits empty maps', () => {
    expect(draftToChanges(emptyScenarioDraft())).toEqual({});
  });
});
