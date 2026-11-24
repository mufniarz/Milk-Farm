import { computeIofc } from './iofc';

describe('IOFC math', () => {
  it('reproduces the 100-cow worked example', () => {
    // 100 cows x 30 kg x EUR 0.50 = EUR 1,500 revenue;
    // 100 x EUR 4.50 = EUR 450 feed; IOFC EUR 1,050/day.
    const result = computeIofc({
      headCount: 100,
      milkKg: 3000,
      milkPricePerKg: 0.5,
      feedCostPerHead: 4.5,
    });

    expect(result.milkRevenuePerDay).toBeCloseTo(1500, 6);
    expect(result.feedCostPerDay).toBeCloseTo(450, 6);
    expect(result.iofcPerDay).toBeCloseTo(1050, 6);
    expect(result.iofcPerCowPerDay).toBeCloseTo(10.5, 6);
    expect(result.milkPerCow).toBeCloseTo(30, 6);
    expect(result.feedCostPerKgMilk).toBeCloseTo(0.15, 6);
  });

  it('returns null feed cost per kg when no milk is recorded', () => {
    const result = computeIofc({
      headCount: 50,
      milkKg: 0,
      milkPricePerKg: 0.5,
      feedCostPerHead: 2,
    });
    expect(result.feedCostPerKgMilk).toBeNull();
    expect(result.iofcPerDay).toBeCloseTo(-100, 6);
  });

  it('handles zero head count without dividing by zero', () => {
    const result = computeIofc({
      headCount: 0,
      milkKg: 0,
      milkPricePerKg: 0.5,
      feedCostPerHead: 2,
    });
    expect(result.iofcPerCowPerDay).toBe(0);
    expect(result.milkPerCow).toBe(0);
  });
});
