/// <reference types="node" />

import { simulateMixedProfileGames } from './mixed-profile-simulation.ts'

const requestedCount = Number(process.argv[2] ?? 32)
if (!Number.isSafeInteger(requestedCount) || requestedCount < 1) {
  throw new Error('Simulation count must be a positive safe integer.')
}
const seeds = Array.from(
  { length: requestedCount },
  (_, index) => `MIXED-AI-CORPUS-${String(index + 1).padStart(3, '0')}`,
)
const summaries = await simulateMixedProfileGames(seeds)
process.stdout.write(`${JSON.stringify({
  games: summaries.length,
  totalCommands: summaries.reduce((total, summary) => total + summary.commands, 0),
  maximumTurns: Math.max(...summaries.map((summary) => summary.turns)),
  summaries,
}, null, 2)}\n`)
