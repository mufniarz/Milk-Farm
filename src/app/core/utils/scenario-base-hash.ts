/** Canonical builder base lines, shared with the Python hash. */
export interface ScenarioBaseLine {
  feedId: string;
  kgAsFed: number;
}

export function normalizeScenarioBaseLines(lines: ScenarioBaseLine[]): string {
  const normalized = lines
    .filter((line) => line.kgAsFed > 0)
    .map((line) => ({
      feedId: line.feedId,
      kgAsFed: Math.round(line.kgAsFed * 1000) / 1000,
    }))
    .sort((a, b) => a.feedId.localeCompare(b.feedId));
  return JSON.stringify(normalized);
}

export async function scenarioBaseHash(lines: ScenarioBaseLine[]): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeScenarioBaseLines(lines));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
