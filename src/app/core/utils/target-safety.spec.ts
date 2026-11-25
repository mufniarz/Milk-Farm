import {
  isFibreBelowReference,
} from './target-safety';

describe('target safety', () => {
  it('flags a fibre target below the reference floor', () => {
    expect(isFibreBelowReference('aNDF', 15, 20, 28)).toBeTrue();
    expect(isFibreBelowReference('ADF', 18, 16, 18)).toBeTrue();
  });

  it('does not flag a fibre target at or above the floor', () => {
    expect(isFibreBelowReference('aNDF', 28, 34, 28)).toBeFalse();
    expect(isFibreBelowReference('uNDF', 9, 12, 9)).toBeFalse();
  });

  it('ignores non-fibre nutrients and missing reference floors', () => {
    expect(isFibreBelowReference('proteina', 10, 12, 14.5)).toBeFalse();
    expect(isFibreBelowReference('aNDF', 15, 20, null)).toBeFalse();
  });
});
