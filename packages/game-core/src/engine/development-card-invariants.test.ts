import type { GameState } from '../model/game-state.ts'
import type { DevelopmentCardId } from '../model/ids.ts'
import { assertDevelopmentCardState } from './development-card-invariants.ts'
import { GOLDEN_PLAYER_IDS } from './task-05-golden-fixture.test-helper.ts'
import { createGoldenPaidBuildingStart } from './task-08-paid-building.test-helper.ts'
import { moveStandardCardToPlayer } from './task-10-development-card.test-helper.ts'

describe('development-card state invariants', () => {
  it('accepts exact 25-card conservation across deck and owned cards without mutation', () => {
    const state = moveStandardCardToPlayer(
      createGoldenPaidBuildingStart(),
      GOLDEN_PLAYER_IDS.sentinel,
      'INVENTION',
    )
    const snapshot = structuredClone(state)
    expect(() => assertDevelopmentCardState(state)).not.toThrow()
    expect(state.bank.developmentDeck).toHaveLength(24)
    expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards).toHaveLength(1)
    expect(state).toEqual(snapshot)
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })

  it('rejects duplicate, missing, unknown, and type-mismatched identities', () => {
    const state = createGoldenPaidBuildingStart()
    const top = state.bank.developmentDeck[0]
    const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
    if (top === undefined || sentinel === undefined) throw new Error('Missing invariant fixture data.')
    const ownedTop = { ...top, acquiredTurnNumber: 0, status: 'IN_HAND' as const }
    expect(() => assertDevelopmentCardState({
      ...state,
      players: { ...state.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel, developmentCards: [ownedTop],
      } },
    })).toThrow(/duplicated/)
    expect(() => assertDevelopmentCardState({
      ...state,
      bank: { ...state.bank, developmentDeck: state.bank.developmentDeck.slice(1) },
    })).toThrow(/total must be 25/)
    expect(() => assertDevelopmentCardState({
      ...state,
      bank: { ...state.bank, developmentDeck: [
        { ...top, id: 'development-card:unknown:01' as DevelopmentCardId },
        ...state.bank.developmentDeck.slice(1),
      ] },
    })).toThrow(/not standard/)
    expect(() => assertDevelopmentCardState({
      ...state,
      bank: { ...state.bank, developmentDeck: [
        { ...top, type: top.type === 'KNIGHT' ? 'MONOPOLY' : 'KNIGHT' },
        ...state.bank.developmentDeck.slice(1),
      ] },
    })).toThrow(/expected/)
  })

  it('rejects malformed bank and owned card shapes', () => {
    const state = createGoldenPaidBuildingStart()
    const top = state.bank.developmentDeck[0]
    if (top === undefined) throw new Error('Missing top card.')
    expect(() => assertDevelopmentCardState({
      ...state,
      bank: { ...state.bank, developmentDeck: [
        { ...top, status: 'IN_HAND' } as typeof top,
        ...state.bank.developmentDeck.slice(1),
      ] },
    })).toThrow(/malformed definition shape/)

    const nonPlainDeck = [...state.bank.developmentDeck]
    Object.setPrototypeOf(nonPlainDeck, Object.create(Array.prototype))
    expect(() => assertDevelopmentCardState({
      ...state,
      bank: { ...state.bank, developmentDeck: nonPlainDeck },
    })).toThrow(/plain array/)
  })

  it('rejects illegal status combinations and future acquisition turns', () => {
    expect(() => assertDevelopmentCardState(moveStandardCardToPlayer(
      createGoldenPaidBuildingStart(), GOLDEN_PLAYER_IDS.sentinel, 'KNIGHT', 'REVEALED', 0,
    ))).toThrow(/invalid KNIGHT status/)
    expect(() => assertDevelopmentCardState(moveStandardCardToPlayer(
      createGoldenPaidBuildingStart(), GOLDEN_PLAYER_IDS.sentinel, 'VICTORY_POINT', 'PLAYED', 0,
    ))).toThrow(/Victory Point card|invalid VICTORY_POINT status/)
    expect(() => assertDevelopmentCardState(moveStandardCardToPlayer(
      createGoldenPaidBuildingStart(), GOLDEN_PLAYER_IDS.sentinel, 'MONOPOLY', 'IN_HAND', 2,
    ))).toThrow(/acquiredTurnNumber/)
  })

  it('requires playedKnights to equal owned PLAYED Knight cards', () => {
    const state = createGoldenPaidBuildingStart()
    const sentinel = state.players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    expect(() => assertDevelopmentCardState({
      ...state,
      players: { ...state.players, [GOLDEN_PLAYER_IDS.sentinel]: {
        ...sentinel, playedKnights: 1,
      } },
    })).toThrow(/does not match/)
  })

  it('requires coherent free-road, choice, and Knight pending card references', () => {
    const base = moveStandardCardToPlayer(
      createGoldenPaidBuildingStart(), GOLDEN_PLAYER_IDS.sentinel, 'ROAD_BUILDING', 'PLAYED', 0,
    )
    const freeRoad: GameState = {
      ...base,
      turn: { ...base.turn, phase: 'FREE_ROAD_PLACEMENT' },
      pendingDecision: {
        type: 'PLACE_FREE_ROADS',
        actingPlayerId: GOLDEN_PLAYER_IDS.sentinel,
        cardId: 'development-card:road-building:missing' as DevelopmentCardId,
        remainingRoadCount: 2,
      },
    }
    expect(() => assertDevelopmentCardState(freeRoad)).toThrow(/unowned card/)

    const invention = moveStandardCardToPlayer(
      createGoldenPaidBuildingStart(), GOLDEN_PLAYER_IDS.sentinel, 'INVENTION', 'PLAYED', 0,
    )
    const cardId = invention.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards[0]?.id
    if (cardId === undefined) throw new Error('Missing Invention card.')
    expect(() => assertDevelopmentCardState({
      ...invention,
      pendingDecision: {
        type: 'CHOOSE_INVENTION_RESOURCES',
        actingPlayerId: GOLDEN_PLAYER_IDS.human,
        cardId,
      },
    })).toThrow(/actor must be current/)
  })
})
