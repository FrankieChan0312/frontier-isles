import type { GameState } from '../model/game-state.ts'
import type { EdgeId, PlayerId, VertexId } from '../model/ids.ts'
import { STANDARD_ROAD_COST } from '../model/standard-build-costs.ts'
import { GOLDEN_PLAYER_IDS } from '../engine/task-05-golden-fixture.test-helper.ts'
import { createGoldenPaidBuildingStart } from '../engine/task-08-paid-building.test-helper.ts'
import { validateCityUpgrade } from './city-upgrade-rules.ts'
import {
  classifyPaidRoadConnection,
  validatePaidRoadPlacement,
} from './paid-road-rules.ts'
import { validatePaidSettlementPlacement } from './paid-settlement-rules.ts'
import { derivePlayerPieceCounts } from './player-piece-counts.ts'
import { canAffordResourceCost, payResourceCostToBank } from './resource-payment.ts'

const FIRST_EDGE = 'edge:vertex:-1,-1,2|vertex:1,-2,1' as EdgeId
const SECOND_EDGE = 'edge:vertex:1,-2,1|vertex:2,-1,-1' as EdgeId
const TARGET_EDGE = 'edge:vertex:2,-1,-1|vertex:4,-2,-2' as EdgeId
const REMOTE_CONNECTOR = 'edge:vertex:4,-2,-2|vertex:5,-1,-4' as EdgeId
const TARGET_VERTEX = 'vertex:2,-1,-1' as VertexId

function withRoads(state: GameState, roads: Readonly<Record<string, PlayerId>>): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      edgeOccupancy: {
        ...state.board.edgeOccupancy,
        ...Object.fromEntries(Object.entries(roads).map(([edgeId, ownerId]) => [edgeId, { ownerId }])),
      },
    },
  }
}

