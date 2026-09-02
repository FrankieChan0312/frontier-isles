import type {
  BoardState,
  BoardTopology,
  PortKind,
  TerrainType,
  TileContent,
  TileDefinition,
} from '../model/board-state.ts'
import type { NumberToken } from '../model/dice.ts'
import type { RandomState } from '../model/game-state.ts'
import type { EdgeId, TileId, VertexId } from '../model/ids.ts'
import { BOARD_GENERATOR_VERSION } from '../model/ruleset.ts'
import {
  shuffleWithRandom,
  type RandomResult,
} from '../random/seeded-random.ts'
import { assertStandardInitialBoard } from './initial-board-invariants.ts'
import type { NinePortKinds } from './port-slots.ts'
import { createStandardBoardTopology } from './standard-board-topology.ts'
import { compareCodeUnits } from './topology-ids.ts'

export const STANDARD_TERRAIN_DISTRIBUTION = [
  'FOREST',
  'FOREST',
  'FOREST',
  'FOREST',
  'HILLS',
  'HILLS',
  'HILLS',
  'PASTURE',
  'PASTURE',
  'PASTURE',
  'PASTURE',
  'FIELDS',
  'FIELDS',
  'FIELDS',
  'FIELDS',
  'MOUNTAINS',
  'MOUNTAINS',
  'MOUNTAINS',
  'DESERT',
] as const satisfies readonly TerrainType[]

export const STANDARD_RED_NUMBER_TOKENS = [6, 6, 8, 8] as const satisfies readonly NumberToken[]

export const STANDARD_NON_RED_NUMBER_TOKENS = [
  2,
  3,
  3,
  4,
  4,
  5,
  5,
  9,
  9,
  10,
  10,
  11,
  11,
  12,
] as const satisfies readonly NumberToken[]

export const STANDARD_PORT_KIND_DISTRIBUTION: NinePortKinds = [
  { type: 'GENERIC' },
  { type: 'GENERIC' },
  { type: 'GENERIC' },
  { type: 'GENERIC' },
  { type: 'RESOURCE', resource: 'LUMBER' },
  { type: 'RESOURCE', resource: 'BRICK' },
  { type: 'RESOURCE', resource: 'WOOL' },
  { type: 'RESOURCE', resource: 'GRAIN' },
  { type: 'RESOURCE', resource: 'ORE' },
]

function asNinePortKinds(portKinds: readonly PortKind[]): NinePortKinds {
  const [first, second, third, fourth, fifth, sixth, seventh, eighth, ninth] = portKinds
  if (
    portKinds.length !== 9 ||
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined ||
    fifth === undefined ||
    sixth === undefined ||
    seventh === undefined ||
    eighth === undefined ||
    ninth === undefined
  ) {
    throw new Error(`Standard board content requires exactly nine shuffled port kinds.`)
  }
  return [first, second, third, fourth, fifth, sixth, seventh, eighth, ninth]
}

function sortedTiles(topology: BoardTopology): readonly TileDefinition[] {
  return (Object.keys(topology.tiles) as TileId[])
    .map((tileId) => topology.tiles[tileId])
    .filter((tile): tile is TileDefinition => tile !== undefined)
    .sort(
      (left, right) =>
        left.coordinate.q - right.coordinate.q ||
        left.coordinate.r - right.coordinate.r ||
        compareCodeUnits(left.id, right.id),
    )
}

function createTileAdjacency(topology: BoardTopology): ReadonlyMap<TileId, ReadonlySet<TileId>> {
  const adjacency = new Map<TileId, Set<TileId>>()
  for (const tileId of Object.keys(topology.tiles) as TileId[]) {
    adjacency.set(tileId, new Set())
  }

  for (const edge of Object.values(topology.edges)) {
    if (edge.tileIds.length !== 2) {
      continue
    }
    const [left, right] = edge.tileIds
    if (left === undefined || right === undefined) {
      throw new Error(`Interior edge ${edge.id} is missing an adjacent tile.`)
    }
    adjacency.get(left)?.add(right)
    adjacency.get(right)?.add(left)
  }

  return adjacency
}

export function selectFirstRedNumberTileIds(
  candidateIds: readonly TileId[],
  topology: BoardTopology,
): readonly [TileId, TileId, TileId, TileId] {
  const adjacency = createTileAdjacency(topology)

  function search(startIndex: number, selected: TileId[]): readonly TileId[] | null {
    if (selected.length === 4) {
      return [...selected]
    }

    for (let index = startIndex; index < candidateIds.length; index += 1) {
      const candidate = candidateIds[index]
      if (candidate === undefined || topology.tiles[candidate] === undefined) {
        throw new Error(`Red-number candidate index ${index} does not reference a known tile.`)
      }
      if (selected.some((selectedId) => adjacency.get(candidate)?.has(selectedId) === true)) {
        continue
      }

      selected.push(candidate)
      const result = search(index + 1, selected)
      if (result !== null) {
        return result
      }
      selected.pop()
    }

    return null
  }

  const selected = search(0, [])
  const [first, second, third, fourth] = selected ?? []
  if (
    selected === null ||
    selected.length !== 4 ||
    first === undefined ||
    second === undefined ||
    third === undefined ||
    fourth === undefined
  ) {
    throw new Error('Standard board content could not find four pairwise non-adjacent red tiles.')
  }

  return [first, second, third, fourth]
}

