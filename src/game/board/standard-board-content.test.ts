import type { PortKind, TerrainType, TileContent } from '../model/board-state.ts'
import type { NumberToken } from '../model/dice.ts'
import type { TileId } from '../model/ids.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import { createInitialRandomState, shuffleWithRandom } from '../random/seeded-random.ts'
import { deriveOrderedCoastlineEdgeIds } from './coastline.ts'
import { STANDARD_PORT_SLOT_EDGE_INDICES } from './port-slots.ts'
import {
  createStandardInitialBoard,
  selectFirstRedNumberTileIds,
  STANDARD_NON_RED_NUMBER_TOKENS,
  STANDARD_PORT_KIND_DISTRIBUTION,
  STANDARD_RED_NUMBER_TOKENS,
  STANDARD_TERRAIN_DISTRIBUTION,
} from './standard-board-content.ts'
import { compareCodeUnits, createPortId } from './topology-ids.ts'

const GOLDEN_SEED = 'FRONTIER-ISLES-TASK-04'

function sortedTileIdsByCoordinate(
  tileContents: Readonly<Record<TileId, TileContent>>,
  topology: ReturnType<typeof createStandardInitialBoard>['value']['topology'],
): readonly TileId[] {
  return (Object.keys(tileContents) as TileId[]).sort((leftId, rightId) => {
    const left = topology.tiles[leftId]
    const right = topology.tiles[rightId]
    if (left === undefined || right === undefined) {
      throw new Error('Test fixture references unknown tile content.')
    }
    return (
      left.coordinate.q - right.coordinate.q ||
      left.coordinate.r - right.coordinate.r ||
      compareCodeUnits(leftId, rightId)
    )
  })
}

function countValues<T extends string | number>(values: readonly T[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const value of values) {
    counts[String(value)] = (counts[String(value)] ?? 0) + 1
  }
  return counts
}

function portKindText(kind: PortKind): string {
  return kind.type === 'GENERIC' ? 'GENERIC' : `RESOURCE ${kind.resource}`
}

function contentSnapshot(seed: string): string {
  const board = createStandardInitialBoard(createInitialRandomState(seed)).value
  return sortedTileIdsByCoordinate(board.tileContents, board.topology)
    .map((tileId) => {
      const content = board.tileContents[tileId]
      return `${tileId}:${content?.terrain}:${content?.numberToken ?? 'null'}`
    })
    .join('|')
}

