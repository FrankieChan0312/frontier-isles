import type { GameEvent } from '../contracts/events.ts'
import type { BankState } from '../model/bank.ts'
import type { TerrainType } from '../model/board-state.ts'
import type { DiceTotal } from '../model/dice.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerId, TileId } from '../model/ids.ts'
import type { PlayerState } from '../model/player.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import type { ResourceBag, ResourceType } from '../model/resource.ts'

interface ProductionCandidate {
  readonly playerId: PlayerId
  readonly tileId: TileId
  readonly resource: ResourceType
  readonly quantity: number
}

export interface ResourceProductionResult {
  readonly players: GameState['players']
  readonly bank: BankState
  readonly events: readonly GameEvent[]
}

const NUMBER_TOKENS = new Set<number>([2, 3, 4, 5, 6, 8, 9, 10, 11, 12])

function assertProductionInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid resource production state: ${message}`)
}

function resourceForTerrain(terrain: TerrainType): ResourceType | null {
  switch (terrain) {
    case 'FOREST': return 'LUMBER'
    case 'HILLS': return 'BRICK'
    case 'PASTURE': return 'WOOL'
    case 'FIELDS': return 'GRAIN'
    case 'MOUNTAINS': return 'ORE'
    case 'DESERT': return null
    default:
      throw new Error(`Invalid resource production state: unknown terrain ${String(terrain)}.`)
  }
}

function compareTilesByCoordinate(state: GameState, left: TileId, right: TileId): number {
  const leftTile = state.board.topology.tiles[left]
  const rightTile = state.board.topology.tiles[right]
  assertProductionInvariant(leftTile !== undefined, `tile ${left} is absent from topology.`)
  assertProductionInvariant(rightTile !== undefined, `tile ${right} is absent from topology.`)
  return leftTile.coordinate.q - rightTile.coordinate.q
    || leftTile.coordinate.r - rightTile.coordinate.r
}

function assertResourceBag(bag: ResourceBag, label: string): void {
  for (const resource of RESOURCE_TYPES) {
    const count = bag[resource]
    assertProductionInvariant(
      Number.isInteger(count) && count >= 0,
      `${label} ${resource} must be a non-negative integer.`,
    )
  }
}

function assertProductionInputs(state: GameState, total: DiceTotal): void {
  assertProductionInvariant(total !== 7, 'terrain production cannot resolve a total of seven.')
  assertResourceBag(state.bank.resources, 'bank')
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId]
    assertProductionInvariant(player !== undefined, `player order references unknown player ${playerId}.`)
    assertResourceBag(player.resources, `player ${playerId}`)
  }

  for (const [tileKey, content] of Object.entries(state.board.tileContents)) {
    const tileId = tileKey as TileId
    assertProductionInvariant(state.board.topology.tiles[tileId] !== undefined, `content references unknown tile ${tileId}.`)
    const resource = resourceForTerrain(content.terrain)
    if (resource === null) {
      assertProductionInvariant(content.numberToken === null, `desert tile ${tileId} must not have a number token.`)
    } else {
      assertProductionInvariant(
        content.numberToken !== null && NUMBER_TOKENS.has(content.numberToken),
        `producing tile ${tileId} has an invalid number token.`,
      )
    }
  }
}

function collectCandidates(state: GameState, total: Exclude<DiceTotal, 7>): readonly ProductionCandidate[] {
  const tileIds = (Object.keys(state.board.topology.tiles) as TileId[])
    .filter((tileId) => state.board.tileContents[tileId]?.numberToken === total)
    .filter((tileId) => tileId !== state.board.robberTileId)
    .sort((left, right) => compareTilesByCoordinate(state, left, right))
  const candidates: ProductionCandidate[] = []

  for (const tileId of tileIds) {
    const tile = state.board.topology.tiles[tileId]
    const content = state.board.tileContents[tileId]
    assertProductionInvariant(tile !== undefined && content !== undefined, `producing tile ${tileId} is incomplete.`)
    const resource = resourceForTerrain(content.terrain)
    assertProductionInvariant(resource !== null, `desert tile ${tileId} cannot produce.`)

    const quantityByPlayer = new Map<PlayerId, number>()
    for (const vertexId of tile.vertexIds) {
      const building = state.board.vertexOccupancy[vertexId]
      if (building === null || building === undefined) continue
      assertProductionInvariant(state.players[building.ownerId] !== undefined, `vertex ${vertexId} has unknown owner ${building.ownerId}.`)
      const quantity = building.type === 'SETTLEMENT' ? 1 : building.type === 'CITY' ? 2 : 0
      assertProductionInvariant(quantity > 0, `vertex ${vertexId} has an invalid building type.`)
      quantityByPlayer.set(building.ownerId, (quantityByPlayer.get(building.ownerId) ?? 0) + quantity)
    }

    for (const playerId of state.playerOrder) {
      const quantity = quantityByPlayer.get(playerId) ?? 0
      if (quantity > 0) candidates.push({ playerId, tileId, resource, quantity })
    }
  }

  return candidates
}

function clonePlayerWithResources(player: PlayerState, resources: ResourceBag): PlayerState {
  return { ...player, resources }
}

export function produceResourcesForRoll(
  state: GameState,
  total: Exclude<DiceTotal, 7>,
): ResourceProductionResult {
  assertProductionInputs(state, total)
  const candidates = collectCandidates(state, total)
  const grantedQuantities = new Map<ProductionCandidate, number>()
  const blockedEvents: GameEvent[] = []

  for (const resource of RESOURCE_TYPES) {
    const resourceCandidates = candidates.filter((candidate) => candidate.resource === resource)
    const totalDemand = resourceCandidates.reduce((sum, candidate) => sum + candidate.quantity, 0)
    if (totalDemand === 0) continue

    const entitledPlayerIds = state.playerOrder.filter((playerId) =>
      resourceCandidates.some((candidate) => candidate.playerId === playerId),
    )
    const available = state.bank.resources[resource]

    if (available >= totalDemand) {
      for (const candidate of resourceCandidates) grantedQuantities.set(candidate, candidate.quantity)
      continue
    }

    if (entitledPlayerIds.length > 1) {
      blockedEvents.push({
        type: 'RESOURCE_PRODUCTION_BLOCKED',
        resource,
        affectedPlayerIds: entitledPlayerIds,
        reason: 'BANK_SHORTAGE',
      })
      continue
    }

    let remaining = available
    for (const candidate of resourceCandidates) {
      const granted = Math.min(candidate.quantity, remaining)
      if (granted > 0) grantedQuantities.set(candidate, granted)
      remaining -= granted
    }
    const playerId = entitledPlayerIds[0]
    assertProductionInvariant(playerId !== undefined, `${resource} shortage has demand without an entitled player.`)
    blockedEvents.push({
      type: 'RESOURCE_PRODUCTION_BLOCKED',
      resource,
      affectedPlayerIds: [playerId],
      reason: 'BANK_SHORTAGE',
    })
  }

  const playerResources = new Map<PlayerId, Record<ResourceType, number>>()
  const bankResources: Record<ResourceType, number> = { ...state.bank.resources }
  const productionEvents: GameEvent[] = []

  for (const candidate of candidates) {
    const granted = grantedQuantities.get(candidate) ?? 0
    if (granted === 0) continue
    const player = state.players[candidate.playerId]
    assertProductionInvariant(player !== undefined, `candidate references unknown player ${candidate.playerId}.`)
    const resources = playerResources.get(candidate.playerId) ?? { ...player.resources }
    resources[candidate.resource] += granted
    playerResources.set(candidate.playerId, resources)
    bankResources[candidate.resource] -= granted
    assertProductionInvariant(bankResources[candidate.resource] >= 0, `bank ${candidate.resource} became negative.`)
    productionEvents.push({
      type: 'RESOURCE_PRODUCED',
      playerId: candidate.playerId,
      tileId: candidate.tileId,
      resource: candidate.resource,
      quantity: granted,
    })
  }

  let players: GameState['players'] = state.players
  let bank: BankState = state.bank
  if (playerResources.size > 0) {
    const changedPlayers: Record<PlayerId, PlayerState> = { ...state.players }
    for (const [playerId, resources] of playerResources) {
      const player = state.players[playerId]
      assertProductionInvariant(player !== undefined, `cannot update unknown player ${playerId}.`)
      changedPlayers[playerId] = clonePlayerWithResources(player, resources)
    }
    players = changedPlayers
    bank = { ...state.bank, resources: bankResources }
  }

  return {
    players,
    bank,
    events: [...productionEvents, ...blockedEvents],
  }
}