function createNullRecord<TId extends string>(ids: readonly TId[]): Record<TId, null> {
  const record = {} as Record<TId, null>
  for (const id of ids) {
    record[id] = null
  }
  return record
}

function requireItem<T>(items: readonly T[], index: number, context: string): T {
  const item = items[index]
  if (item === undefined) {
    throw new Error(`${context} is missing item at index ${index}.`)
  }
  return item
}

export function createStandardInitialBoard(random: RandomState): RandomResult<BoardState> {
  const shuffledPorts = shuffleWithRandom(STANDARD_PORT_KIND_DISTRIBUTION, random)
  const topology = createStandardBoardTopology(asNinePortKinds(shuffledPorts.value))
  const tiles = sortedTiles(topology)

  const shuffledTerrains = shuffleWithRandom(
    STANDARD_TERRAIN_DISTRIBUTION,
    shuffledPorts.random,
  )
  const terrainByTileId = new Map<TileId, TerrainType>()
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = requireItem(tiles, index, 'Sorted standard tiles')
    const terrain = requireItem(shuffledTerrains.value, index, 'Shuffled terrain distribution')
    terrainByTileId.set(tile.id, terrain)
  }

  const desertTile = tiles.find((tile) => terrainByTileId.get(tile.id) === 'DESERT')
  if (desertTile === undefined) {
    throw new Error('Standard board content did not assign exactly one resolvable desert tile.')
  }
  const nonDesertTileIds = tiles
    .filter((tile) => tile.id !== desertTile.id)
    .map((tile) => tile.id)

  const shuffledCandidates = shuffleWithRandom(nonDesertTileIds, shuffledTerrains.random)
  const redTileIds = selectFirstRedNumberTileIds(shuffledCandidates.value, topology)
  const shuffledRedTokens = shuffleWithRandom(STANDARD_RED_NUMBER_TOKENS, shuffledCandidates.random)
  const redTokenByTileId = new Map<TileId, NumberToken>()
  for (let index = 0; index < redTileIds.length; index += 1) {
    redTokenByTileId.set(
      requireItem(redTileIds, index, 'Selected red-number tiles'),
      requireItem(shuffledRedTokens.value, index, 'Shuffled red-number tokens'),
    )
  }

  const shuffledNonRedTokens = shuffleWithRandom(
    STANDARD_NON_RED_NUMBER_TOKENS,
    shuffledRedTokens.random,
  )
  const redTileIdSet = new Set(redTileIds)
  const nonRedTileIds = nonDesertTileIds.filter((tileId) => !redTileIdSet.has(tileId))
  const nonRedTokenByTileId = new Map<TileId, NumberToken>()
  for (let index = 0; index < nonRedTileIds.length; index += 1) {
    nonRedTokenByTileId.set(
      requireItem(nonRedTileIds, index, 'Non-red standard tiles'),
      requireItem(shuffledNonRedTokens.value, index, 'Shuffled non-red number tokens'),
    )
  }

  const tileContents: Record<TileId, TileContent> = {}
  for (const tile of tiles) {
    const terrain = terrainByTileId.get(tile.id)
    if (terrain === undefined) {
      throw new Error(`Standard board tile ${tile.id} has no assigned terrain.`)
    }
    if (terrain === 'DESERT') {
      tileContents[tile.id] = { terrain, numberToken: null }
      continue
    }
    const numberToken = redTokenByTileId.get(tile.id) ?? nonRedTokenByTileId.get(tile.id)
    if (numberToken === undefined) {
      throw new Error(`Standard board non-desert tile ${tile.id} has no assigned number token.`)
    }
    tileContents[tile.id] = { terrain, numberToken }
  }

  const vertexIds = (Object.keys(topology.vertices) as VertexId[]).sort(compareCodeUnits)
  const edgeIds = (Object.keys(topology.edges) as EdgeId[]).sort(compareCodeUnits)
  const board: BoardState = {
    generatorVersion: BOARD_GENERATOR_VERSION,
    topology,
    tileContents,
    vertexOccupancy: createNullRecord(vertexIds),
    edgeOccupancy: createNullRecord(edgeIds),
    robberTileId: desertTile.id,
  }

  assertStandardInitialBoard(board)
  return { value: board, random: shuffledNonRedTokens.random }
}
