import type { PlayerId } from '../../game/model/ids.ts'
import type { CoreAiSimulationSummary } from './core-ai-simulation.ts'

export interface ReleaseSimulationReport {
  readonly games: number
  readonly totalCommands: number
  readonly maximumCommands: number
  readonly maximumTurns: number
  readonly maximumRandomDraws: number
  readonly winnerCounts: Readonly<Record<PlayerId, number>>
  readonly firstSeed: string
  readonly lastSeed: string
  readonly deterministicSummaryHash: string
}

function stableHash(value: string): string {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

export function createReleaseSimulationReport(
  summaries: readonly CoreAiSimulationSummary[],
): ReleaseSimulationReport {
  const first = summaries[0]
  const last = summaries.at(-1)
  if (first === undefined || last === undefined) throw new Error('Release simulation report requires at least one game.')
  const winnerCounts = {} as Record<PlayerId, number>
  for (const summary of summaries) {
    winnerCounts[summary.winnerId] = (winnerCounts[summary.winnerId] ?? 0) + 1
  }
  return {
    games: summaries.length,
    totalCommands: summaries.reduce((total, summary) => total + summary.commands, 0),
    maximumCommands: Math.max(...summaries.map((summary) => summary.commands)),
    maximumTurns: Math.max(...summaries.map((summary) => summary.turns)),
    maximumRandomDraws: Math.max(...summaries.map((summary) => summary.finalRandomDrawCount)),
    winnerCounts,
    firstSeed: first.seed,
    lastSeed: last.seed,
    deterministicSummaryHash: stableHash(JSON.stringify(summaries)),
  }
}
