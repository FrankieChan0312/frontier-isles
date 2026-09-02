import type { GameState } from '../model/game-state.ts'
import type { PlayerId } from '../model/ids.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import { assertNormalTurnState } from './normal-turn-invariants.ts'

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid robber workflow state: ${message}`)
}

function resourceTotal(state: GameState, playerId: PlayerId): number {
  const player = state.players[playerId]
  assertInvariant(player !== undefined, `unknown player ${playerId}.`)
  return RESOURCE_TYPES.reduce((sum, resource) => sum + player.resources[resource], 0)
}

export function assertRobberWorkflowState(state: GameState): void {
  assertNormalTurnState(state)
  if (state.turn.phase === 'SETUP_SETTLEMENT' || state.turn.phase === 'SETUP_ROAD') return

  for (const resource of RESOURCE_TYPES) {
    let total = state.bank.resources[resource]
    for (const playerId of state.playerOrder) {
      const player = state.players[playerId]
      assertInvariant(player !== undefined, `unknown player ${playerId}.`)
      total += player.resources[resource]
    }
    assertInvariant(total === 19, `${resource} bank-plus-player total must equal 19; found ${total}.`)
  }

  if (state.turn.phase !== 'DISCARD_REQUIRED') return
  const pending = state.pendingDecision
  assertInvariant(pending?.type === 'DISCARD_RESOURCES', 'discard phase requires discard pending data.')
  assertInvariant(
    pending.triggeringPlayerId === state.turn.currentPlayerId,
    'discard trigger must equal the current rolling player.',
  )
  const completedSet = new Set(pending.completedPlayerIds)
  const canonicalCompleted = state.playerOrder.filter((playerId) => completedSet.has(playerId))
  assertInvariant(
    canonicalCompleted.length === pending.completedPlayerIds.length
      && canonicalCompleted.every((playerId, index) => pending.completedPlayerIds[index] === playerId),
    'completed discard players must use canonical playerOrder ordering.',
  )

  const requiredPlayerIds = Object.keys(pending.requiredCountByPlayer) as PlayerId[]
  const incompletePlayerIds = requiredPlayerIds.filter((playerId) => !completedSet.has(playerId))
  assertInvariant(incompletePlayerIds.length > 0, 'discard phase cannot persist after every requirement is complete.')
  for (const playerId of incompletePlayerIds) {
    const required = pending.requiredCountByPlayer[playerId]
    assertInvariant(required !== undefined, `missing discard requirement for ${playerId}.`)
    assertInvariant(
      required === Math.floor(resourceTotal(state, playerId) / 2),
      `outstanding discard requirement for ${playerId} does not match its authoritative hand.`,
    )
  }
}