describe('standard board content', () => {
  it('exports the exact frozen source distributions and counts', () => {
    expect(STANDARD_TERRAIN_DISTRIBUTION).toEqual([
      'FOREST', 'FOREST', 'FOREST', 'FOREST',
      'HILLS', 'HILLS', 'HILLS',
      'PASTURE', 'PASTURE', 'PASTURE', 'PASTURE',
      'FIELDS', 'FIELDS', 'FIELDS', 'FIELDS',
      'MOUNTAINS', 'MOUNTAINS', 'MOUNTAINS',
      'DESERT',
    ])
    expect(countValues<TerrainType>(STANDARD_TERRAIN_DISTRIBUTION)).toEqual({
      FOREST: 4, HILLS: 3, PASTURE: 4, FIELDS: 4, MOUNTAINS: 3, DESERT: 1,
    })
    expect(STANDARD_RED_NUMBER_TOKENS).toEqual([6, 6, 8, 8])
    expect(STANDARD_NON_RED_NUMBER_TOKENS).toEqual([
      2, 3, 3, 4, 4, 5, 5, 9, 9, 10, 10, 11, 11, 12,
    ])
    expect(STANDARD_PORT_KIND_DISTRIBUTION.map(portKindText)).toEqual([
      'GENERIC', 'GENERIC', 'GENERIC', 'GENERIC',
      'RESOURCE LUMBER', 'RESOURCE BRICK', 'RESOURCE WOOL', 'RESOURCE GRAIN', 'RESOURCE ORE',
    ])
  })

  it('creates complete initial board contents, ports, and null occupancy', () => {
    const board = createStandardInitialBoard(createInitialRandomState('COMPLETE')).value

    expect(Object.keys(board.tileContents)).toHaveLength(19)
    expect(Object.keys(board.vertexOccupancy)).toHaveLength(54)
    expect(Object.values(board.vertexOccupancy).every((value) => value === null)).toBe(true)
    expect(Object.keys(board.edgeOccupancy)).toHaveLength(72)
    expect(Object.values(board.edgeOccupancy).every((value) => value === null)).toBe(true)
    expect(Object.keys(board.topology.ports)).toHaveLength(9)

    const contents = Object.values(board.tileContents)
    expect(countValues(contents.map((content) => content.terrain))).toEqual({
      FOREST: 4, HILLS: 3, PASTURE: 4, FIELDS: 4, MOUNTAINS: 3, DESERT: 1,
    })
    expect(
      countValues(
        contents
          .map((content) => content.numberToken)
          .filter((token): token is NumberToken => token !== null),
      ),
    ).toEqual({ 2: 1, 3: 2, 4: 2, 5: 2, 6: 2, 8: 2, 9: 2, 10: 2, 11: 2, 12: 1 })

    const portKinds = Object.values(board.topology.ports).map((port) => port.kind)
    expect(portKinds.filter((kind) => kind.type === 'GENERIC')).toHaveLength(4)
    for (const resource of RESOURCE_TYPES) {
      expect(
        portKinds.filter((kind) => kind.type === 'RESOURCE' && kind.resource === resource),
      ).toHaveLength(1)
    }
  })

  it('places the robber on the unnumbered desert and keeps all red tiles non-adjacent', () => {
    const board = createStandardInitialBoard(createInitialRandomState('RED-INVARIANTS')).value
    const desertEntries = Object.entries(board.tileContents).filter(
      ([, content]) => content.terrain === 'DESERT',
    )
    const redTileIds = new Set(
      (Object.entries(board.tileContents) as [TileId, TileContent][])
        .filter(([, content]) => content.numberToken === 6 || content.numberToken === 8)
        .map(([tileId]) => tileId),
    )

    expect(desertEntries).toHaveLength(1)
    expect(desertEntries[0]?.[0]).toBe(board.robberTileId)
    expect(desertEntries[0]?.[1].numberToken).toBeNull()
    expect(redTileIds.size).toBe(4)
    for (const edge of Object.values(board.topology.edges)) {
      if (edge.tileIds.length === 2) {
        expect(edge.tileIds.every((tileId) => redTileIds.has(tileId))).toBe(false)
      }
    }
  })

  it('is deterministic, immutable, and returns independent plain object graphs', () => {
    const initial = createInitialRandomState('INDEPENDENCE')
    const initialSnapshot = structuredClone(initial)
    const distributionsSnapshot = JSON.stringify({
      terrains: STANDARD_TERRAIN_DISTRIBUTION,
      red: STANDARD_RED_NUMBER_TOKENS,
      nonRed: STANDARD_NON_RED_NUMBER_TOKENS,
      ports: STANDARD_PORT_KIND_DISTRIBUTION,
    })
    const first = createStandardInitialBoard(initial)
    const second = createStandardInitialBoard(initial)

    expect(first).toEqual(second)
    expect(first.value).not.toBe(second.value)
    expect(first.value.topology).not.toBe(second.value.topology)
    expect(first.value.tileContents).not.toBe(second.value.tileContents)
    expect(first.value.topology.tiles['tile:0,0' as TileId]?.vertexIds).not.toBe(
      second.value.topology.tiles['tile:0,0' as TileId]?.vertexIds,
    )
    expect(initial).toEqual(initialSnapshot)
    expect(JSON.stringify({
      terrains: STANDARD_TERRAIN_DISTRIBUTION,
      red: STANDARD_RED_NUMBER_TOKENS,
      nonRed: STANDARD_NON_RED_NUMBER_TOKENS,
      ports: STANDARD_PORT_KIND_DISTRIBUTION,
    })).toBe(distributionsSnapshot)
    expect(() => JSON.stringify(first.value)).not.toThrow()
    expect(JSON.parse(JSON.stringify(first.value))).toEqual(first.value)
  })

  it('produces different valid board content for frozen different seeds', () => {
    expect(contentSnapshot('TASK04-DIFFERENT-A')).not.toBe(contentSnapshot('TASK04-DIFFERENT-B'))
  })

  it('matches the complete compact golden fixture and final random state', () => {
    const initial = createInitialRandomState(GOLDEN_SEED)
    const result = createStandardInitialBoard(initial)
    const board = result.value
    const coastline = deriveOrderedCoastlineEdgeIds(board.topology)
    const portOrder = STANDARD_PORT_SLOT_EDGE_INDICES.map((coastlineIndex) => {
      const edgeId = coastline[coastlineIndex]
      if (edgeId === undefined) {
        throw new Error(`Golden port slot ${coastlineIndex} is unavailable.`)
      }
      const port = board.topology.ports[createPortId(edgeId)]
      if (port === undefined) {
        throw new Error(`Golden port on ${edgeId} is unavailable.`)
      }
      return portKindText(port.kind)
    })
    const tiles = sortedTileIdsByCoordinate(board.tileContents, board.topology).map((tileId) => {
      const content = board.tileContents[tileId]
      return `${tileId} ${content?.terrain} ${content?.numberToken ?? 'null'}`
    })

    expect(initial).toEqual({
      algorithm: 'XORSHIFT32_V1', seed: GOLDEN_SEED, state: 1554738384, drawCount: 0,
    })
    expect(result.random).toEqual({
      algorithm: 'XORSHIFT32_V1', seed: GOLDEN_SEED, state: 2871825349, drawCount: 59,
    })
    expect(portOrder).toEqual([
      'RESOURCE ORE', 'RESOURCE LUMBER', 'RESOURCE BRICK', 'RESOURCE GRAIN',
      'GENERIC', 'RESOURCE WOOL', 'GENERIC', 'GENERIC', 'GENERIC',
    ])
    expect(tiles).toEqual([
      'tile:-2,0 MOUNTAINS 11',
      'tile:-2,1 FIELDS 6',
      'tile:-2,2 PASTURE 3',
      'tile:-1,-1 FOREST 8',
      'tile:-1,0 FIELDS 11',
      'tile:-1,1 FOREST 10',
      'tile:-1,2 FOREST 2',
      'tile:0,-2 PASTURE 3',
      'tile:0,-1 PASTURE 5',
      'tile:0,0 DESERT null',
      'tile:0,1 HILLS 4',
      'tile:0,2 FIELDS 5',
      'tile:1,-2 FIELDS 6',
      'tile:1,-1 HILLS 4',
      'tile:1,0 MOUNTAINS 10',
      'tile:1,1 PASTURE 9',
      'tile:2,-2 FOREST 12',
      'tile:2,-1 HILLS 8',
      'tile:2,0 MOUNTAINS 9',
    ])
    expect(board.robberTileId).toBe('tile:0,0')
  })

  it('selects and assigns the frozen golden red-number order constructively', () => {
    const initial = createInitialRandomState(GOLDEN_SEED)
    const ports = shuffleWithRandom(STANDARD_PORT_KIND_DISTRIBUTION, initial)
    const terrains = shuffleWithRandom(STANDARD_TERRAIN_DISTRIBUTION, ports.random)
    const board = createStandardInitialBoard(initial).value
    const sortedIds = sortedTileIdsByCoordinate(board.tileContents, board.topology)
    const nonDesertIds = sortedIds.filter(
      (tileId) => board.tileContents[tileId]?.terrain !== 'DESERT',
    )
    const candidates = shuffleWithRandom(nonDesertIds, terrains.random)
    const selected = selectFirstRedNumberTileIds(candidates.value, board.topology)
    const redValues = shuffleWithRandom(STANDARD_RED_NUMBER_TOKENS, candidates.random)

    expect(selected).toEqual(['tile:2,-1', 'tile:-2,1', 'tile:1,-2', 'tile:-1,-1'])
    expect(redValues.value).toEqual([8, 6, 6, 8])
  })

  it('covers every desert coordinate with the frozen TASK04-DESERT-0 through -54 corpus', () => {
    const desertTileIds = new Set<TileId>()
    for (let index = 0; index <= 54; index += 1) {
      const board = createStandardInitialBoard(
        createInitialRandomState(`TASK04-DESERT-${index}`),
      ).value
      desertTileIds.add(board.robberTileId)
    }

    expect(desertTileIds.size).toBe(19)
  })
})
