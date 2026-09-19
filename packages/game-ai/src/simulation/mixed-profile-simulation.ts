import type { AiProfileId } from '@frontier-isles/game-core/model/ids'
import { asAiProfileId, BUILT_IN_AI_PROFILE_IDS } from '../personalities/ai-profiles.ts'
import { PersonalityAiAgent } from '../personality-ai-agent.ts'
import {
  simulateCoreAiGame,
  type CoreAiSimulationSummary,
} from './core-ai-simulation.ts'

export function mixedProfileIdsForGame(
  gameIndex: number,
): readonly [AiProfileId, AiProfileId, AiProfileId, AiProfileId] {
  const profiles = BUILT_IN_AI_PROFILE_IDS
  const first = profiles[gameIndex % profiles.length]
  const second = profiles[(gameIndex + 1) % profiles.length]
  const third = profiles[(gameIndex + 2) % profiles.length]
  const fourth = profiles[(gameIndex + 3) % profiles.length]
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    throw new Error(`Cannot resolve mixed AI profiles for game ${gameIndex}.`)
  }
  return [
    asAiProfileId(first),
    asAiProfileId(second),
    asAiProfileId(third),
    asAiProfileId(fourth),
  ]
}

export async function simulateMixedProfileGames(
  seeds: readonly string[],
  startIndex = 0,
): Promise<readonly CoreAiSimulationSummary[]> {
  const agent = new PersonalityAiAgent()
  const summaries: CoreAiSimulationSummary[] = []
  for (let index = 0; index < seeds.length; index += 1) {
    const seed = seeds[index]
    if (seed === undefined) throw new Error(`Missing mixed simulation seed ${index}.`)
    summaries.push(await simulateCoreAiGame(seed, {
      agent,
      profileIds: mixedProfileIdsForGame(startIndex + index),
    }))
  }
  return summaries
}
