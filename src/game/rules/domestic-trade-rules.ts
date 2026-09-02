import type { GameState } from '../model/game-state.ts'
import type { PlayerId } from '../model/ids.ts'
import type { PendingDecision } from '../model/pending-decision.ts'
import type { PlayerState } from '../model/player.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import type { ResourceBag, ResourceType } from '../model/resource.ts'
import type { TradeOffer } from '../model/trade.ts'
import { countResourceCards, isCompleteResourceBag } from './resource-bag-validation.ts'

export interface DomesticTradeExchangeResult {
  readonly initiatorResources: ResourceBag
  readonly counterpartyResources: ResourceBag
}

export function cloneTradeOffer(offer: TradeOffer): TradeOffer {
  return {
    tradeId: offer.tradeId,
    initiatorId: offer.initiatorId,
    counterpartyId: offer.counterpartyId,
    proposedById: offer.proposedById,
    initiatorGives: { ...offer.initiatorGives },
    counterpartyGives: { ...offer.counterpartyGives },
    parentTradeId: offer.parentTradeId,
  }
}

type PendingTrade = Extract<PendingDecision, { readonly type: 'RESPOND_TO_TRADE' }>

function isNonEmptyId(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function hasValidInitialTradeParties(
  state: GameState,
  actorId: PlayerId,
  offer: TradeOffer,
): boolean {
  return isNonEmptyId(offer.tradeId)
    && offer.initiatorId === actorId
    && offer.initiatorId === state.turn.currentPlayerId
    && offer.counterpartyId !== offer.initiatorId
    && state.players[offer.counterpartyId] !== undefined
    && offer.proposedById === offer.initiatorId
    && offer.parentTradeId === null
}

export function hasValidCounterTradeLineage(
  pending: PendingTrade,
  counteringPlayerId: PlayerId,
  offer: TradeOffer,
): boolean {
  return isNonEmptyId(offer.tradeId)
    && offer.initiatorId === pending.offer.initiatorId
    && offer.counterpartyId === pending.offer.counterpartyId
    && offer.proposedById === counteringPlayerId
    && counteringPlayerId === pending.offer.counterpartyId
    && offer.parentTradeId === pending.offer.tradeId
    && offer.tradeId !== pending.offer.tradeId
}

export function hasPositiveResourceOverlap(
  initiatorGives: ResourceBag,
  counterpartyGives: ResourceBag,
): boolean {
  return RESOURCE_TYPES.some(
    (resource) => initiatorGives[resource] > 0 && counterpartyGives[resource] > 0,
  )
}

export function hasValidTradeBundles(offer: TradeOffer): boolean {
  return isCompleteResourceBag(offer.initiatorGives)
    && isCompleteResourceBag(offer.counterpartyGives)
    && countResourceCards(offer.initiatorGives) > 0
    && countResourceCards(offer.counterpartyGives) > 0
}

export function canProvideTradeBundle(
  player: PlayerState,
  bundle: ResourceBag,
): boolean {
  return isCompleteResourceBag(bundle)
    && RESOURCE_TYPES.every((resource) => player.resources[resource] >= bundle[resource])
}

export function exchangeDomesticTradeBundles(
  initiatorResources: ResourceBag,
  counterpartyResources: ResourceBag,
  offer: TradeOffer,
): DomesticTradeExchangeResult {
  if (!isCompleteResourceBag(initiatorResources) || !isCompleteResourceBag(counterpartyResources)) {
    throw new Error('Cannot exchange domestic trade bundles with invalid player resources.')
  }
  if (!hasValidTradeBundles(offer) || hasPositiveResourceOverlap(
    offer.initiatorGives,
    offer.counterpartyGives,
  )) throw new Error('Cannot exchange invalid domestic trade bundles.')
  const nextInitiator = { ...initiatorResources } as Record<ResourceType, number>
  const nextCounterparty = { ...counterpartyResources } as Record<ResourceType, number>
  for (const resource of RESOURCE_TYPES) {
    if (
      nextInitiator[resource] < offer.initiatorGives[resource]
      || nextCounterparty[resource] < offer.counterpartyGives[resource]
    ) throw new Error('Cannot exchange a domestic trade that either party cannot provide.')
    nextInitiator[resource] = nextInitiator[resource]
      - offer.initiatorGives[resource]
      + offer.counterpartyGives[resource]
    nextCounterparty[resource] = nextCounterparty[resource]
      - offer.counterpartyGives[resource]
      + offer.initiatorGives[resource]
  }
  return {
    initiatorResources: nextInitiator,
    counterpartyResources: nextCounterparty,
  }
}
