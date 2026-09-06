import type { GameState } from '../model/game-state.ts'
import type { PlayerId, TileId, VertexId } from '../model/ids.ts'
import {
  createCompletedGoldenSetup,
  GOLDEN_PLAYER_IDS,
} from '../engine/task-05-golden-fixture.test-helper.ts'
import { produceResourcesForRoll } from './resource-production.ts'

function clearedOccupancy(state: GameState): GameState['board']['vertexOccupancy'] {
  return Object.fromEntries(
    Object.keys(state.board.vertexOccupancy).map((vertexId) => [vertexId, null]),
  ) as GameState['board']['vertexOccupancy']
}

describe('normal resource production', () => {
  it('produces from every matching tile in tile/player order and aggregates one player per tile', () => {
    const state = createCompletedGoldenSetup()
    const result = produceResourcesForRoll(state, 8)

    expect(result.events).toEqual([
      { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.sentinel, tileId: 'tile:-1,1', resource: 'GRAIN', quantity: 1 },
      { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.human, tileId: 'tile:-1,1', resource: 'GRAIN', quantity: 1 },
      { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.builder, tileId: 'tile:0,-1', resource: 'GRAIN', quantity: 2 },
    ])
    expect(result.players[GOLDEN_PLAYER_IDS.sentinel]?.resources.GRAIN).toBe(1)
    expect(result.players[GOLDEN_PLAYER_IDS.human]?.resources.GRAIN).toBe(2)
    expect(result.players[GOLDEN_PLAYER_IDS.builder]?.resources.GRAIN).toBe(3)
    expect(result.bank.resources.GRAIN).toBe(13)
    expect(17 - result.bank.resources.GRAIN).toBe(4)
  })

  it('yields two for a city and aggregates it with another same-player building on that tile', () => {
    const state = createCompletedGoldenSetup()
    const tile = state.board.topology.tiles['tile:0,-1' as TileId]
    if (tile === undefined) throw new Error('Missing city-yield fixture tile.')
    const builderVertices = tile.vertexIds.filter(
      (vertexId) => state.board.vertexOccupancy[vertexId]?.ownerId === GOLDEN_PLAYER_IDS.builder,
    )
    const cityVertex = builderVertices[0]
    if (cityVertex === undefined || builderVertices.length !== 2) {
      throw new Error('Expected two Builder settlements around tile:0,-1.')
    }
    const cityState: GameState = {
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          [cityVertex]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.builder },
        },
      },
    }

    const result = produceResourcesForRoll(cityState, 8)
    expect(result.events).toContainEqual({
      type: 'RESOURCE_PRODUCED',
      playerId: GOLDEN_PLAYER_IDS.builder,
      tileId: 'tile:0,-1',
      resource: 'GRAIN',
      quantity: 3,
    })
  })

  it('keeps different tiles as separate events for the same player and resource', () => {
    const state = createCompletedGoldenSetup()
    const firstTile = state.board.topology.tiles['tile:-1,1' as TileId]
    const secondTile = state.board.topology.tiles['tile:0,-1' as TileId]
    if (firstTile === undefined || secondTile === undefined) throw new Error('Missing two-tile fixture.')
    const firstVertex = firstTile.vertexIds[0]
    const secondVertex = secondTile.vertexIds.find((vertexId) => vertexId !== firstVertex)
    if (secondVertex === undefined) throw new Error('Missing distinct second fixture vertex.')
    const occupancy = clearedOccupancy(state)
    const synthetic: GameState = {
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...occupancy,
          [firstVertex]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.sentinel },
          [secondVertex]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.sentinel },
        },
      },
    }

    const result = produceResourcesForRoll(synthetic, 8)
    expect(result.events).toEqual([
      { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.sentinel, tileId: 'tile:-1,1', resource: 'GRAIN', quantity: 1 },
      { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.sentinel, tileId: 'tile:0,-1', resource: 'GRAIN', quantity: 1 },
    ])
  })

  it('blocks the robber tile while another matching tile still produces', () => {
    const state = createCompletedGoldenSetup()
    const blocked: GameState = {
      ...state,
      board: { ...state.board, robberTileId: 'tile:-1,1' as TileId },
    }
    const result = produceResourcesForRoll(blocked, 8)
    expect(result.events).toEqual([
      { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.builder, tileId: 'tile:0,-1', resource: 'GRAIN', quantity: 2 },
    ])
  })

  it('blocks a short resource for every entitled player without transferring any cards', () => {
    const state = createCompletedGoldenSetup()
    const shortage: GameState = {
      ...state,
      bank: { ...state.bank, resources: { ...state.bank.resources, GRAIN: 3 } },
    }
    const result = produceResourcesForRoll(shortage, 8)
    expect(result.players).toBe(shortage.players)
    expect(result.bank).toBe(shortage.bank)
    expect(result.events).toEqual([{
      type: 'RESOURCE_PRODUCTION_BLOCKED',
      resource: 'GRAIN',
      affectedPlayerIds: [
        GOLDEN_PLAYER_IDS.sentinel,
        GOLDEN_PLAYER_IDS.human,
        GOLDEN_PLAYER_IDS.builder,
      ],
      reason: 'BANK_SHORTAGE',
    }])
  })

  it('allocates a single-player shortage partially in tile order and then reports it', () => {
    const state = createCompletedGoldenSetup()
    const shortage: GameState = {
      ...state,
      board: { ...state.board, robberTileId: 'tile:-1,1' as TileId },
      bank: { ...state.bank, resources: { ...state.bank.resources, GRAIN: 1 } },
    }
    const result = produceResourcesForRoll(shortage, 8)
    expect(result.bank.resources.GRAIN).toBe(0)
    expect(result.events).toEqual([
      { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.builder, tileId: 'tile:0,-1', resource: 'GRAIN', quantity: 1 },
      { type: 'RESOURCE_PRODUCTION_BLOCKED', resource: 'GRAIN', affectedPlayerIds: [GOLDEN_PLAYER_IDS.builder], reason: 'BANK_SHORTAGE' },
    ])
  })

  it('leaves bank and hands untouched when matching tiles have no demand', () => {
    const state = createCompletedGoldenSetup()
    const empty: GameState = {
      ...state,
      board: { ...state.board, vertexOccupancy: clearedOccupancy(state) },
    }
    const result = produceResourcesForRoll(empty, 8)
    expect(result.events).toEqual([])
    expect(result.players).toBe(empty.players)
    expect(result.bank).toBe(empty.bank)
  })

  it('orders all granted events before blocked events in RESOURCE_TYPES order', () => {
    const state = createCompletedGoldenSetup()
    const firstTileId = 'tile:-2,0' as TileId
    const secondTileId = 'tile:-2,1' as TileId
    const thirdTileId = 'tile:-2,2' as TileId
    const firstTile = state.board.topology.tiles[firstTileId]
    const secondTile = state.board.topology.tiles[secondTileId]
    const thirdTile = state.board.topology.tiles[thirdTileId]
    if (firstTile === undefined || secondTile === undefined || thirdTile === undefined) {
      throw new Error('Missing ordered resource fixture tiles.')
    }
    const exclusiveVertex = (tileId: TileId, vertexIds: readonly VertexId[]): VertexId => {
      const vertexId = vertexIds.find((candidate) => {
        const vertex = state.board.topology.vertices[candidate]
        return vertex?.tileIds.length === 1 && vertex.tileIds[0] === tileId
      })
      if (vertexId === undefined) throw new Error(`Missing exclusive vertex for ${tileId}.`)
      return vertexId
    }
    const oreVertex = exclusiveVertex(firstTileId, firstTile.vertexIds)
    const lumberVertex = exclusiveVertex(secondTileId, secondTile.vertexIds)
    const brickVertex = exclusiveVertex(thirdTileId, thirdTile.vertexIds)
    const synthetic: GameState = {
      ...state,
      board: {
        ...state.board,
        tileContents: {
          ...state.board.tileContents,
          [firstTileId]: { terrain: 'MOUNTAINS', numberToken: 2 },
          [secondTileId]: { terrain: 'FOREST', numberToken: 2 },
          [thirdTileId]: { terrain: 'HILLS', numberToken: 2 },
        },
        vertexOccupancy: {
          ...clearedOccupancy(state),
          [oreVertex]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.sentinel },
          [lumberVertex]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.human },
          [brickVertex]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.builder },
        },
      },
      bank: {
        ...state.bank,
        resources: { ...state.bank.resources, LUMBER: 0, BRICK: 0, ORE: 1 },
      },
    }
    const result = produceResourcesForRoll(synthetic, 2)
    expect(result.events).toEqual([
      { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.sentinel, tileId: firstTileId, resource: 'ORE', quantity: 1 },
      { type: 'RESOURCE_PRODUCTION_BLOCKED', resource: 'LUMBER', affectedPlayerIds: [GOLDEN_PLAYER_IDS.human], reason: 'BANK_SHORTAGE' },
      { type: 'RESOURCE_PRODUCTION_BLOCKED', resource: 'BRICK', affectedPlayerIds: [GOLDEN_PLAYER_IDS.builder], reason: 'BANK_SHORTAGE' },
    ])
  })

  it('rejects invalid counts, numbered desert, unknown owners, and total seven', () => {
    const state = createCompletedGoldenSetup()
    expect(() => produceResourcesForRoll({
      ...state,
      bank: { ...state.bank, resources: { ...state.bank.resources, ORE: -1 } },
    }, 8)).toThrow(/non-negative/)

    const desert = state.board.robberTileId
    expect(() => produceResourcesForRoll({
      ...state,
      board: {
        ...state.board,
        tileContents: {
          ...state.board.tileContents,
          [desert]: { terrain: 'DESERT', numberToken: 8 },
        },
      },
    } as unknown as GameState, 8)).toThrow(/desert/)

    const vertexId = Object.keys(state.board.vertexOccupancy)[0] as VertexId
    expect(() => produceResourcesForRoll({
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          [vertexId]: { type: 'SETTLEMENT', ownerId: 'player:unknown' as PlayerId },
        },
      },
    }, 8)).toThrow(/unknown owner/)
    expect(() => produceResourcesForRoll(state, 7 as never)).toThrow(/seven/)
  })
})
