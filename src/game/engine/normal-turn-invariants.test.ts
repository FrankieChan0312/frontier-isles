import type { GameState } from '../model/game-state.ts'
import type { PlayerId, VertexId } from '../model/ids.ts'
import { RULESET_ID } from '../model/ruleset.ts'
import { assertNormalTurnState } from './normal-turn-invariants.ts'
import {
  createCompletedGoldenSetup,
  GOLDEN_PLAYER_IDS,
} from './task-05-golden-fixture.test-helper.ts'

function actionState(): GameState {
  const state = createCompletedGoldenSetup()
  return {
    ...state,
    turn: {
      ...state.turn,
      phase: 'ACTION',
      lastRoll: { dice: [3, 2], total: 5 },
    },
  }
}

describe('normal-turn invariants', () => {
  it('accepts valid roll, action, discard, robber-move, and game-over states without mutation', () => {
    const roll = createCompletedGoldenSetup()
    const action = actionState()
    const discard: GameState = {
      ...roll,
      turn: { ...roll.turn, phase: 'DISCARD_REQUIRED', lastRoll: { dice: [6, 1], total: 7 } },
      pendingDecision: {
        type: 'DISCARD_RESOURCES',
        triggeringPlayerId: GOLDEN_PLAYER_IDS.sentinel,
        requiredCountByPlayer: { [GOLDEN_PLAYER_IDS.sentinel]: 4 },
        completedPlayerIds: [],
      },
    }
    const robber: GameState = {
      ...roll,
      turn: { ...roll.turn, phase: 'ROBBER_MOVE_REQUIRED', lastRoll: { dice: [6, 1], total: 7 } },
      pendingDecision: {
        type: 'MOVE_ROBBER',
        actingPlayerId: GOLDEN_PLAYER_IDS.sentinel,
        cause: { type: 'DICE_SEVEN' },
      },
    }
    const gameOver: GameState = {
      ...action,
      turn: { ...action.turn, phase: 'GAME_OVER' },
      winnerId: GOLDEN_PLAYER_IDS.sentinel,
    }
    for (const state of [roll, action, discard, robber, gameOver]) {
      const snapshot = structuredClone(state)
      expect(() => assertNormalTurnState(state)).not.toThrow()
      expect(state).toEqual(snapshot)
    }
  })

  it('rejects schema, ruleset, version, player-order, current-player, and turn-number corruption', () => {
    const state = createCompletedGoldenSetup()
    expect(() => assertNormalTurnState({ ...state, schemaVersion: 2 } as unknown as GameState)).toThrow(/schema/)
    expect(() => assertNormalTurnState({ ...state, rulesetId: `${RULESET_ID}:other` } as unknown as GameState)).toThrow(/ruleset/)
    expect(() => assertNormalTurnState({ ...state, stateVersion: -1 })).toThrow(/stateVersion/)
    expect(() => assertNormalTurnState({
      ...state,
      playerOrder: [
        GOLDEN_PLAYER_IDS.sentinel,
        GOLDEN_PLAYER_IDS.sentinel,
        GOLDEN_PLAYER_IDS.merchant,
        GOLDEN_PLAYER_IDS.builder,
      ],
    })).toThrow(/playerOrder/)
    expect(() => assertNormalTurnState({
      ...state,
      turn: { ...state.turn, currentPlayerId: 'player:unknown' as PlayerId },
    })).toThrow(/current player/)
    expect(() => assertNormalTurnState({
      ...state,
      turn: { ...state.turn, turnNumber: 0 },
    })).toThrow(/turnNumber/)
  })

  it('rejects normal phases with setup or impossible last-roll semantics', () => {
    const roll = createCompletedGoldenSetup()
    expect(() => assertNormalTurnState({
      ...roll,
      turn: {
        ...roll.turn,
        setup: { round: 1, placementIndex: 0, pendingSettlementVertexId: null },
      },
    })).toThrow(/setup state/)
    expect(() => assertNormalTurnState({
      ...roll,
      turn: { ...roll.turn, lastRoll: { dice: [3, 2], total: 5 } },
    })).toThrow(/null lastRoll/)
    const action = actionState()
    expect(() => assertNormalTurnState({
      ...action,
      turn: { ...action.turn, lastRoll: null },
    })).toThrow(/requires lastRoll/)
    expect(() => assertNormalTurnState({
      ...action,
      turn: { ...action.turn, lastRoll: { dice: [6, 1], total: 7 } },
    })).toThrow(/total-seven/)
    expect(() => assertNormalTurnState({
      ...action,
      turn: { ...action.turn, lastRoll: { dice: [6, 6], total: 5 } },
    } as unknown as GameState)).toThrow(/total must equal/)
  })

  it('rejects missing or malformed seven pending decisions and unknown pending players', () => {
    const state = createCompletedGoldenSetup()
    const sevenTurn = {
      ...state.turn,
      phase: 'DISCARD_REQUIRED' as const,
      lastRoll: { dice: [6, 1] as const, total: 7 as const },
    }
    expect(() => assertNormalTurnState({ ...state, turn: sevenTurn })).toThrow(/DISCARD_RESOURCES/)
    expect(() => assertNormalTurnState({
      ...state,
      turn: sevenTurn,
      pendingDecision: {
        type: 'DISCARD_RESOURCES',
        triggeringPlayerId: GOLDEN_PLAYER_IDS.sentinel,
        requiredCountByPlayer: { ['player:unknown' as PlayerId]: 4 },
        completedPlayerIds: [],
      },
    })).toThrow(/unknown player/)
    expect(() => assertNormalTurnState({
      ...state,
      turn: { ...sevenTurn, phase: 'ROBBER_MOVE_REQUIRED' },
      pendingDecision: {
        type: 'MOVE_ROBBER',
        actingPlayerId: 'player:unknown' as PlayerId,
        cause: { type: 'DICE_SEVEN' },
      },
    })).toThrow(/unknown player/)
  })

  it('rejects invalid resources, occupancy owners, tile content, random state, and winner semantics', () => {
    const state = createCompletedGoldenSetup()
    expect(() => assertNormalTurnState({
      ...state,
      bank: { ...state.bank, resources: { ...state.bank.resources, BRICK: -1 } },
    })).toThrow(/non-negative/)
    expect(() => assertNormalTurnState({
      ...state,
      players: {
        ...state.players,
        [GOLDEN_PLAYER_IDS.sentinel]: {
          ...state.players[GOLDEN_PLAYER_IDS.sentinel] as NonNullable<typeof state.players[typeof GOLDEN_PLAYER_IDS.sentinel]>,
          resources: { ...state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources as NonNullable<typeof state.players[typeof GOLDEN_PLAYER_IDS.sentinel]>['resources'], ORE: 1.5 },
        },
      },
    })).toThrow(/non-negative/)
    const vertexId = Object.keys(state.board.vertexOccupancy)[0] as VertexId
    expect(() => assertNormalTurnState({
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          [vertexId]: { type: 'SETTLEMENT', ownerId: 'player:unknown' as PlayerId },
        },
      },
    })).toThrow(/unknown player/)
    const desert = state.board.robberTileId
    expect(() => assertNormalTurnState({
      ...state,
      board: {
        ...state.board,
        tileContents: {
          ...state.board.tileContents,
          [desert]: { terrain: 'DESERT', numberToken: 8 },
        },
      },
    } as unknown as GameState)).toThrow(/desert/)
    expect(() => assertNormalTurnState({
      ...state,
      random: { ...state.random, state: 0 },
    })).toThrow(/random cursor/)
    expect(() => assertNormalTurnState({ ...state, winnerId: GOLDEN_PLAYER_IDS.sentinel })).toThrow(/outside GAME_OVER/)
    expect(() => assertNormalTurnState({
      ...state,
      turn: { ...state.turn, phase: 'GAME_OVER' },
    })).toThrow(/requires a winner/)
  })
})
