import type { GameEvent } from '../contracts/events.ts'
import type { BankState } from '../model/bank.ts'
import type { TerrainType } from '../model/board-state.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerId, TileId, VertexId } from '../model/ids.ts'
import type { PlayerState } from '../model/player.ts'
import { RESOURCE_TYPES, type ResourceBag, type ResourceType } from '../model/resource.ts'
import { compareCodeUnits } from '../board/topology-ids.ts'

export interface StartingResourceGrantResult {
  readonly players: Readonly<Record<PlayerId, PlayerState>>
  readonly bank: BankState
  readonly events: readonly GameEvent[]
}

function terrainResource(terrain: TerrainType): ResourceType | null {
  switch (terrain) {
    case 'FOREST': return 'LUMBER'
    case 'HILLS': return 'BRICK'
    case 'PASTURE': return 'WOOL'
    case 'FIELDS': return 'GRAIN'
    case 'MOUNTAINS': return 'ORE'
    case 'DESERT': return null
  }
}

export function grantStartingResources(
  state: GameState,
  playerId: PlayerId,
  vertexId: VertexId,
): StartingResourceGrantResult {
  const player = state.players[playerId]
  const vertex = state.board.topology.vertices[vertexId]
  if (player === undefined || vertex === undefined) {
    throw new Error(`Cannot grant setup resources for unknown player or vertex ${playerId}/${vertexId}.`)
  }

  const bankResources: Record<ResourceType, number> = { ...state.bank.resources }
  const playerResources: Record<ResourceType, number> = { ...player.resources }
  const demand: Record<ResourceType, number> = { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 }
  const granted: Record<ResourceType, number> = { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 }
  const producedEvents: GameEvent[] = []

  const tileIds = [...vertex.tileIds].sort(compareCodeUnits)
  for (const tileId of tileIds) {
    const content = state.board.tileContents[tileId]
    if (content === undefined) throw new Error(`Setup vertex ${vertexId} references tile ${tileId} without content.`)
    const resource = terrainResource(content.terrain)
    if (resource === null) continue
    demand[resource] += 1
    if (bankResources[resource] > 0) {
      bankResources[resource] -= 1
      playerResources[resource] += 1
      granted[resource] += 1
      producedEvents.push({ type: 'RESOURCE_PRODUCED', playerId, tileId: tileId as TileId, resource, quantity: 1 })
    }
  }

  const blockedEvents: GameEvent[] = []
  for (const resource of RESOURCE_TYPES) {
    if (granted[resource] < demand[resource]) {
      blockedEvents.push({
        type: 'RESOURCE_PRODUCTION_BLOCKED',
        resource,
        affectedPlayerIds: [playerId],
        reason: 'BANK_SHORTAGE',
      })
    }
  }

  const resources: ResourceBag = playerResources
  return {
    players: {
      ...state.players,
      [playerId]: { ...player, resources },
    },
    bank: {
      resources: bankResources,
      developmentDeck: state.bank.developmentDeck,
    },
    events: [...producedEvents, ...blockedEvents],
  }
}
