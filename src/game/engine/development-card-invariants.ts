import type { DevelopmentCardType, OwnedDevelopmentCard } from '../model/development-card.ts'
import type { GameState } from '../model/game-state.ts'
import type { DevelopmentCardId, PlayerId } from '../model/ids.ts'
import { STANDARD_DEVELOPMENT_DECK_SOURCE } from '../model/standard-development-deck.ts'
import { resumePhaseAfterCardEffect } from '../rules/development-card-rules.ts'
import { assertScoringState } from './scoring-invariants.ts'

const STANDARD_CARD_TYPE_BY_ID = new Map(
  STANDARD_DEVELOPMENT_DECK_SOURCE.map((card) => [card.id, card.type]),
)

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid development-card state: ${message}`)
}

function assertPlainObject(value: object, label: string): void {
  assertInvariant(Object.getPrototypeOf(value) === Object.prototype, `${label} must be a plain object.`)
}

function assertPlainArray(value: readonly unknown[], label: string): void {
  assertInvariant(Object.getPrototypeOf(value) === Array.prototype, `${label} must be a plain array.`)
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index])
}

function assertKnownIdentity(id: DevelopmentCardId, type: DevelopmentCardType): void {
  const expectedType = STANDARD_CARD_TYPE_BY_ID.get(id)
  assertInvariant(expectedType !== undefined, `development-card ID ${id} is not standard.`)
  assertInvariant(expectedType === type, `development-card ID ${id} has type ${type}, expected ${expectedType}.`)
}

function assertOwnedCard(card: OwnedDevelopmentCard, turnNumber: number, label: string): void {
  assertPlainObject(card, label)
  assertInvariant(
    hasExactKeys(card, ['id', 'type', 'acquiredTurnNumber', 'status']),
    `${label} has a malformed owned-card shape.`,
  )
  assertKnownIdentity(card.id, card.type)
  assertInvariant(
    Number.isSafeInteger(card.acquiredTurnNumber)
      && card.acquiredTurnNumber >= 0
      && card.acquiredTurnNumber <= turnNumber,
    `${label} acquiredTurnNumber must be a non-negative safe integer no later than the current turn.`,
  )
  const validStatus = card.type === 'VICTORY_POINT'
    ? card.status === 'IN_HAND' || card.status === 'REVEALED'
    : card.status === 'IN_HAND' || card.status === 'PLAYED'
  assertInvariant(validStatus, `${label} has invalid ${card.type} status ${card.status}.`)
}

function assertPlayedCardReference(
  state: GameState,
  playerId: PlayerId,
  cardId: DevelopmentCardId,
  expectedType: DevelopmentCardType,
  label: string,
): void {
  const player = state.players[playerId]
  assertInvariant(player !== undefined, `${label} references unknown player ${playerId}.`)
  const card = player.developmentCards.find((candidate) => candidate.id === cardId)
  assertInvariant(card !== undefined, `${label} references unowned card ${cardId}.`)
  assertInvariant(card.type === expectedType, `${label} card ${cardId} is not ${expectedType}.`)
  assertInvariant(card.status === 'PLAYED', `${label} card ${cardId} is not PLAYED.`)
}

function assertPendingCoherence(state: GameState): void {
  const pending = state.pendingDecision
  if (pending === null) return
  switch (pending.type) {
    case 'PLACE_FREE_ROADS':
      assertInvariant(state.turn.phase === 'FREE_ROAD_PLACEMENT', 'free-road pending requires FREE_ROAD_PLACEMENT.')
      assertInvariant(pending.actingPlayerId === state.turn.currentPlayerId, 'free-road actor must be current.')
      assertInvariant(pending.remainingRoadCount === 1 || pending.remainingRoadCount === 2, 'free-road remaining count must be 1 or 2.')
      assertPlayedCardReference(state, pending.actingPlayerId, pending.cardId, 'ROAD_BUILDING', 'free-road pending')
      return
    case 'CHOOSE_INVENTION_RESOURCES':
      assertInvariant(state.turn.phase === resumePhaseAfterCardEffect(state), 'Invention pending must retain its origin phase.')
      assertInvariant(pending.actingPlayerId === state.turn.currentPlayerId, 'Invention actor must be current.')
      assertPlayedCardReference(state, pending.actingPlayerId, pending.cardId, 'INVENTION', 'Invention pending')
      return
    case 'CHOOSE_MONOPOLY_RESOURCE':
      assertInvariant(state.turn.phase === resumePhaseAfterCardEffect(state), 'Monopoly pending must retain its origin phase.')
      assertInvariant(pending.actingPlayerId === state.turn.currentPlayerId, 'Monopoly actor must be current.')
      assertPlayedCardReference(state, pending.actingPlayerId, pending.cardId, 'MONOPOLY', 'Monopoly pending')
      return
    case 'MOVE_ROBBER':
    case 'CHOOSE_ROBBER_TARGET':
      if (pending.cause.type === 'KNIGHT') {
        assertInvariant(pending.actingPlayerId === state.turn.currentPlayerId, 'Knight robber actor must be current.')
        assertPlayedCardReference(state, pending.actingPlayerId, pending.cause.cardId, 'KNIGHT', 'Knight robber pending')
      }
      return
    case 'DISCARD_RESOURCES':
    case 'RESPOND_TO_TRADE':
      return
  }
}

export function assertDevelopmentCardState(state: GameState): void {
  assertScoringState(state)
  assertInvariant(Array.isArray(state.bank.developmentDeck), 'bank development deck must be an array.')
  assertPlainArray(state.bank.developmentDeck, 'bank development deck')
  const seenIds = new Set<DevelopmentCardId>()
  let cardCount = 0
  for (const card of state.bank.developmentDeck) {
    assertPlainObject(card, `bank card ${card.id}`)
    assertInvariant(hasExactKeys(card, ['id', 'type']), `bank card ${card.id} has a malformed definition shape.`)
    assertKnownIdentity(card.id, card.type)
    assertInvariant(!seenIds.has(card.id), `development-card ID ${card.id} is duplicated.`)
    seenIds.add(card.id)
    cardCount += 1
  }

  for (const playerId of state.playerOrder) {
    const player = state.players[playerId]
    assertInvariant(player !== undefined, `player ${playerId} is missing.`)
    assertInvariant(Array.isArray(player.developmentCards), `player ${playerId} development cards must be an array.`)
    assertPlainArray(player.developmentCards, `player ${playerId} development cards`)
    let playedKnightCount = 0
    for (const card of player.developmentCards) {
      assertOwnedCard(card, state.turn.turnNumber, `player ${playerId} card ${card.id}`)
      assertInvariant(!seenIds.has(card.id), `development-card ID ${card.id} is duplicated.`)
      seenIds.add(card.id)
      cardCount += 1
      if (card.type === 'KNIGHT' && card.status === 'PLAYED') playedKnightCount += 1
    }
    assertInvariant(
      player.playedKnights === playedKnightCount,
      `player ${playerId} playedKnights ${player.playedKnights} does not match ${playedKnightCount} PLAYED Knight cards.`,
    )
  }

  assertInvariant(cardCount === STANDARD_DEVELOPMENT_DECK_SOURCE.length, `development-card total must be 25; found ${cardCount}.`)
  assertInvariant(seenIds.size === STANDARD_DEVELOPMENT_DECK_SOURCE.length, `development-card identity set must contain all 25 standard IDs.`)
  for (const card of STANDARD_DEVELOPMENT_DECK_SOURCE) {
    assertInvariant(seenIds.has(card.id), `standard development-card ID ${card.id} is missing.`)
  }

  if (state.winnerId !== null || state.turn.phase === 'GAME_OVER') {
    assertInvariant(state.pendingDecision === null, 'completed games cannot retain card-effect pending data.')
  }
  assertPendingCoherence(state)
}
