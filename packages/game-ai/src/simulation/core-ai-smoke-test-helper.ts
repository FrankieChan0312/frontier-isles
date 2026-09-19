import { simulateCoreAiGames } from './core-ai-simulation.ts'

export function registerCoreAiSmokeBatch(
  batch: number,
  start: number,
): void {
  const seeds = Array.from(
    { length: 4 },
    (_, index) => `CORE-AI-SMOKE-${String(start + index).padStart(2, '0')}`,
  )
  describe(`core AI smoke batch ${batch}`, () => {
    it('finishes four fixed all-seat AI games within the safety bounds', async () => {
      const summaries = await simulateCoreAiGames(seeds)
      expect(summaries).toHaveLength(4)
      for (const summary of summaries) {
        expect(summary.winnerId).toMatch(/^player:simulation:/)
        expect(summary.commands).toBeGreaterThan(16)
        expect(summary.commands).toBeLessThanOrEqual(20_000)
        expect(summary.turns).toBeLessThanOrEqual(2_000)
        expect(summary.finalStateVersion).toBe(summary.commands)
      }
    }, 120_000)
  })
}
