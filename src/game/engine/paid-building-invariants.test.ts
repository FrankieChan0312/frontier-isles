import type { GameState } from '../model/game-state.ts'
import type { EdgeId, PlayerId, VertexId } from '../model/ids.ts'
import type { ResourceBag } from '../model/resource.ts'
import { assertPaidBuildingState } from './paid-building-invariants.ts'
import { GOLDEN_PLAYER_IDS } from './task-05-golden-fixture.test-helper.ts'
import {
  createGoldenPaidBuildingStart,
  createResolvedSevenPaidBuildingStart,
} from './task-08-paid-building.test-helper.ts'

function replaceSentinelResources(state: GameState, resources: ResourceBag): GameState {
  const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
  if (sentinel === undefined) throw new Error('Missing Sentinel.')
  return {
    ...state,
    players: {
      ...state.players,
      [GOLDEN_PLAYER_IDS.sentinel]: { ...sentinel, resources },
    },
  }
}

describe('paid-building state invariants', () => {
  it('accepts valid ACTION, non-ACTION, and resolved-seven states without mutation', () => {
    const action = createGoldenPaidBuildingStart()
    const rollRequired: GameState = {
      ...action,
      turn: { ...action.turn, phase: 'ROLL_REQUIRED', lastRoll: null },
    }
    const seven = createResolvedSevenPaidBuildingStart()
    for (const state of [action, rollRequired, seven]) {
      const snapshot = structuredClone(state)
      expect(() => assertPaidBuildingState(state)).not.toThrow()
      expect(state).toEqual(snapshot)
    }
  })

  it('rejects invalid resource values, exact shapes, and conservation', () => {
    const state = createGoldenPaidBuildingStart()
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => assertPaidBuildingState(replaceSentinelResources(state, {
        ...state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources,
        LUMBER: value,
      } as ResourceBag))).toThrow(/non-negative safe integer/)
    }
    expect(() => assertPaidBuildingState(replaceSentinelResources(state, {
      ...state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources,
      GOLD: 0,
    } as unknown as ResourceBag))).toThrow(/exactly the five accepted resource keys/)
    expect(() => assertPaidBuildingState({
      ...state,
      bank: { ...state.bank, resources: { ...state.bank.resources, ORE: 18 } },
    })).toThrow(/total must equal 19/)
  })

  it('rejects unknown occupancy keys, owners, and malformed building/road shapes', () => {
    const state = createGoldenPaidBuildingStart()
    expect(() => assertPaidBuildingState({
      ...state,
      board: {
        ...state.board,
        edgeOccupancy: {
          ...state.board.edgeOccupancy,
          ['edge:unknown' as EdgeId]: null,
        },
      },
    })).toThrow(/key count|unknown ID/)
    expect(() => assertPaidBuildingState({
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          ['vertex:2,-1,-1' as VertexId]: {
            type: 'SETTLEMENT', ownerId: 'player:unknown' as PlayerId,
          },
        },
      },
    })).toThrow(/unknown player|owner is unknown/)
    expect(() => assertPaidBuildingState({
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          ['vertex:2,-1,-1' as VertexId]: {
            type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.sentinel, extra: true,
          } as unknown as GameState['board']['vertexOccupancy'][VertexId],
        },
      },
    })).toThrow(/building shape is malformed/)
    expect(() => assertPaidBuildingState({
      ...state,
      board: {
        ...state.board,
        edgeOccupancy: {
          ...state.board.edgeOccupancy,
          ['edge:vertex:-1,-1,2|vertex:1,-2,1' as EdgeId]: {
            ownerId: GOLDEN_PLAYER_IDS.sentinel, type: 'ROAD',
          } as unknown as GameState['board']['edgeOccupancy'][EdgeId],
        },
      },
    })).toThrow(/road shape is malformed/)
  })

  it('rejects occupancy beyond every physical-piece limit', () => {
    const state = createGoldenPaidBuildingStart()
    const emptyEdges = (Object.keys(state.board.edgeOccupancy) as EdgeId[])
      .filter((edgeId) => state.board.edgeOccupancy[edgeId] === null)
      .slice(0, 14)
    const tooManyRoads: GameState = {
      ...state,
      board: {
        ...state.board,
        edgeOccupancy: {
          ...state.board.edgeOccupancy,
          ...Object.fromEntries(emptyEdges.map((edgeId) => [edgeId, { ownerId: GOLDEN_PLAYER_IDS.sentinel }])),
        },
      },
    }
    expect(() => assertPaidBuildingState(tooManyRoads)).toThrow(/road-piece limit/)

    const emptyVertices = (Object.keys(state.board.vertexOccupancy) as VertexId[])
      .filter((vertexId) => state.board.vertexOccupancy[vertexId] === null)
    const tooManySettlements: GameState = {
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          ...Object.fromEntries(emptyVertices.slice(0, 4).map((vertexId) => [
            vertexId, { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.sentinel },
          ])),
        },
      },
    }
    expect(() => assertPaidBuildingState(tooManySettlements)).toThrow(/settlement-piece limit/)

    const tooManyCities: GameState = {
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          ...Object.fromEntries(emptyVertices.slice(0, 5).map((vertexId) => [
            vertexId, { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel },
          ])),
        },
      },
    }
    expect(() => assertPaidBuildingState(tooManyCities)).toThrow(/city-piece limit/)
  })

  it('preserves accepted winner, ACTION-pending, and robber-workflow corruption checks', () => {
    const state = createGoldenPaidBuildingStart()
    expect(() => assertPaidBuildingState({
      ...state,
      winnerId: GOLDEN_PLAYER_IDS.sentinel,
    })).toThrow(/winner must be null outside GAME_OVER/)
    expect(() => assertPaidBuildingState({
      ...state,
      pendingDecision: {
        type: 'MOVE_ROBBER', actingPlayerId: GOLDEN_PLAYER_IDS.sentinel, cause: { type: 'DICE_SEVEN' },
      },
    })).toThrow(/ACTION must not have a pending decision/)

    const seven = createResolvedSevenPaidBuildingStart()
    expect(() => assertPaidBuildingState({
      ...seven,
      turn: { ...seven.turn, phase: 'ROBBER_TARGET_REQUIRED' },
      pendingDecision: {
        type: 'CHOOSE_ROBBER_TARGET',
        actingPlayerId: GOLDEN_PLAYER_IDS.sentinel,
        selectedTileId: seven.board.robberTileId,
        eligibleTargetPlayerIds: [GOLDEN_PLAYER_IDS.human],
        cause: { type: 'DICE_SEVEN' },
      },
    })).toThrow(/target list must equal authoritative/)
  })
})
