import type { GameConfig } from '../model/game-config.ts'
import type { GameState } from '../model/game-state.ts'
import type {
  AiProfileId,
  CommandId,
  EdgeId,
  GameId,
  PlayerId,
  VertexId,
} from '../model/ids.ts'
import { RULESET_ID } from '../model/ruleset.ts'
import { createGame } from './create-game.ts'
import {
  executeInitialSetupCommand,
} from './initial-setup-engine.ts'
import type { InitialSetupCommand } from './initial-setup-engine.ts'

export const GOLDEN_PLAYER_IDS = {
  sentinel: 'player:sentinel' as PlayerId,
  human: 'player:human' as PlayerId,
  merchant: 'player:merchant' as PlayerId,
  builder: 'player:builder' as PlayerId,
} as const

const GOLDEN_SETUP_REPLAY: readonly (readonly [PlayerId, InitialSetupCommand])[] = [
  [GOLDEN_PLAYER_IDS.sentinel, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,-1,2' as VertexId }],
  [GOLDEN_PLAYER_IDS.sentinel, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,-1,2|vertex:-2,-2,4' as EdgeId }],
  [GOLDEN_PLAYER_IDS.human, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,-4,5' as VertexId }],
  [GOLDEN_PLAYER_IDS.human, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,-4,5|vertex:-2,-2,4' as EdgeId }],
  [GOLDEN_PLAYER_IDS.merchant, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,-7,8' as VertexId }],
  [GOLDEN_PLAYER_IDS.merchant, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,-7,8|vertex:-2,-5,7' as EdgeId }],
  [GOLDEN_PLAYER_IDS.builder, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,2,-1' as VertexId }],
  [GOLDEN_PLAYER_IDS.builder, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,2,-1|vertex:-2,1,1' as EdgeId }],
  [GOLDEN_PLAYER_IDS.builder, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,5,-4' as VertexId }],
  [GOLDEN_PLAYER_IDS.builder, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,5,-4|vertex:-2,4,-2' as EdgeId }],
  [GOLDEN_PLAYER_IDS.merchant, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,8,-7' as VertexId }],
  [GOLDEN_PLAYER_IDS.merchant, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,8,-7|vertex:-2,7,-5' as EdgeId }],
  [GOLDEN_PLAYER_IDS.human, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-4,-1,5' as VertexId }],
  [GOLDEN_PLAYER_IDS.human, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-2,-2,4|vertex:-4,-1,5' as EdgeId }],
  [GOLDEN_PLAYER_IDS.sentinel, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-4,-4,8' as VertexId }],
  [GOLDEN_PLAYER_IDS.sentinel, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-2,-5,7|vertex:-4,-4,8' as EdgeId }],
]

function goldenConfig(): GameConfig {
  return {
    gameId: 'game:task-05' as GameId,
    rulesetId: RULESET_ID,
    players: [
      { id: GOLDEN_PLAYER_IDS.human, name: 'Frankie', color: 'RED', controller: { type: 'HUMAN' } },
      { id: GOLDEN_PLAYER_IDS.merchant, name: 'Merchant', color: 'BLUE', controller: { type: 'AI', profileId: 'ai:merchant' as AiProfileId } },
      { id: GOLDEN_PLAYER_IDS.builder, name: 'Builder', color: 'ORANGE', controller: { type: 'AI', profileId: 'ai:builder' as AiProfileId } },
      { id: GOLDEN_PLAYER_IDS.sentinel, name: 'Sentinel', color: 'WHITE', controller: { type: 'AI', profileId: 'ai:sentinel' as AiProfileId } },
    ],
  }
}

export function createCompletedGoldenSetup(): GameState {
  let state = createGame(goldenConfig(), 'FRONTIER-ISLES-TASK-05')
  for (let index = 0; index < GOLDEN_SETUP_REPLAY.length; index += 1) {
    const step = GOLDEN_SETUP_REPLAY[index]
    if (step === undefined) throw new Error(`Missing frozen setup replay step ${index}.`)
    const result = executeInitialSetupCommand(state, {
      commandId: `command:task-05-setup:${index}` as CommandId,
      actorId: step[0],
      expectedStateVersion: index,
      command: step[1],
    })
    if (!result.ok) throw new Error(`Frozen setup replay failed at step ${index}: ${result.violation.code}.`)
    state = result.state
  }
  return state
}
