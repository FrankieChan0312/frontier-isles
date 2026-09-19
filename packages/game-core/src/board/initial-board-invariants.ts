import type { BoardState, TerrainType } from '../model/board-state.ts'
import type { NumberToken } from '../model/dice.ts'
import type { EdgeId, PortId, TileId, VertexId } from '../model/ids.ts'
import { RESOURCE_TYPES, type ResourceType } from '../model/resource.ts'
import { BOARD_GENERATOR_VERSION } from '../model/ruleset.ts'
import { compareCodeUnits } from './topology-ids.ts'
import { assertStandardBoardTopology } from './topology-invariants.ts'

const EXPECTED_TERRAIN_COUNTS: Readonly<Record<TerrainType, number>> = {
  FOREST: 4,
  HILLS: 3,
  PASTURE: 4,
  FIELDS: 4,
  MOUNTAINS: 3,
  DESERT: 1,
}

const EXPECTED_NUMBER_COUNTS: Readonly<Record<NumberToken, number>> = {
  2: 1,
  3: 2,
  4: 2,
  5: 2,
  6: 2,
  8: 2,
  9: 2,
  10: 2,
  11: 2,
  12: 1,
}

const NUMBER_TOKENS = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12] as const

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid initial standard board: ${message}`)
  }
}

function assertExactKeys(
  actualKeys: readonly string[],
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = [...actualKeys].sort(compareCodeUnits)
  const expected = [...expectedKeys].sort(compareCodeUnits)
  assertInvariant(
    actual.length === expected.length,
    `${label} must contain exactly ${expected.length} keys; found ${actual.length}.`,
  )
  for (let index = 0; index < expected.length; index += 1) {
    assertInvariant(
      actual[index] === expected[index],
      `${label} keys do not match the accepted topology at index ${index}.`,
    )
  }
}

function assertPlainJson(value: unknown, path: string, seen: Set<object>): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return
  }
  if (typeof value === 'number') {
    assertInvariant(Number.isFinite(value), `${path} contains a non-finite number.`)
    return
  }
  assertInvariant(typeof value === 'object', `${path} contains a non-JSON value.`)
  assertInvariant(!seen.has(value), `${path} contains a cyclic object reference.`)
  seen.add(value)

  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      assertPlainJson(value[index], `${path}[${index}]`, seen)
    }
  } else {
    const prototype = Object.getPrototypeOf(value)
    assertInvariant(
      prototype === Object.prototype || prototype === null,
      `${path} must contain plain objects only.`,
    )
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      assertPlainJson(nested, `${path}.${key}`, seen)
    }
  }

  seen.delete(value)
}

function assertTerrainAndNumbers(board: BoardState): TileId {
  const terrainCounts: Partial<Record<TerrainType, number>> = {}
  const numberCounts: Partial<Record<NumberToken, number>> = {}
  const desertTileIds: TileId[] = []
  const redTileIds = new Set<TileId>()

  for (const tileId of Object.keys(board.topology.tiles) as TileId[]) {
    const content = board.tileContents[tileId]
    assertInvariant(content !== undefined, `tile ${tileId} has no content.`)
    assertInvariant(
      Object.hasOwn(EXPECTED_TERRAIN_COUNTS, content.terrain),
      `tile ${tileId} has unknown terrain ${content.terrain}.`,
    )
    terrainCounts[content.terrain] = (terrainCounts[content.terrain] ?? 0) + 1

    if (content.terrain === 'DESERT') {
      desertTileIds.push(tileId)
      assertInvariant(content.numberToken === null, `desert tile ${tileId} must not have a number.`)
      continue
    }

    assertInvariant(content.numberToken !== null, `non-desert tile ${tileId} must have a number.`)
    assertInvariant(
      NUMBER_TOKENS.includes(content.numberToken),
      `tile ${tileId} has invalid number token ${content.numberToken}.`,
    )
    numberCounts[content.numberToken] = (numberCounts[content.numberToken] ?? 0) + 1
    if (content.numberToken === 6 || content.numberToken === 8) {
      redTileIds.add(tileId)
    }
  }

  for (const [terrain, expectedCount] of Object.entries(EXPECTED_TERRAIN_COUNTS)) {
    assertInvariant(
      terrainCounts[terrain as TerrainType] === expectedCount,
      `terrain ${terrain} must occur ${expectedCount} times; found ${terrainCounts[terrain as TerrainType] ?? 0}.`,
    )
  }
  assertInvariant(desertTileIds.length === 1, `expected exactly one desert; found ${desertTileIds.length}.`)

  for (const token of NUMBER_TOKENS) {
    const expectedCount = EXPECTED_NUMBER_COUNTS[token]
    assertInvariant(
      numberCounts[token] === expectedCount,
      `number token ${token} must occur ${expectedCount} times; found ${numberCounts[token] ?? 0}.`,
    )
  }
  assertInvariant(redTileIds.size === 4, `expected exactly four red-number tiles; found ${redTileIds.size}.`)

  for (const edge of Object.values(board.topology.edges)) {
    if (edge.tileIds.length === 2) {
      const [left, right] = edge.tileIds
      assertInvariant(
        left === undefined || right === undefined || !redTileIds.has(left) || !redTileIds.has(right),
        `edge ${edge.id} joins adjacent red-number tiles ${left} and ${right}.`,
      )
    }
  }

  const desertTileId = desertTileIds[0]
  assertInvariant(desertTileId !== undefined, 'the desert tile could not be resolved.')
  return desertTileId
}

function assertPortDistribution(board: BoardState): void {
  let genericCount = 0
  const resourceCounts: Record<ResourceType, number> = {
    LUMBER: 0,
    BRICK: 0,
    WOOL: 0,
    GRAIN: 0,
    ORE: 0,
  }

  for (const port of Object.values(board.topology.ports)) {
    if (port.kind.type === 'GENERIC') {
      genericCount += 1
    } else {
      resourceCounts[port.kind.resource] += 1
    }
  }

  assertInvariant(genericCount === 4, `expected four generic ports; found ${genericCount}.`)
  for (const resource of RESOURCE_TYPES) {
    assertInvariant(
      resourceCounts[resource] === 1,
      `expected one ${resource} resource port; found ${resourceCounts[resource]}.`,
    )
  }
}

function assertEmptyOccupancy(board: BoardState): void {
  const vertexIds = Object.keys(board.topology.vertices) as VertexId[]
  const edgeIds = Object.keys(board.topology.edges) as EdgeId[]
  assertExactKeys(Object.keys(board.vertexOccupancy), vertexIds, 'vertex occupancy')
  assertExactKeys(Object.keys(board.edgeOccupancy), edgeIds, 'edge occupancy')

  for (const vertexId of vertexIds) {
    assertInvariant(
      board.vertexOccupancy[vertexId] === null,
      `initial vertex occupancy ${vertexId} must be null.`,
    )
  }
  for (const edgeId of edgeIds) {
    assertInvariant(
      board.edgeOccupancy[edgeId] === null,
      `initial edge occupancy ${edgeId} must be null.`,
    )
  }
}

export function assertStandardInitialBoard(board: BoardState): void {
  assertInvariant(
    board.generatorVersion === BOARD_GENERATOR_VERSION,
    `expected generator version ${BOARD_GENERATOR_VERSION}; received ${board.generatorVersion}.`,
  )
  assertStandardBoardTopology(board.topology)

  const tileIds = Object.keys(board.topology.tiles) as TileId[]
  const portIds = Object.keys(board.topology.ports) as PortId[]
  assertExactKeys(Object.keys(board.tileContents), tileIds, 'tile contents')
  assertInvariant(portIds.length === 9, `expected nine topology ports; found ${portIds.length}.`)

  const desertTileId = assertTerrainAndNumbers(board)
  assertPortDistribution(board)
  assertEmptyOccupancy(board)
  assertInvariant(
    board.topology.tiles[board.robberTileId] !== undefined,
    `robber references unknown tile ${board.robberTileId}.`,
  )
  assertInvariant(
    board.robberTileId === desertTileId,
    `robber must start on desert ${desertTileId}; received ${board.robberTileId}.`,
  )
  assertPlainJson(board, 'board', new Set())
}
