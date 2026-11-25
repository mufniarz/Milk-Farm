export type WarningIssue = 'below_min' | 'above_max' | 'at_boundary';

export interface RecipeWarningLike {
  code: string;
  value: number;
  min: number | null;
  max: number | null;
  issue: WarningIssue;
  boundary?: 'min' | 'max';
}

/** i18n key for the warning label. */
export function warningIssueKey(
  issue: WarningIssue,
  isOverride = false,
): string {
  if (issue === 'below_min') return 'RECIPES.BELOW_MIN';
  if (issue === 'above_max') return 'RECIPES.ABOVE_MAX';
  return isOverride
    ? 'RECIPES.AT_BOUNDARY_OVERRIDE'
    : 'RECIPES.AT_BOUNDARY';
}

/** The limit shown next to the warning: the min for below/boundary-min, else max. */
export function warningLimit(warning: RecipeWarningLike): number | null {
  if (warning.issue === 'below_min' || warning.boundary === 'min') {
    return warning.min;
  }
  return warning.max;
}


export interface TargetReferenceLike {
  source?: 'reference' | 'override';
  referenceMinValue?: number | null;
  referenceMaxValue?: number | null;
}

/** For an override boundary, the original reference floor to show alongside it. */
export function warningReferenceLimit(
  warning: RecipeWarningLike,
  target: TargetReferenceLike | undefined,
): number | null {
  if (warning.issue !== 'at_boundary' || target?.source !== 'override') {
    return null;
  }
  return warning.boundary === 'min'
    ? (target.referenceMinValue ?? null)
    : (target.referenceMaxValue ?? null);
}
