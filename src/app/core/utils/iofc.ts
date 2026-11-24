/**
 * Income over feed cost (IOFC), the economic lens for a herd group.
 *
 * Revenue is the group's milk income; feed cost is the active recipe's
 * per-head cost times the group head count. Feed cost per kg of milk uses the
 * same numbers. All figures are per day.
 */
export interface IofcInput {
  headCount: number;
  /** Whole-group milk for the day, kg. */
  milkKg: number;
  /** €/kg milk. */
  milkPricePerKg: number;
  /** € per head per day from the active recipe. */
  feedCostPerHead: number;
}

export interface IofcResult {
  milkRevenuePerDay: number;
  feedCostPerDay: number;
  iofcPerDay: number;
  iofcPerCowPerDay: number;
  milkPerCow: number;
  feedCostPerKgMilk: number | null;
}

export function computeIofc(input: IofcInput): IofcResult {
  const milkRevenuePerDay = input.milkKg * input.milkPricePerKg;
  const feedCostPerDay = input.headCount * input.feedCostPerHead;
  const iofcPerDay = milkRevenuePerDay - feedCostPerDay;
  return {
    milkRevenuePerDay,
    feedCostPerDay,
    iofcPerDay,
    iofcPerCowPerDay: input.headCount > 0 ? iofcPerDay / input.headCount : 0,
    milkPerCow: input.headCount > 0 ? input.milkKg / input.headCount : 0,
    feedCostPerKgMilk:
      input.milkKg > 0 ? feedCostPerDay / input.milkKg : null,
  };
}
