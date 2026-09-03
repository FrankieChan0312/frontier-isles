import type { DevelopmentCardId } from '../../game/model/ids.ts'
import { gameEngine } from '../../game/engine/game-engine.ts'
import { GOLDEN_PLAYER_IDS } from '../../game/engine/task-05-golden-fixture.test-helper.ts'
import { createGoldenDomesticTradeStart } from '../../game/engine/task-11-trading.test-helper.ts'
import { developmentCardDisplayStatus, formatEvent, formatRuleViolation } from './ui-format.ts'

describe('development-card UI formatting', () => {
  it('uses a public-safe supply message for unavailable bank resources', () => {
    expect(formatRuleViolation('BANK_RESOURCE_UNAVAILABLE')).toBe(
      'That resource is currently unavailable from the supply.',
    )
    expect(formatRuleViolation('WRONG_PHASE')).toBe('Wrong phase.')
  })

  it('uses the five required owner card statuses', () => {
    const common = {
      id: 'development-card:format' as DevelopmentCardId,
      acquiredTurnNumber: 3,
    }
    expect(developmentCardDisplayStatus({ ...common, type: 'KNIGHT', status: 'IN_HAND' }, 3))
      .toBe('Bought this turn')
    expect(developmentCardDisplayStatus({ ...common, type: 'KNIGHT', status: 'IN_HAND', acquiredTurnNumber: 2 }, 3))
      .toBe('Playable')
    expect(developmentCardDisplayStatus({ ...common, type: 'KNIGHT', status: 'PLAYED' }, 3))
      .toBe('Already played')
    expect(developmentCardDisplayStatus({ ...common, type: 'VICTORY_POINT', status: 'IN_HAND' }, 3))
      .toBe('Hidden Victory Point')
    expect(developmentCardDisplayStatus({ ...common, type: 'VICTORY_POINT', status: 'REVEALED' }, 3))
      .toBe('Revealed Victory Point')
  })

  it('names a bought card only for its owner', () => {
    const state = createGoldenDomesticTradeStart()
    const ownerView = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.sentinel)
    const observerView = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.human)
    const ownerEvent = {
      type: 'DEVELOPMENT_CARD_BOUGHT' as const,
      ownerId: GOLDEN_PLAYER_IDS.sentinel,
      cardId: 'development-card:format' as DevelopmentCardId,
      cardType: 'KNIGHT' as const,
      acquiredTurnNumber: state.turn.turnNumber,
    }
    const observerEvent = { ...ownerEvent, cardId: null, cardType: null }

    expect(formatEvent(ownerEvent, ownerView)).toBe('You bought Knight.')
    expect(formatEvent(observerEvent, observerView)).toBe('Sentinel bought a development card.')
  })
})
