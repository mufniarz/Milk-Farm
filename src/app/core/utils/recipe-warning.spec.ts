import {
  warningIssueKey,
  warningLimit,
  warningReferenceLimit,
} from './recipe-warning';

describe('recipe warning rendering', () => {
  it('maps each issue to its label', () => {
    expect(warningIssueKey('below_min')).toBe('RECIPES.BELOW_MIN');
    expect(warningIssueKey('above_max')).toBe('RECIPES.ABOVE_MAX');
    expect(warningIssueKey('at_boundary')).toBe('RECIPES.AT_BOUNDARY');
    expect(warningIssueKey('at_boundary', true)).toBe(
      'RECIPES.AT_BOUNDARY_OVERRIDE',
    );
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


describe('override boundary reference', () => {
  it('shows the reference floor alongside an override boundary', () => {
    expect(
      warningReferenceLimit(
        {
          code: 'aNDF',
          value: 26,
          min: 26,
          max: 30,
          issue: 'at_boundary',
          boundary: 'min',
        },
        { source: 'override', referenceMinValue: 28 },
      ),
    ).toBe(28);
  });

  it('does not show a reference for a reference target', () => {
    expect(
      warningReferenceLimit(
        {
          code: 'aNDF',
          value: 28,
          min: 28,
          max: 34,
          issue: 'at_boundary',
          boundary: 'min',
        },
        { source: 'reference', referenceMinValue: 28 },
      ),
    ).toBeNull();
  });
});
