import { simulateMixedProfileGames } from './mixed-profile-simulation.ts'

export function registerMixedAiSmokeBatch(batch: number, start: number): void {
  const seeds = Array.from(
    { length: 4 },
    (_, index) => `MIXED-AI-SMOKE-${String(start + index).padStart(2, '0')}`,
  )
  describe(`mixed personality AI smoke batch ${batch}`, () => {
    it('finishes four fixed games with all three profiles and invariant checks', async () => {
      const summaries = await simulateMixedProfileGames(seeds, start - 1)
      expect(summaries).toHaveLength(4)
      for (const summary of summaries) {
        expect(new Set(summary.profileIds)).toEqual(
          new Set(['MERCHANT', 'BUILDER', 'SENTINEL']),
        )
        expect(summary.winnerId).toMatch(/^player:simulation:/)
        expect(summary.commands).toBeLessThanOrEqual(20_000)
        expect(summary.turns).toBeLessThanOrEqual(2_000)
        expect(summary.finalStateVersion).toBe(summary.commands)
      }
    }, 180_000)
  })
}