describe('paid-building rules', () => {
  it('derives all piece counts exclusively from board occupancy', () => {
    const state = createGoldenPaidBuildingStart()
    expect(derivePlayerPieceCounts(state.board, GOLDEN_PLAYER_IDS.sentinel)).toEqual({
      roads: 2,
      settlements: 2,
      cities: 0,
    })
    const upgraded: GameState = {
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          ['vertex:-1,-1,2' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel },
        },
      },
    }
    expect(derivePlayerPieceCounts(upgraded.board, GOLDEN_PLAYER_IDS.sentinel)).toEqual({
      roads: 2,
      settlements: 1,
      cities: 1,
    })
  })

  it('classifies own-building and empty-intersection road connections', () => {
    const state = createGoldenPaidBuildingStart()
    expect(classifyPaidRoadConnection(state, GOLDEN_PLAYER_IDS.sentinel, FIRST_EDGE)).toBe('CONNECTED')
    const cityState: GameState = {
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          ['vertex:-1,-1,2' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel },
        },
      },
    }
    expect(classifyPaidRoadConnection(cityState, GOLDEN_PLAYER_IDS.sentinel, FIRST_EDGE)).toBe('CONNECTED')
    const continued = withRoads(state, { [FIRST_EDGE]: GOLDEN_PLAYER_IDS.sentinel })
    expect(classifyPaidRoadConnection(continued, GOLDEN_PLAYER_IDS.sentinel, SECOND_EDGE)).toBe('CONNECTED')
  })

  it('distinguishes blocked from disconnected and lets either legal endpoint win', () => {
    const base = createGoldenPaidBuildingStart()
    expect(classifyPaidRoadConnection(base, GOLDEN_PLAYER_IDS.sentinel, TARGET_EDGE)).toBe('DISCONNECTED')

    const connected = withRoads(base, {
      [FIRST_EDGE]: GOLDEN_PLAYER_IDS.sentinel,
      [SECOND_EDGE]: GOLDEN_PLAYER_IDS.sentinel,
    })
    const blocked: GameState = {
      ...connected,
      board: {
        ...connected.board,
        vertexOccupancy: {
          ...connected.board.vertexOccupancy,
          [TARGET_VERTEX]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.human },
        },
      },
    }
    expect(classifyPaidRoadConnection(blocked, GOLDEN_PLAYER_IDS.sentinel, TARGET_EDGE)).toBe('BLOCKED')
    expect(validatePaidRoadPlacement(blocked, GOLDEN_PLAYER_IDS.sentinel, TARGET_EDGE)?.code).toBe('ROAD_BLOCKED')

    const legalOtherEndpoint = withRoads(blocked, {
      [REMOTE_CONNECTOR]: GOLDEN_PLAYER_IDS.sentinel,
    })
    expect(classifyPaidRoadConnection(legalOtherEndpoint, GOLDEN_PLAYER_IDS.sentinel, TARGET_EDGE)).toBe('CONNECTED')
  })

  it('does not treat an opponent road at an empty intersection as connecting or blocking', () => {
    const state = withRoads(createGoldenPaidBuildingStart(), {
      [SECOND_EDGE]: GOLDEN_PLAYER_IDS.human,
    })
    expect(classifyPaidRoadConnection(state, GOLDEN_PLAYER_IDS.sentinel, TARGET_EDGE)).toBe('DISCONNECTED')
    expect(validatePaidRoadPlacement(state, GOLDEN_PLAYER_IDS.sentinel, TARGET_EDGE)?.code).toBe('ROAD_NOT_CONNECTED')
  })

  it('applies exact road target and affordability precedence', () => {
    const base = createGoldenPaidBuildingStart()
    const poor: GameState = {
      ...base,
      players: {
        ...base.players,
        [GOLDEN_PLAYER_IDS.sentinel]: {
          ...base.players[GOLDEN_PLAYER_IDS.sentinel],
          resources: { LUMBER: 0, BRICK: 0, WOOL: 1, GRAIN: 3, ORE: 3 },
        },
      },
      bank: {
        ...base.bank,
        resources: { ...base.bank.resources, LUMBER: 19, BRICK: 14 },
      },
    }
    expect(validatePaidRoadPlacement(poor, GOLDEN_PLAYER_IDS.sentinel, 'edge:unknown' as EdgeId)?.code).toBe('ILLEGAL_EDGE')
    expect(validatePaidRoadPlacement(poor, GOLDEN_PLAYER_IDS.sentinel, TARGET_EDGE)?.code).toBe('ROAD_NOT_CONNECTED')
    expect(validatePaidRoadPlacement(poor, GOLDEN_PLAYER_IDS.sentinel, FIRST_EDGE)?.code).toBe('INSUFFICIENT_RESOURCES')
  })

  it('validates paid settlement occupancy, distance, connection, and city ownership', () => {
    const base = createGoldenPaidBuildingStart()
    expect(validatePaidSettlementPlacement(base, GOLDEN_PLAYER_IDS.sentinel, 'vertex:unknown' as VertexId)?.code).toBe('ILLEGAL_VERTEX')
    expect(validatePaidSettlementPlacement(base, GOLDEN_PLAYER_IDS.sentinel, 'vertex:1,-2,1' as VertexId)?.code).toBe('DISTANCE_RULE_VIOLATION')
    expect(validatePaidSettlementPlacement(base, GOLDEN_PLAYER_IDS.sentinel, TARGET_VERTEX)?.code).toBe('ROAD_NOT_CONNECTED')

    const connected = withRoads(base, {
      [FIRST_EDGE]: GOLDEN_PLAYER_IDS.sentinel,
      [SECOND_EDGE]: GOLDEN_PLAYER_IDS.sentinel,
    })
    expect(validatePaidSettlementPlacement(connected, GOLDEN_PLAYER_IDS.sentinel, TARGET_VERTEX)).toBeNull()
    expect(validateCityUpgrade(connected, GOLDEN_PLAYER_IDS.sentinel, TARGET_VERTEX)?.code).toBe('ILLEGAL_VERTEX')
    expect(validateCityUpgrade(base, GOLDEN_PLAYER_IDS.sentinel, 'vertex:-1,-4,5' as VertexId)?.code).toBe('ILLEGAL_VERTEX')
    expect(validateCityUpgrade(base, GOLDEN_PLAYER_IDS.sentinel, 'vertex:-1,-1,2' as VertexId)).toBeNull()
  })

  it('pays exact costs immutably from player to bank', () => {
    const player = { LUMBER: 1, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 }
    const bank = { LUMBER: 18, BRICK: 18, WOOL: 19, GRAIN: 19, ORE: 19 }
    expect(canAffordResourceCost(player, STANDARD_ROAD_COST)).toBe(true)
    const payment = payResourceCostToBank(player, bank, STANDARD_ROAD_COST)
    expect(payment).toEqual({
      playerResources: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
      bankResources: { LUMBER: 19, BRICK: 19, WOOL: 19, GRAIN: 19, ORE: 19 },
    })
    expect(player).toEqual({ LUMBER: 1, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 })
    expect(bank).toEqual({ LUMBER: 18, BRICK: 18, WOOL: 19, GRAIN: 19, ORE: 19 })
  })
})
