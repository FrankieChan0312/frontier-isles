/// <reference types="node" />

import { simulateCoreAiGames } from './core-ai-simulation.ts'

const requestedCount = Number(process.argv[2] ?? 32)
if (!Number.isSafeInteger(requestedCount) || requestedCount < 1) {
  throw new Error('Simulation count must be a positive safe integer.')
}
const seeds = Array.from(
  { length: requestedCount },
  (_, index) => `CORE-AI-CORPUS-${String(index + 1).padStart(3, '0')}`,
)
const summaries = await simulateCoreAiGames(seeds)
const totalCommands = summaries.reduce((total, summary) => total + summary.commands, 0)
const maximumTurns = Math.max(...summaries.map((summary) => summary.turns))
process.stdout.write(`${JSON.stringify({
  games: summaries.length,
  winners: summaries.map((summary) => summary.winnerId),
  totalCommands,
  maximumTurns,
  summaries,
}, null, 2)}\n`)
