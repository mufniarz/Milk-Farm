import {
  computeCalledKg,
  computeDeviationPct,
  findOverdrawnFeeds,
  findUntrackedFeedIds,
} from './loading-math';

describe('loading math', () => {
  it('computes called kg from the recipe per-head quantity and head count', () => {
    expect(computeCalledKg(3.5, 100)).toBeCloseTo(350, 6);
    expect(computeCalledKg(0, 100)).toBe(0);
  });

  it('computes the deviation and returns null when called is zero', () => {
    expect(computeDeviationPct(105, 100)).toBeCloseTo(5, 6);
    expect(computeDeviationPct(95, 100)).toBeCloseTo(-5, 6);
    expect(computeDeviationPct(100, 100)).toBe(0);
    expect(computeDeviationPct(10, 0)).toBeNull();
  });

  it('finds untracked feeds without duplicating a feed id', () => {
    expect(
      findUntrackedFeedIds(
        [{ feedId: 'a' }, { feedId: 'a' }, { feedId: 'b' }, { feedId: 'c' }],
        ['a'],
      ),
    ).toEqual(['b', 'c']);
  });

  it('aggregates duplicate feed lines before checking for an overdraft', () => {
    const overdrawn = findOverdrawnFeeds(
      [
        { feedId: 'a', feedName: 'Silage', calledKgAsFed: 60, loadedKgAsFed: 60 },
        { feedId: 'a', feedName: 'Silage', calledKgAsFed: 50, loadedKgAsFed: 50 },
        { feedId: 'b', feedName: 'Hay', calledKgAsFed: 20, loadedKgAsFed: 20 },
      ],
      [
        { feedId: 'a', onHandKgAsFed: 100 },
        { feedId: 'b', onHandKgAsFed: 100 },
      ],
    );

    expect(overdrawn).toEqual([
      {
        feedId: 'a',
        feedName: 'Silage',
        onHandKgAsFed: 100,
        consumptionKgAsFed: 110,
        resultingKgAsFed: -10,
      },
    ]);
  });

  it('ignores untracked feeds when checking for an overdraft', () => {
    expect(
      findOverdrawnFeeds(
        [{ feedId: 'missing', feedName: 'X', calledKgAsFed: 10, loadedKgAsFed: 10 }],
        [],
      ),
    ).toEqual([]);
  });
});
