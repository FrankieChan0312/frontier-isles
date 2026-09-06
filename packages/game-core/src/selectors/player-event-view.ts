import type { GameEvent } from '../contracts/events.ts'
import type { PlayerEventView } from '../contracts/player-events.ts'
import type { PlayerId } from '../model/ids.ts'
import type { ResourceBag } from '../model/resource.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import type { TradeOffer } from '../model/trade.ts'
import { assertNever } from '../model/assert-never.ts'

function cloneResourceBag(resources: ResourceBag): ResourceBag {
  return {
    LUMBER: resources.LUMBER,
    BRICK: resources.BRICK,
    WOOL: resources.WOOL,
    GRAIN: resources.GRAIN,
    ORE: resources.ORE,
  }
}

function cloneTradeOffer(offer: TradeOffer): TradeOffer {
  return {
    ...offer,
    initiatorGives: cloneResourceBag(offer.initiatorGives),
    counterpartyGives: cloneResourceBag(offer.counterpartyGives),
  }
}

function isTradeParty(offer: TradeOffer, viewerId: PlayerId): boolean {
  return offer.initiatorId === viewerId || offer.counterpartyId === viewerId
}

export function createPlayerEventView(
  event: GameEvent,
  viewerId: PlayerId,
): PlayerEventView {
  switch (event.type) {
    case 'DICE_ROLLED':
      return { ...event, roll: { ...event.roll } }
    case 'RESOURCE_PRODUCED':
      return { ...event }
    case 'RESOURCE_PRODUCTION_BLOCKED':
      return { ...event, affectedPlayerIds: [...event.affectedPlayerIds] }
    case 'RESOURCES_DISCARDED':
      return {
        type: event.type,
        playerId: event.playerId,
        quantity: RESOURCE_TYPES.reduce(
          (total, resource) => total + event.resources[resource],
          0,
        ),
        resources: event.playerId === viewerId ? cloneResourceBag(event.resources) : null,
      }
    case 'ROBBER_MOVED':
      return { ...event, cause: { ...event.cause } }
    case 'RESOURCE_STOLEN':
      return {
        ...event,
        resource: event.fromPlayerId === viewerId || event.toPlayerId === viewerId
          ? event.resource
          : null,
      }
    case 'ROAD_BUILT':
    case 'SETTLEMENT_BUILT':
    case 'CITY_BUILT':
    case 'DEVELOPMENT_CARD_PLAYED':
    case 'TRADE_REJECTED':
    case 'MARITIME_TRADE_COMPLETED':
    case 'LONGEST_ROAD_CHANGED':
    case 'LARGEST_ARMY_CHANGED':
    case 'TURN_STARTED':
    case 'TURN_ENDED':
    case 'GAME_WON':
      return { ...event }
    case 'DEVELOPMENT_CARD_BOUGHT':
      return {
        ...event,
        cardId: event.ownerId === viewerId ? event.cardId : null,
        cardType: event.ownerId === viewerId ? event.cardType : null,
      }
    case 'TRADE_PROPOSED':
      return {
        type: event.type,
        tradeId: event.offer.tradeId,
        initiatorId: event.offer.initiatorId,
        counterpartyId: event.offer.counterpartyId,
        offer: isTradeParty(event.offer, viewerId) ? cloneTradeOffer(event.offer) : null,
      }
    case 'TRADE_COUNTERED':
      return {
        type: event.type,
        previousTradeId: event.previousTradeId,
        tradeId: event.offer.tradeId,
        initiatorId: event.offer.initiatorId,
        counterpartyId: event.offer.counterpartyId,
        offer: isTradeParty(event.offer, viewerId) ? cloneTradeOffer(event.offer) : null,
      }
    case 'TRADE_COMPLETED':
      return { type: event.type, offer: cloneTradeOffer(event.offer) }
    default:
      return assertNever(event)
  }
}

export function createPlayerEventViews(
  events: readonly GameEvent[],
  viewerId: PlayerId,
): readonly PlayerEventView[] {
  return events.map((event) => createPlayerEventView(event, viewerId))
}
