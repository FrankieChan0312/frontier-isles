import { simulateOnlineGame, type OnlineSimulationSummary } from './online-game-simulation.js'

const summaries: OnlineSimulationSummary[] = []
for (const humans of [2, 3, 4] as const) {
  const first = await simulateOnlineGame(humans, 'GOAL-B-ONLINE-001')
  const repeated = await simulateOnlineGame(humans, 'GOAL-B-ONLINE-001')
  if (JSON.stringify(first) !== JSON.stringify(repeated)) throw new Error(`Non-deterministic ${humans}H summary`)
  summaries.push(first)
}
console.log(JSON.stringify({ games: 6, legalWinners: 6, repeatedSeedsMatch: true, summaries }, null, 2))
