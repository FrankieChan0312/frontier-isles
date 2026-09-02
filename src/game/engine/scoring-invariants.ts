import type { GameState } from '../model/game-state.ts'
import {
  LARGEST_ARMY_MINIMUM_KNIGHTS,
  LONGEST_ROAD_MINIMUM_LENGTH,
  STANDARD_VICTORY_POINT_TARGET,
} from '../model/standard-scoring.ts'
import { deriveLongestRoadLength } from '../rules/longest-road.ts'
import { deriveActualVictoryPoints } from '../rules/scoring.ts'
import { assertPaidBuildingState } from './paid-building-invariants.ts'

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid scoring state: ${message}`)
}

export function assertScoringReconciliationInputState(state: GameState): void {
  assertPaidBuildingState(state)

  const seenCardIds = new Set<string>()
  for (const card of state.bank.developmentDeck) {
    assertInvariant(!seenCardIds.has(card.id), `development-card ID ${card.id} is duplicated.`)
    seenCardIds.add(card.id)
  }
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId]
    assertInvariant(player !== undefined, `player ${playerId} is missing.`)
    assertInvariant(
      Number.isSafeInteger(player.playedKnights) && player.playedKnights >= 0,
      `player ${playerId} playedKnights must be a non-negative safe integer.`,
    )
    for (const card of player.developmentCards) {
      assertInvariant(!seenCardIds.has(card.id), `development-card ID ${card.id} is duplicated.`)
      seenCardIds.add(card.id)
      assertInvariant(
        card.type !== 'VICTORY_POINT' || card.status !== 'PLAYED',
        `Victory Point card ${card.id} cannot have PLAYED status.`,
      )
    }
  }

  const longestRoadHolderId = state.awards.longestRoadHolderId
  if (longestRoadHolderId !== null) {
    assertInvariant(state.players[longestRoadHolderId] !== undefined, `Longest Road holder ${longestRoadHolderId} is unknown.`)
  }

  const largestArmyHolderId = state.awards.largestArmyHolderId
  if (largestArmyHolderId !== null) {
    assertInvariant(state.players[largestArmyHolderId] !== undefined, `Largest Army holder ${largestArmyHolderId} is unknown.`)
  }

  const winnerId = state.winnerId
  if (winnerId === null) {
    assertInvariant(state.turn.phase !== 'GAME_OVER', 'GAME_OVER requires a winner.')
    return
  }
  assertInvariant(state.players[winnerId] !== undefined, `winner ${winnerId} is unknown.`)
  assertInvariant(state.turn.phase === 'GAME_OVER', 'winner requires GAME_OVER phase.')
  assertInvariant(winnerId === state.turn.currentPlayerId, 'winner must be the current player.')
  assertInvariant(state.pendingDecision === null, 'GAME_OVER must not have a pending decision.')
  assertInvariant(
    deriveActualVictoryPoints(state, winnerId) >= STANDARD_VICTORY_POINT_TARGET,
    `winner ${winnerId} has fewer than ${STANDARD_VICTORY_POINT_TARGET} actual victory points.`,
  )
  const winner = state.players[winnerId]
  assertInvariant(winner !== undefined, `winner ${winnerId} is unknown.`)
  assertInvariant(
    !winner.developmentCards.some((card) => card.type === 'VICTORY_POINT' && card.status === 'IN_HAND'),
    `winner ${winnerId} still has an unrevealed Victory Point card.`,
  )
}

export function assertScoringState(state: GameState): void {
  assertScoringReconciliationInputState(state)

  const longestRoadHolderId = state.awards.longestRoadHolderId
  if (longestRoadHolderId !== null) {
    const holderLength = deriveLongestRoadLength(state.board, longestRoadHolderId)
    assertInvariant(holderLength >= LONGEST_ROAD_MINIMUM_LENGTH, `Longest Road holder ${longestRoadHolderId} has length ${holderLength}, below ${LONGEST_ROAD_MINIMUM_LENGTH}.`)
    for (const playerId of state.playerOrder) {
      assertInvariant(
        deriveLongestRoadLength(state.board, playerId) <= holderLength,
        `Longest Road holder ${longestRoadHolderId} is strictly beaten by ${playerId}.`,
      )
    }
  }

  const largestArmyHolderId = state.awards.largestArmyHolderId
  if (largestArmyHolderId !== null) {
    const holder = state.players[largestArmyHolderId]
    assertInvariant(holder !== undefined, `Largest Army holder ${largestArmyHolderId} is unknown.`)
    assertInvariant(holder.playedKnights >= LARGEST_ARMY_MINIMUM_KNIGHTS, `Largest Army holder ${largestArmyHolderId} has fewer than ${LARGEST_ARMY_MINIMUM_KNIGHTS} played Knights.`)
    for (const playerId of state.playerOrder) {
      const player = state.players[playerId]
      assertInvariant(player !== undefined, `player ${playerId} is missing.`)
      assertInvariant(player.playedKnights <= holder.playedKnights, `Largest Army holder ${largestArmyHolderId} is strictly beaten by ${playerId}.`)
    }
  }

}
