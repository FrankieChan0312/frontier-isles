import type { AiProfileId, PlayerId } from '../../game/model/ids.ts'
import type { CoreAiSimulationSummary } from './core-ai-simulation.ts'
import { createReleaseSimulationReport } from './release-simulation-report.ts'

function summary(seed: string, commands: number): CoreAiSimulationSummary {
  return {
    seed,
    winnerId: 'player:simulation:north' as PlayerId,
    commands,
    turns: 42,
    finalStateVersion: commands,
    finalRandomDrawCount: 21,
    profileIds: ['MERCHANT', 'BUILDER', 'SENTINEL', 'MERCHANT'] as unknown as readonly [
      AiProfileId,
      AiProfileId,
      AiProfileId,
      AiProfileId,
    ],
  }
}

describe('release simulation report', () => {
  it('creates a stable ordered corpus summary', () => {
    const summaries = [summary('RELEASE-001', 100), summary('RELEASE-002', 120)]
    const first = createReleaseSimulationReport(summaries)
    const second = createReleaseSimulationReport(summaries)
    expect(first).toEqual(second)
    expect(first).toMatchObject({
      games: 2,
      totalCommands: 220,
      maximumCommands: 120,
      firstSeed: 'RELEASE-001',
      lastSeed: 'RELEASE-002',
      winnerCounts: { 'player:simulation:north': 2 },
    })
    expect(first.deterministicSummaryHash).toBe('87272e78')
  })

  it('rejects an empty release corpus', () => {
    expect(() => createReleaseSimulationReport([])).toThrow(
      'Release simulation report requires at least one game.',
    )
  })
})
