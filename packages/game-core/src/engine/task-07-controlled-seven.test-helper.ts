import type { GameState } from '../model/game-state.ts'
import type { CommandId, PlayerId } from '../model/ids.ts'
import type { ResourceBag } from '../model/resource.ts'
import { executeNormalTurnLifecycleCommand } from './normal-turn-lifecycle-engine.ts'
import {
  createCompletedGoldenSetup,
  GOLDEN_PLAYER_IDS,
} from './task-05-golden-fixture.test-helper.ts'

const BALANCED_HANDS: Readonly<Record<PlayerId, ResourceBag>> = {
  [GOLDEN_PLAYER_IDS.sentinel]: { LUMBER: 8, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
  [GOLDEN_PLAYER_IDS.human]: { LUMBER: 0, BRICK: 9, WOOL: 0, GRAIN: 0, ORE: 0 },
  [GOLDEN_PLAYER_IDS.merchant]: { LUMBER: 0, BRICK: 0, WOOL: 7, GRAIN: 0, ORE: 0 },
  [GOLDEN_PLAYER_IDS.builder]: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 12, ORE: 0 },
}

function controlledBase(balanced: boolean): GameState {
  const state = createCompletedGoldenSetup()
  if (!balanced) {
    return { ...state, random: { ...state.random, state: 259, drawCount: 84 } }
  }
  const players = Object.fromEntries(state.playerOrder.map((playerId) => {
    const player = state.players[playerId]
    if (player === undefined) throw new Error(`Missing controlled player ${playerId}.`)
    return [playerId, { ...player, resources: BALANCED_HANDS[playerId] }]
  })) as GameState['players']
  return {
    ...state,
    players,
    bank: {
      ...state.bank,
      resources: { LUMBER: 11, BRICK: 10, WOOL: 12, GRAIN: 7, ORE: 19 },
    },
    random: { ...state.random, state: 259, drawCount: 84 },
  }
}

function rollControlledSeven(state: GameState): GameState {
  const result = executeNormalTurnLifecycleCommand(state, {
    commandId: 'command:task-07:roll' as CommandId,
    actorId: GOLDEN_PLAYER_IDS.sentinel,
    expectedStateVersion: 16,
    command: { type: 'ROLL_DICE' },
  })
  if (!result.ok) throw new Error(`Controlled seven failed: ${result.violation.code}.`)
  return result.state
}

export function createBalancedControlledRollInput(): GameState {
  return controlledBase(true)
}

export function createBalancedDiscardState(): GameState {
  return rollControlledSeven(controlledBase(true))
}

export function createNoDiscardRobberMoveState(): GameState {
  return rollControlledSeven(controlledBase(false))
}
