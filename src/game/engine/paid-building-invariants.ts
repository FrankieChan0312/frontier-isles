import type { GameState } from '../model/game-state.ts'
import type { PlayerId } from '../model/ids.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import type { ResourceType } from '../model/resource.ts'
import {
  STANDARD_CITY_PIECE_LIMIT,
  STANDARD_ROAD_PIECE_LIMIT,
  STANDARD_SETTLEMENT_PIECE_LIMIT,
} from '../model/standard-piece-limits.ts'
import { derivePlayerPieceCounts } from '../rules/player-piece-counts.ts'
import { assertRobberWorkflowState } from './robber-workflow-invariants.ts'

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid paid-building state: ${message}`)
}

function assertExactResourceBag(value: unknown, label: string): void {
  assertInvariant(typeof value === 'object' && value !== null && !Array.isArray(value), `${label} must be an object.`)
  const record = value as Readonly<Record<string, unknown>>
  const keys = Object.keys(record)
  assertInvariant(
    keys.length === RESOURCE_TYPES.length
      && keys.every((key) => RESOURCE_TYPES.includes(key as ResourceType)),
    `${label} must contain exactly the five accepted resource keys.`,
  )
  for (const resource of RESOURCE_TYPES) {
    const count = record[resource]
    assertInvariant(
      Number.isSafeInteger(count) && Number(count) >= 0,
      `${label} ${resource} must be a non-negative safe integer.`,
    )
  }
}

function hasExactKeys(value: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function assertOccupancyShapes(state: GameState): void {
  for (const [vertexId, occupancy] of Object.entries(state.board.vertexOccupancy)) {
    if (occupancy === null) continue
    assertInvariant(typeof occupancy === 'object' && !Array.isArray(occupancy), `vertex ${vertexId} building must be an object.`)
    const record = occupancy as unknown as Readonly<Record<string, unknown>>
    assertInvariant(hasExactKeys(record, ['ownerId', 'type']), `vertex ${vertexId} building shape is malformed.`)
    assertInvariant(
      record.type === 'SETTLEMENT' || record.type === 'CITY',
      `vertex ${vertexId} building type is malformed.`,
    )
    assertInvariant(
      typeof record.ownerId === 'string' && state.players[record.ownerId as PlayerId] !== undefined,
      `vertex ${vertexId} building owner is unknown.`,
    )
  }
  for (const [edgeId, occupancy] of Object.entries(state.board.edgeOccupancy)) {
    if (occupancy === null) continue
    assertInvariant(typeof occupancy === 'object' && !Array.isArray(occupancy), `edge ${edgeId} road must be an object.`)
    const record = occupancy as unknown as Readonly<Record<string, unknown>>
    assertInvariant(hasExactKeys(record, ['ownerId']), `edge ${edgeId} road shape is malformed.`)
    assertInvariant(
      typeof record.ownerId === 'string' && state.players[record.ownerId as PlayerId] !== undefined,
      `edge ${edgeId} road owner is unknown.`,
    )
  }
}

export function assertPaidBuildingState(state: GameState): void {
  assertRobberWorkflowState(state)
  assertExactResourceBag(state.bank.resources, 'bank resources')
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId]
    assertInvariant(player !== undefined, `player ${playerId} is missing.`)
    assertExactResourceBag(player.resources, `player ${playerId} resources`)
  }
  for (const resource of RESOURCE_TYPES) {
    let total = state.bank.resources[resource]
    for (const playerId of state.playerOrder) {
      const player = state.players[playerId]
      assertInvariant(player !== undefined, `player ${playerId} is missing.`)
      total += player.resources[resource]
    }
    assertInvariant(total === 19, `${resource} bank-plus-player total must equal 19; found ${total}.`)
  }

  assertOccupancyShapes(state)
  for (const playerId of state.playerOrder) {
    const counts = derivePlayerPieceCounts(state.board, playerId)
    assertInvariant(counts.roads <= STANDARD_ROAD_PIECE_LIMIT, `player ${playerId} exceeds the road-piece limit.`)
    assertInvariant(counts.settlements <= STANDARD_SETTLEMENT_PIECE_LIMIT, `player ${playerId} exceeds the settlement-piece limit.`)
    assertInvariant(counts.cities <= STANDARD_CITY_PIECE_LIMIT, `player ${playerId} exceeds the city-piece limit.`)
  }
}
