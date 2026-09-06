import type { GameEvent } from '../contracts/events.ts'
import type {
  DevelopmentCardId,
  PlayerId,
  TradeId,
} from '../model/ids.ts'
import type { TradeOffer } from '../model/trade.ts'
import { createPlayerEventView } from './player-event-view.ts'

const playerA = 'player:event:a' as PlayerId
const playerB = 'player:event:b' as PlayerId
const observer = 'player:event:observer' as PlayerId

const offer: TradeOffer = {
  tradeId: 'trade:event' as TradeId,
  initiatorId: playerA,
  counterpartyId: playerB,
  proposedById: playerA,
  initiatorGives: { LUMBER: 1, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
  counterpartyGives: { LUMBER: 0, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 },
  parentTradeId: null,
}

describe('viewer-specific event projection', () => {
  it('hides a stolen resource from uninvolved viewers', () => {
    const event: GameEvent = {
      type: 'RESOURCE_STOLEN',
      fromPlayerId: playerB,
      toPlayerId: playerA,
      resource: 'ORE',
    }
    expect(createPlayerEventView(event, observer)).toEqual({
      ...event,
      resource: null,
    })
    expect(createPlayerEventView(event, playerA)).toEqual(event)
    expect(createPlayerEventView(event, playerB)).toEqual(event)
  })

  it('hides discard composition and development-card identity from other players', () => {
    const discard: GameEvent = {
      type: 'RESOURCES_DISCARDED',
      playerId: playerA,
      resources: { LUMBER: 2, BRICK: 0, WOOL: 1, GRAIN: 0, ORE: 0 },
    }
    const purchase: GameEvent = {
      type: 'DEVELOPMENT_CARD_BOUGHT',
      ownerId: playerA,
      cardId: 'development-card:event' as DevelopmentCardId,
      cardType: 'VICTORY_POINT',
      acquiredTurnNumber: 4,
    }

    expect(createPlayerEventView(discard, observer)).toEqual({
      type: 'RESOURCES_DISCARDED',
      playerId: playerA,
      quantity: 3,
      resources: null,
    })
    expect(createPlayerEventView(discard, playerA)).toMatchObject({ resources: discard.resources })
    expect(createPlayerEventView(purchase, observer)).toEqual({
      ...purchase,
      cardId: null,
      cardType: null,
    })
    expect(createPlayerEventView(purchase, playerA)).toEqual(purchase)
  })

  it('shares pending offer contents only with parties while completed trade contents stay public', () => {
    const proposed: GameEvent = { type: 'TRADE_PROPOSED', offer }
    const completed: GameEvent = { type: 'TRADE_COMPLETED', offer }

    expect(createPlayerEventView(proposed, observer)).toEqual({
      type: 'TRADE_PROPOSED',
      tradeId: offer.tradeId,
      initiatorId: playerA,
      counterpartyId: playerB,
      offer: null,
    })
    expect(createPlayerEventView(proposed, playerB)).toMatchObject({ offer })
    expect(createPlayerEventView(completed, observer)).toEqual(completed)
  })
})
