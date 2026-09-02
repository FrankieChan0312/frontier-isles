import type { PlayerView } from '../../game/contracts/views.ts'
import type { BoardState, TerrainType } from '../../game/model/board-state.ts'
import type { EdgeId, PlayerId, VertexId } from '../../game/model/ids.ts'
import { RESOURCE_TYPES } from '../../game/model/resource.ts'
import type { ResourceBag, ResourceType } from '../../game/model/resource.ts'

const PIP_WEIGHT: Readonly<Record<number, number>> = Object.freeze({
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  8: 5,
  9: 4,
  10: 3,
  11: 2,
  12: 1,
})

const TERRAIN_RESOURCE: Readonly<Partial<Record<TerrainType, ResourceType>>> = Object.freeze({
  FOREST: 'LUMBER',
  HILLS: 'BRICK',
  PASTURE: 'WOOL',
  FIELDS: 'GRAIN',
  MOUNTAINS: 'ORE',
})

export interface StrategicEvaluation {
  readonly productionProbability: number
  readonly resourceDiversity: number
  readonly resourceScarcity: number
  readonly expectedResourceIncome: ResourceBag
  readonly immediateBuildUnlocks: number
  readonly settlementExpansion: number
  readonly portValue: number
  readonly cityValue: number
  readonly longestRoadOpportunity: number
  readonly largestArmyOpportunity: number
  readonly visibleOpponentThreat: number
  readonly currentVictoryPoints: number
  readonly projectedVictoryPoints: number
}

export function numberTokenWeight(numberToken: number | null): number {
  return numberToken === null ? 0 : PIP_WEIGHT[numberToken] ?? 0
}

export function terrainResource(terrain: TerrainType): ResourceType | null {
  return TERRAIN_RESOURCE[terrain] ?? null
}

export function deriveVisibleIncome(
  board: BoardState,
  playerId: PlayerId,
): ResourceBag {
  const income: Record<ResourceType, number> = {
    LUMBER: 0,
    BRICK: 0,
    WOOL: 0,
    GRAIN: 0,
    ORE: 0,
  }
  for (const [vertexId, building] of Object.entries(board.vertexOccupancy) as [
    VertexId,
    BoardState['vertexOccupancy'][VertexId],
  ][]) {
    if (building?.ownerId !== playerId) continue
    const vertex = board.topology.vertices[vertexId]
    if (vertex === undefined) continue
    const multiplier = building.type === 'CITY' ? 2 : 1
    for (const tileId of vertex.tileIds) {
      if (tileId === board.robberTileId) continue
      const content = board.tileContents[tileId]
      if (content === undefined) continue
      const resource = terrainResource(content.terrain)
      if (resource !== null) income[resource] += numberTokenWeight(content.numberToken) * multiplier
    }
  }
  return income
}

function vertexPortValue(board: BoardState, vertexId: VertexId): number {
  let value = 0
  for (const port of Object.values(board.topology.ports)) {
    if (!port.vertexIds.includes(vertexId)) continue
    value += port.kind.type === 'RESOURCE' ? 5 : 3
  }
  return value
}

export function scoreVertexForProduction(
  view: PlayerView,
  vertexId: VertexId,
): number {
  const board = view.publicGame.board
  const vertex = board.topology.vertices[vertexId]
  if (vertex === undefined) return Number.NEGATIVE_INFINITY
  let production = 0
  const resources = new Set<ResourceType>()
  for (const tileId of vertex.tileIds) {
    const content = board.tileContents[tileId]
    if (content === undefined) continue
    production += numberTokenWeight(content.numberToken)
    const resource = terrainResource(content.terrain)
    if (resource !== null) resources.add(resource)
  }
  const openAdjacent = vertex.adjacentVertexIds.filter(
    (adjacentId) => board.vertexOccupancy[adjacentId] === null,
  ).length
  return production * 10
    + resources.size * 7
    + vertexPortValue(board, vertexId) * 4
    + openAdjacent * 2
}

