import { warningIssueKey, warningLimit } from './recipe-warning';

describe('recipe warning rendering', () => {
  it('maps each issue to its label', () => {
    expect(warningIssueKey('below_min')).toBe('RECIPES.BELOW_MIN');
    expect(warningIssueKey('above_max')).toBe('RECIPES.ABOVE_MAX');
    expect(warningIssueKey('at_boundary')).toBe('RECIPES.AT_BOUNDARY');
  });

  it('shows the min for below_min and boundary-min', () => {
    expect(
      warningLimit({
        code: 'ADF',
        value: 17.9,
        min: 18,
        max: 22,
        issue: 'below_min',
      }),
    ).toBe(18);
    expect(
      warningLimit({
        code: 'ADF',
        value: 18,
        min: 18,
        max: 22,
        issue: 'at_boundary',
        boundary: 'min',
      }),
    ).toBe(18);
  });

  it('shows the max for above_max and boundary-max', () => {
    expect(
      warningLimit({
        code: 'uNDF_aNDF',
        value: 36.6,
        min: 29,
        max: 36.5,
        issue: 'above_max',
      }),
    ).toBe(36.5);
    expect(
      warningLimit({
        code: 'uNDF_aNDF',
        value: 36.5001,
        min: 29,
        max: 36.5,
        issue: 'at_boundary',
        boundary: 'max',
      }),
    ).toBe(36.5);
  });
});
