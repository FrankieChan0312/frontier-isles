import type { GameEvent } from '../contracts/events.ts'
import type { GameState } from '../model/game-state.ts'
import type { CommandId, TileId } from '../model/ids.ts'
import type { ResourceBag } from '../model/resource.ts'
import { executeNormalTurnLifecycleCommand } from './normal-turn-lifecycle-engine.ts'
import { executeRobberWorkflowCommand } from './robber-workflow-engine.ts'
import type { RobberWorkflowCommand } from './robber-workflow-engine.ts'
import {
  createCompletedGoldenSetup,
  GOLDEN_PLAYER_IDS,
} from './task-05-golden-fixture.test-helper.ts'
import { createBalancedDiscardState } from './task-07-controlled-seven.test-helper.ts'

const GOLDEN_HANDS = {
  [GOLDEN_PLAYER_IDS.sentinel]: { LUMBER: 3, BRICK: 3, WOOL: 1, GRAIN: 3, ORE: 3 },
  [GOLDEN_PLAYER_IDS.human]: { LUMBER: 0, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 0 },
  [GOLDEN_PLAYER_IDS.merchant]: { LUMBER: 0, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 },
  [GOLDEN_PLAYER_IDS.builder]: { LUMBER: 0, BRICK: 3, WOOL: 0, GRAIN: 1, ORE: 0 },
} as const satisfies Readonly<Record<string, ResourceBag>>

function replaceHandsAndBank(
  state: GameState,
  hands: Readonly<Record<string, ResourceBag>>,
  bankResources: ResourceBag,
): GameState {
  const players = Object.fromEntries(state.playerOrder.map((playerId) => {
    const player = state.players[playerId]
    const resources = hands[playerId]
    if (player === undefined || resources === undefined) {
      throw new Error(`Missing Task 08 rebalance data for ${playerId}.`)
    }
    return [playerId, { ...player, resources: { ...resources } }]
  })) as GameState['players']
  return {
    ...state,
    players,
    bank: { ...state.bank, resources: { ...bankResources } },
  }
}

export function createGoldenPaidBuildingStart(): GameState {
  const setup = createCompletedGoldenSetup()
  const roll = executeNormalTurnLifecycleCommand(setup, {
    commandId: 'command:task-08:golden-roll' as CommandId,
    actorId: GOLDEN_PLAYER_IDS.sentinel,
    expectedStateVersion: 16,
    command: { type: 'ROLL_DICE' },
  })
  if (!roll.ok) throw new Error(`Task 08 golden roll failed: ${roll.violation.code}.`)
  return replaceHandsAndBank(
    roll.state,
    GOLDEN_HANDS,
    { LUMBER: 16, BRICK: 11, WOOL: 17, GRAIN: 14, ORE: 16 },
  )
}

function executeRobberSuccess(state: GameState, command: RobberWorkflowCommand): {
  readonly state: GameState
  readonly events: readonly GameEvent[]
} {
  const result = executeRobberWorkflowCommand(state, {
    commandId: `command:task-08:seven:${state.stateVersion}` as CommandId,
    actorId: command.type === 'DISCARD_RESOURCES'
      ? state.stateVersion === 17
        ? GOLDEN_PLAYER_IDS.human
        : state.stateVersion === 18
          ? GOLDEN_PLAYER_IDS.builder
          : GOLDEN_PLAYER_IDS.sentinel
      : GOLDEN_PLAYER_IDS.sentinel,
    expectedStateVersion: state.stateVersion,
    command,
  })
  if (!result.ok) throw new Error(`Task 08 robber fixture failed: ${result.violation.code}.`)
  return result
}

export function createResolvedSevenPaidBuildingStart(): GameState {
  let state = createBalancedDiscardState()
  state = executeRobberSuccess(state, {
    type: 'DISCARD_RESOURCES',
    resources: { LUMBER: 0, BRICK: 4, WOOL: 0, GRAIN: 0, ORE: 0 },
  }).state
  state = executeRobberSuccess(state, {
    type: 'DISCARD_RESOURCES',
    resources: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 6, ORE: 0 },
  }).state
  state = executeRobberSuccess(state, {
    type: 'DISCARD_RESOURCES',
    resources: { LUMBER: 4, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
  }).state
  state = executeRobberSuccess(state, {
    type: 'MOVE_ROBBER',
    tileId: 'tile:0,-2' as TileId,
  }).state
  state = executeRobberSuccess(state, {
    type: 'STEAL_FROM_PLAYER',
    targetPlayerId: GOLDEN_PLAYER_IDS.builder,
  }).state

  const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
  if (sentinel === undefined) throw new Error('Missing Sentinel after Task 07 workflow.')
  return {
    ...state,
    players: {
      ...state.players,
      [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel,
        resources: { ...sentinel.resources, BRICK: 1 },
      },
    },
    bank: {
      ...state.bank,
      resources: { ...state.bank.resources, BRICK: state.bank.resources.BRICK - 1 },
    },
  }
}
