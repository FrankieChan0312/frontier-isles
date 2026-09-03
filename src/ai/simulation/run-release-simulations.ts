/// <reference types="node" />

import { simulateMixedProfileGames } from './mixed-profile-simulation.ts'
import { createReleaseSimulationReport } from './release-simulation-report.ts'

const RELEASE_GAME_COUNT = 100
const seeds = Array.from(
  { length: RELEASE_GAME_COUNT },
  (_, index) => `V1-RELEASE-${String(index + 1).padStart(3, '0')}`,
)

const summaries = await simulateMixedProfileGames(seeds)
const report = createReleaseSimulationReport(summaries)

process.stdout.write(`${JSON.stringify({ report, summaries }, null, 2)}\n`)