export function scoreRoadForExpansion(view: PlayerView, edgeId: EdgeId): number {
  const edge = view.publicGame.board.topology.edges[edgeId]
  if (edge === undefined) return Number.NEGATIVE_INFINITY
  const endpointScore = Math.max(
    ...edge.vertexIds.map((vertexId) => scoreVertexForProduction(view, vertexId)),
  )
  const coastalBonus = edge.coastal ? 2 : 0
  return endpointScore + coastalBonus
}

function countOwnedPieces(view: PlayerView): {
  readonly roads: number
  readonly settlements: number
  readonly cities: number
} {
  let roads = 0
  let settlements = 0
  let cities = 0
  for (const road of Object.values(view.publicGame.board.edgeOccupancy)) {
    if (road?.ownerId === view.self.id) roads += 1
  }
  for (const building of Object.values(view.publicGame.board.vertexOccupancy)) {
    if (building?.ownerId !== view.self.id) continue
    if (building.type === 'CITY') cities += 1
    else settlements += 1
  }
  return { roads, settlements, cities }
}

function globalResourceScarcity(board: BoardState): number {
  const counts: Record<ResourceType, number> = {
    LUMBER: 0,
    BRICK: 0,
    WOOL: 0,
    GRAIN: 0,
    ORE: 0,
  }
  for (const content of Object.values(board.tileContents)) {
    const resource = terrainResource(content.terrain)
    if (resource !== null) counts[resource] += numberTokenWeight(content.numberToken)
  }
  return RESOURCE_TYPES.reduce((total, resource) => total + (30 - counts[resource]), 0)
}

function countImmediateUnlocks(resources: ResourceBag): number {
  const costs: readonly ResourceBag[] = [
    { LUMBER: 1, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 },
    { LUMBER: 1, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 0 },
    { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 2, ORE: 3 },
    { LUMBER: 0, BRICK: 0, WOOL: 1, GRAIN: 1, ORE: 1 },
  ]
  return costs.filter((cost) => RESOURCE_TYPES.every(
    (resource) => resources[resource] >= cost[resource],
  )).length
}

export function evaluateStrategicPosition(view: PlayerView): StrategicEvaluation {
  const income = deriveVisibleIncome(view.publicGame.board, view.self.id)
  const pieces = countOwnedPieces(view)
  const productionProbability = RESOURCE_TYPES.reduce(
    (total, resource) => total + income[resource],
    0,
  )
  const resourceDiversity = RESOURCE_TYPES.filter((resource) => income[resource] > 0).length
  const portValue = Object.values(view.publicGame.board.topology.ports).reduce(
    (total, port) => port.vertexIds.some(
      (vertexId) => view.publicGame.board.vertexOccupancy[vertexId]?.ownerId === view.self.id,
    ) ? total + (port.kind.type === 'RESOURCE' ? 2 : 1) : total,
    0,
  )
  const visibleOpponentThreat = Math.max(
    0,
    ...view.opponents.map((opponent) => opponent.publicVictoryPoints * 10
      + opponent.playedKnights * 2
      + opponent.resourceCardCount),
  )
  const projectedVictoryPoints = view.self.actualVictoryPoints
    + Number((view.legalActions.legalSettlementVertexIds?.length ?? 0) > 0)
    + Number((view.legalActions.legalCityUpgradeVertexIds?.length ?? 0) > 0)

  return {
    productionProbability,
    resourceDiversity,
    resourceScarcity: globalResourceScarcity(view.publicGame.board),
    expectedResourceIncome: income,
    immediateBuildUnlocks: countImmediateUnlocks(view.self.resources),
    settlementExpansion: view.legalActions.legalSettlementVertexIds?.length ?? 0,
    portValue,
    cityValue: pieces.settlements * 2 + pieces.cities * 5,
    longestRoadOpportunity: pieces.roads,
    largestArmyOpportunity: view.self.playedKnights,
    visibleOpponentThreat,
    currentVictoryPoints: view.self.actualVictoryPoints,
    projectedVictoryPoints,
  }
}
