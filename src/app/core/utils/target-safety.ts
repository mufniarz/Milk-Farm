/** Fibre targets where dropping below the workbook floor is a herd-risk decision. */
export const FIBRE_TARGET_CODES = new Set([
  'aNDF',
  'ADF',
  'uNDF',
  'ADF_aNDF',
  'uNDF_aNDF',
]);

export function isFibreBelowReference(
  code: string,
  minValue: number | null | undefined,
  maxValue: number | null | undefined,
  referenceMinValue: number | null | undefined,
): boolean {
  if (!FIBRE_TARGET_CODES.has(code) || referenceMinValue == null) {
    return false;
  }
  return (
    (minValue != null && minValue < referenceMinValue) ||
    (maxValue != null && maxValue < referenceMinValue)
  );
}
