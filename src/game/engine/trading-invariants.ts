import type { GameState } from '../model/game-state.ts'
import type { PlayerId } from '../model/ids.ts'
import {
  canProvideTradeBundle,
  hasPositiveResourceOverlap,
  hasValidTradeBundles,
} from '../rules/domestic-trade-rules.ts'
import { assertDevelopmentCardState } from './development-card-invariants.ts'

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid trading state: ${message}`)
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index])
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function assertRespondToTradePendingCoherence(state: GameState): void {
  const pending = state.pendingDecision
  if (pending?.type !== 'RESPOND_TO_TRADE') return
  assertInvariant(state.turn.phase === 'ACTION', 'trade response pending requires ACTION.')
  assertInvariant(state.winnerId === null, 'trade response pending cannot coexist with a winner.')
  assertInvariant(pending.counterDepth === 0 || pending.counterDepth === 1, 'counterDepth must be 0 or 1.')
  const offer = pending.offer
  assertInvariant(
    typeof offer === 'object' && offer !== null && !Array.isArray(offer),
    'pending offer must be an object.',
  )
  assertInvariant(Object.getPrototypeOf(offer) === Object.prototype, 'pending offer must be a plain object.')
  assertInvariant(hasExactKeys(offer, [
    'tradeId',
    'initiatorId',
    'counterpartyId',
    'proposedById',
    'initiatorGives',
    'counterpartyGives',
    'parentTradeId',
  ]), 'pending offer shape is malformed.')
  assertInvariant(isNonEmptyString(offer.tradeId), 'pending tradeId must be non-empty.')
  assertInvariant(
    state.players[offer.initiatorId] !== undefined,
    `pending initiator ${offer.initiatorId} is unknown.`,
  )
  assertInvariant(
    state.players[offer.counterpartyId] !== undefined,
    `pending counterparty ${offer.counterpartyId} is unknown.`,
  )
  assertInvariant(offer.initiatorId !== offer.counterpartyId, 'pending trade parties must differ.')
  assertInvariant(
    offer.initiatorId === state.turn.currentPlayerId,
    'pending initiator must remain the current player.',
  )
  assertInvariant(
    offer.proposedById === offer.initiatorId || offer.proposedById === offer.counterpartyId,
    'pending proposer must be one of the stable parties.',
  )
  const expectedResponder = offer.proposedById === offer.initiatorId
    ? offer.counterpartyId
    : offer.initiatorId
  assertInvariant(pending.responderId === expectedResponder, 'pending responder is not opposite the proposer.')
  assertInvariant(hasValidTradeBundles(offer), 'pending trade bundles must be complete and non-empty.')
  assertInvariant(
    !hasPositiveResourceOverlap(offer.initiatorGives, offer.counterpartyGives),
    'pending trade bundles contain same-resource overlap.',
  )

  const proposerId: PlayerId = offer.proposedById
  const proposer = state.players[proposerId]
  assertInvariant(proposer !== undefined, `pending proposer ${proposerId} is unknown.`)
  if (pending.counterDepth === 0) {
    assertInvariant(offer.parentTradeId === null, 'initial pending trade must not have a parent.')
    assertInvariant(offer.proposedById === offer.initiatorId, 'initial terms must be authored by the initiator.')
    assertInvariant(
      canProvideTradeBundle(proposer, offer.initiatorGives),
      'initial proposer cannot provide initiatorGives.',
    )
    return
  }

  assertInvariant(
    isNonEmptyString(offer.parentTradeId) && offer.parentTradeId !== offer.tradeId,
    'countered pending trade requires a distinct non-empty parent ID.',
  )
  assertInvariant(
    offer.proposedById === offer.counterpartyId,
    'countered terms must be authored by the counterparty.',
  )
  assertInvariant(
    canProvideTradeBundle(proposer, offer.counterpartyGives),
    'counter proposer cannot provide counterpartyGives.',
  )
}

export function assertTradingState(state: GameState): void {
  assertDevelopmentCardState(state)
  assertRespondToTradePendingCoherence(state)
}
