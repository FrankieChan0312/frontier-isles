import type { GameState } from '../../src/game/model/game-state.ts'
import type {
  AiProfileId,
  CommandId,
  PlayerId,
  VertexId,
} from '../../src/game/model/ids.ts'
import { executeNormalTurnLifecycleCommand } from '../../src/game/engine/normal-turn-lifecycle-engine.ts'
import {
  createCompletedGoldenSetup,
  GOLDEN_PLAYER_IDS,
} from '../../src/game/engine/task-05-golden-fixture.test-helper.ts'
import { createBalancedDiscardState } from '../../src/game/engine/task-07-controlled-seven.test-helper.ts'
import { createGoldenPaidBuildingStart } from '../../src/game/engine/task-08-paid-building.test-helper.ts'
import {
  createGoldenDomesticTradeStart,
  createGoldenMaritimeTradeStart,
} from '../../src/game/engine/task-11-trading.test-helper.ts'
import {
  GAME_SAVE_SCHEMA_VERSION,
  serializeGameSave,
  type GameSaveEnvelope,
} from '../../src/infrastructure/persistence/game-save-format.ts'

export const SAVE_STORAGE_KEY = 'frontier-isles:v1:latest-save'

const PROFILE_ROTATION = ['MERCHANT', 'BUILDER', 'SENTINEL'] as const

function turnIdentity(state: GameState): string {
  if (state.turn.setup !== null) {
    return `setup:${state.turn.setup.round}:${state.turn.setup.placementIndex}:${state.turn.currentPlayerId}`
  }
  return `turn:${state.turn.turnNumber}:${state.turn.currentPlayerId}`
}

function withHumanController(state: GameState, humanPlayerId: PlayerId): GameState {
  let aiIndex = 0
  const players = Object.fromEntries(state.playerOrder.map((playerId) => {
    const player = state.players[playerId]
    if (player === undefined) throw new Error(`Missing E2E player ${playerId}.`)
    if (playerId === humanPlayerId) {
      return [playerId, { ...player, controller: { type: 'HUMAN' as const } }]
    }
    const profile = PROFILE_ROTATION[aiIndex % PROFILE_ROTATION.length]
    aiIndex += 1
    if (profile === undefined) throw new Error('Missing E2E profile.')
    return [playerId, {
      ...player,
      controller: { type: 'AI' as const, profileId: profile as AiProfileId },
    }]
  })) as GameState['players']
  return { ...state, players }
}

function envelope(state: GameState, humanPlayerId: PlayerId): GameSaveEnvelope {
  const assignments = {} as Record<PlayerId, AiProfileId>
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId]
    if (player?.controller.type === 'AI') assignments[playerId] = player.controller.profileId
  }
  return {
    schemaVersion: GAME_SAVE_SCHEMA_VERSION,
    savedAt: '2026-09-03T00:00:00.000Z',
    gameId: state.gameId,
    displaySeed: state.random.seed,
    humanPlayerId,
    aiProfileAssignments: assignments,
    orchestration: {
      commandCounter: state.stateVersion,
      commandCountThisGame: state.stateVersion,
      turnIdentity: turnIdentity(state),
      commandKeysThisTurn: [],
    },
    state,
  }
}

function save(state: GameState, humanPlayerId: PlayerId): string {
  const controlled = withHumanController(state, humanPlayerId)
  return serializeGameSave(envelope(controlled, humanPlayerId))
}

export function paidBuildSave(): string {
  return save(createGoldenPaidBuildingStart(), GOLDEN_PLAYER_IDS.sentinel)
}

export function controlledSevenSave(): string {
  return save(createBalancedDiscardState(), GOLDEN_PLAYER_IDS.sentinel)
}

export function maritimeTradeSave(): string {
  return save(createGoldenMaritimeTradeStart(), GOLDEN_PLAYER_IDS.merchant)
}

export function domesticTradeSave(): string {
  return save(createGoldenDomesticTradeStart(), GOLDEN_PLAYER_IDS.sentinel)
}

function createVictoryState(): GameState {
  const base = createGoldenPaidBuildingStart()
  const human = base.players[GOLDEN_PLAYER_IDS.human]
  if (human === undefined) throw new Error('Missing Human victory fixture player.')
  const vpIds = base.bank.developmentDeck
    .filter((card) => card.type === 'VICTORY_POINT')
    .map((card) => card.id)
  const vpIdSet = new Set(vpIds)
  const fixture: GameState = {
    ...base,
    board: {
      ...base.board,
      vertexOccupancy: {
        ...Object.fromEntries(Object.keys(base.board.vertexOccupancy).map((id) => [id, null])),
        ['vertex:-1,-4,5' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.human },
        ['vertex:-1,8,-7' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.human },
        ['vertex:5,-4,-1' as VertexId]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.human },
      } as GameState['board']['vertexOccupancy'],
      edgeOccupancy: Object.fromEntries(
        Object.keys(base.board.edgeOccupancy).map((id) => [id, null]),
      ) as GameState['board']['edgeOccupancy'],
    },
    bank: {
      ...base.bank,
      developmentDeck: base.bank.developmentDeck.filter((card) => !vpIdSet.has(card.id)),
    },
    players: {
      ...base.players,
      [GOLDEN_PLAYER_IDS.human]: {
        ...human,
        developmentCards: base.bank.developmentDeck
          .filter((card) => vpIdSet.has(card.id))
          .map((card) => ({ ...card, acquiredTurnNumber: 1, status: 'IN_HAND' as const })),
      },
    },
  }
  const result = executeNormalTurnLifecycleCommand(fixture, {
    commandId: 'command:e2e:victory' as CommandId,
    actorId: GOLDEN_PLAYER_IDS.sentinel,
    expectedStateVersion: fixture.stateVersion,
    command: { type: 'END_TURN' },
  })
  if (!result.ok) throw new Error(`Victory fixture failed: ${result.violation.code}`)
  return result.state
}

export function victorySave(): string {
  return save(createVictoryState(), GOLDEN_PLAYER_IDS.human)
}

export function completedSetupSave(): string {
  return save(createCompletedGoldenSetup(), GOLDEN_PLAYER_IDS.sentinel)
}
