import type { BoardState } from '../model/board-state.ts'
import type { EdgeId, PlayerId, VertexId } from '../model/ids.ts'
import { createGoldenPaidBuildingStart } from '../engine/task-08-paid-building.test-helper.ts'
import { GOLDEN_PLAYER_IDS } from '../engine/task-05-golden-fixture.test-helper.ts'
import { deriveLongestRoadLength } from './longest-road.ts'

const FIVE_EDGE_CHAIN: readonly EdgeId[] = [
  'edge:vertex:-1,-1,2|vertex:-2,1,1',
  'edge:vertex:-1,2,-1|vertex:-2,1,1',
  'edge:vertex:-1,2,-1|vertex:1,1,-2',
  'edge:vertex:1,1,-2|vertex:2,-1,-1',
  'edge:vertex:1,-2,1|vertex:2,-1,-1',
].map((edgeId) => edgeId as EdgeId)

const CENTRAL_LOOP: readonly EdgeId[] = [
  'edge:vertex:1,1,-2|vertex:2,-1,-1',
  'edge:vertex:-1,2,-1|vertex:1,1,-2',
  'edge:vertex:-1,2,-1|vertex:-2,1,1',
  'edge:vertex:-1,-1,2|vertex:-2,1,1',
  'edge:vertex:-1,-1,2|vertex:1,-2,1',
  'edge:vertex:1,-2,1|vertex:2,-1,-1',
].map((edgeId) => edgeId as EdgeId)

const Y_NETWORK: readonly EdgeId[] = [
  'edge:vertex:-1,2,-1|vertex:-2,1,1',
  'edge:vertex:-1,-1,2|vertex:-2,1,1',
  'edge:vertex:-1,2,-1|vertex:1,1,-2',
  'edge:vertex:1,1,-2|vertex:2,2,-4',
  'edge:vertex:-1,2,-1|vertex:-2,4,-2',
  'edge:vertex:-1,5,-4|vertex:-2,4,-2',
].map((edgeId) => edgeId as EdgeId)

function emptyBoard(): BoardState {
  const source = createGoldenPaidBuildingStart().board
  return {
    ...source,
    vertexOccupancy: Object.fromEntries(
      Object.keys(source.vertexOccupancy).map((vertexId) => [vertexId, null]),
    ) as BoardState['vertexOccupancy'],
    edgeOccupancy: Object.fromEntries(
      Object.keys(source.edgeOccupancy).map((edgeId) => [edgeId, null]),
    ) as BoardState['edgeOccupancy'],
  }
}

function withRoads(board: BoardState, edgeIds: readonly EdgeId[], playerId: PlayerId): BoardState {
  return {
    ...board,
    edgeOccupancy: {
      ...board.edgeOccupancy,
      ...Object.fromEntries(edgeIds.map((edgeId) => [edgeId, { ownerId: playerId }])),
    },
  }
}

describe('deriveLongestRoadLength', () => {
  it('returns zero without roads and ignores unknown players', () => {
    const board = emptyBoard()
    expect(deriveLongestRoadLength(board, GOLDEN_PLAYER_IDS.sentinel)).toBe(0)
    expect(deriveLongestRoadLength(board, 'player:unknown' as PlayerId)).toBe(0)
  })

  it('uses only the longest disconnected edge trail', () => {
    const board = withRoads(emptyBoard(), [
      ...FIVE_EDGE_CHAIN.slice(0, 3),
      'edge:vertex:-1,-7,8|vertex:-2,-5,7' as EdgeId,
      'edge:vertex:-2,-5,7|vertex:-4,-4,8' as EdgeId,
    ], GOLDEN_PLAYER_IDS.sentinel)
    expect(deriveLongestRoadLength(board, GOLDEN_PLAYER_IDS.sentinel)).toBe(3)
  })

  it('calculates the frozen five-edge chain and never reuses an edge', () => {
    expect(deriveLongestRoadLength(
      withRoads(emptyBoard(), FIVE_EDGE_CHAIN, GOLDEN_PLAYER_IDS.sentinel),
      GOLDEN_PLAYER_IDS.sentinel,
    )).toBe(5)
  })

  it('calculates the central six-edge loop as six', () => {
    expect(deriveLongestRoadLength(
      withRoads(emptyBoard(), CENTRAL_LOOP, GOLDEN_PLAYER_IDS.sentinel),
      GOLDEN_PLAYER_IDS.sentinel,
    )).toBe(6)
  })

  it('takes two arms of a six-road Y branch, not the total road count', () => {
    expect(deriveLongestRoadLength(
      withRoads(emptyBoard(), Y_NETWORK, GOLDEN_PLAYER_IDS.sentinel),
      GOLDEN_PLAYER_IDS.sentinel,
    )).toBe(4)
  })

  it('stops through an opponent building but continues through the owner building', () => {
    const chain = withRoads(emptyBoard(), FIVE_EDGE_CHAIN, GOLDEN_PLAYER_IDS.sentinel)
    const interrupted: BoardState = {
      ...chain,
      vertexOccupancy: {
        ...chain.vertexOccupancy,
        ['vertex:-1,2,-1' as VertexId]: {
          type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.human,
        },
      },
    }
    expect(deriveLongestRoadLength(interrupted, GOLDEN_PLAYER_IDS.sentinel)).toBe(3)
    const ownBuilding: BoardState = {
      ...interrupted,
      vertexOccupancy: {
        ...interrupted.vertexOccupancy,
        ['vertex:-1,2,-1' as VertexId]: {
          type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel,
        },
      },
    }
    expect(deriveLongestRoadLength(ownBuilding, GOLDEN_PLAYER_IDS.sentinel)).toBe(5)
  })

  it('is deterministic and does not mutate its board input', () => {
    const board = withRoads(emptyBoard(), CENTRAL_LOOP, GOLDEN_PLAYER_IDS.sentinel)
    const snapshot = structuredClone(board)
    expect(deriveLongestRoadLength(board, GOLDEN_PLAYER_IDS.sentinel)).toBe(6)
    expect(deriveLongestRoadLength(board, GOLDEN_PLAYER_IDS.sentinel)).toBe(6)
    expect(board).toEqual(snapshot)
  })
})
