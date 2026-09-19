import { describe, expect, it } from 'vitest'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { createCompletedGoldenSetup, GOLDEN_PLAYER_IDS } from '@frontier-isles/game-core/engine/task-05-golden-fixture.test-helper'
import {
  REALTIME_PROTOCOL_VERSION, gameCommandRequestSchema, gameCommandAcknowledgementSchema,
  gameUpdateSchema, playerViewSchema, GAME_COMMAND_TYPES, gameDeliveryStateSchema,
} from '../src/index.js'

const bag = { LUMBER: 1, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 }
const offer = { tradeId: 'trade:test', initiatorId: 'player:human', counterpartyId: 'player:merchant',
  proposedById: 'player:human', initiatorGives: bag, counterpartyGives: { ...bag, LUMBER: 0, BRICK: 1 }, parentTradeId: null }
const commands: Record<GameCommand['type'], unknown> = {
  PLACE_INITIAL_SETTLEMENT: { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:1,-2,1' },
  PLACE_INITIAL_ROAD: { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:1,-2,1|vertex:2,-1,-1' },
  ROLL_DICE: { type: 'ROLL_DICE' }, DISCARD_RESOURCES: { type: 'DISCARD_RESOURCES', resources: bag },
  MOVE_ROBBER: { type: 'MOVE_ROBBER', tileId: 'tile:0,0' },
  STEAL_FROM_PLAYER: { type: 'STEAL_FROM_PLAYER', targetPlayerId: 'player:merchant' },
  BUILD_ROAD: { type: 'BUILD_ROAD', edgeId: 'edge:vertex:1,-2,1|vertex:2,-1,-1' },
  BUILD_SETTLEMENT: { type: 'BUILD_SETTLEMENT', vertexId: 'vertex:1,-2,1' },
  UPGRADE_CITY: { type: 'UPGRADE_CITY', vertexId: 'vertex:1,-2,1' },
  BUY_DEVELOPMENT_CARD: { type: 'BUY_DEVELOPMENT_CARD' },
  PLAY_DEVELOPMENT_CARD: { type: 'PLAY_DEVELOPMENT_CARD', cardId: 'development-card:knight:01' },
  CHOOSE_INVENTION_RESOURCES: { type: 'CHOOSE_INVENTION_RESOURCES', resources: bag },
  CHOOSE_MONOPOLY_RESOURCE: { type: 'CHOOSE_MONOPOLY_RESOURCE', resource: 'GRAIN' },
  FINISH_FREE_ROAD_PLACEMENT: { type: 'FINISH_FREE_ROAD_PLACEMENT' },
  PROPOSE_TRADE: { type: 'PROPOSE_TRADE', offer },
  ACCEPT_TRADE: { type: 'ACCEPT_TRADE', tradeId: 'trade:test' },
  REJECT_TRADE: { type: 'REJECT_TRADE', tradeId: 'trade:test' },
  COUNTER_TRADE: { type: 'COUNTER_TRADE', previousTradeId: 'trade:original', offer },
  MARITIME_TRADE: { type: 'MARITIME_TRADE', giveResource: 'LUMBER', receiveResource: 'GRAIN' },
  END_TURN: { type: 'END_TURN' },
}
const identity = { protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: 'ABC234', gameId: 'game:task-05' }
function request(command: unknown): unknown {
  return { ...identity, commandId: 'human:test:1', expectedStateVersion: 16, command }
}
function update() {
  const state = createCompletedGoldenSetup()
  return { ...identity, publicationRevision: 1, lifecycleStatus: 'ACTIVE', aiThinking: false,
    presence: { lifecycleStatus: 'ACTIVE', disconnectedSeats: [], replacements: [], abandonedDeadlineMs: null },
    view: gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.human), events: [] }
}

describe('strict online game protocol', () => {
  it('strictly validates safe conflict, overload and bounded delivery status notifications', () => {
    for (const code of ['COMMAND_ID_CONFLICT', 'GAME_BUSY']) {
      const error = { code, message: 'Resynchronize before trying again.' }
      expect(gameCommandAcknowledgementSchema.safeParse({ ok: false, error }).success).toBe(true)
      for (const extra of [{ fingerprint: 'private' }, { result: { accepted: true } }, { sessionId: 'private' }]) {
        expect(gameCommandAcknowledgementSchema.safeParse({ ok: false, error: { ...error, ...extra } }).success).toBe(false)
      }
    }
    const status = { status: 'RETRYING', attempt: 2, queuedCommands: 1 }
    expect(gameDeliveryStateSchema.safeParse(status).success).toBe(true)
    for (const malformed of [{ ...status, attempt: 7 }, { ...status, queuedCommands: 33 },
      { ...status, status: 'UNKNOWN' }, { ...status, request: commands.DISCARD_RESOURCES }, { ...status, commandId: 'private' }]) {
      expect(gameDeliveryStateSchema.safeParse(malformed).success).toBe(false)
    }
  })
  it.each(GAME_COMMAND_TYPES)('accepts the domain %s command and rejects nested spoofed fields', (type) => {
    const command = commands[type]
    expect(gameCommandRequestSchema.safeParse(request(command)).success).toBe(true)
    if (typeof command !== 'object' || command === null) throw new Error('Missing command sample.')
    expect(gameCommandRequestSchema.safeParse(request({ ...command, actorId: 'attacker' })).success).toBe(false)
  })

  it('rejects unsafe numbers, malformed bags, reserved IDs, unknown commands and actor credentials', () => {
    const valid = gameCommandRequestSchema.parse(request(commands.ROLL_DICE))
    for (const expectedStateVersion of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(gameCommandRequestSchema.safeParse({ ...valid, expectedStateVersion }).success).toBe(false)
    }
    for (const extra of [{ actorId: 'player:other' }, { sessionId: 'secret' }, { resumeToken: 'secret' }]) {
      expect(gameCommandRequestSchema.safeParse({ ...valid, ...extra }).success).toBe(false)
    }
    expect(gameCommandRequestSchema.safeParse({ ...valid, commandId: 'server-ai:1' }).success).toBe(false)
    for (const command of [{ type: 'CHEAT' }, { type: 'DISCARD_RESOURCES', resources: { ...bag, ORE: -1 } },
      { type: 'PROPOSE_TRADE', offer: { ...offer, actualOpponentHand: bag } }]) {
      expect(gameCommandRequestSchema.safeParse(request(command)).success).toBe(false)
    }
  })

  it('validates an actual complete projection and rejects hidden data at every nested boundary', () => {
    const value = update()
    expect(gameUpdateSchema.safeParse(value).success).toBe(true)
    const view = value.view
    const opponent = view.opponents[0]
    if (opponent === undefined) throw new Error('Missing opponent fixture.')
    for (const poisoned of [
      { ...view, random: { state: 1 } },
      { ...view, opponents: [{ ...opponent, resources: bag }, ...view.opponents.slice(1)] },
      { ...view, opponents: [{ ...opponent, developmentCards: ['KNIGHT'] }, ...view.opponents.slice(1)] },
      { ...view, publicGame: { ...view.publicGame, bank: { ...view.publicGame.bank, developmentDeck: [] } } },
      { ...view, legalActions: { ...view.legalActions, opponentCanAffordTrade: true } },
      { ...view, publicGame: { ...view.publicGame, board: { ...view.publicGame.board, random: 'secret' } } },
      { ...view, pendingDecision: { type: 'CHOOSE_MONOPOLY_RESOURCE', actingPlayerId: opponent.id,
        cardId: 'card:test', legalResourceTypes: ['LUMBER'] } },
    ]) expect(playerViewSchema.safeParse(poisoned).success).toBe(false)
    expect(gameUpdateSchema.safeParse({ ...value, view: { ...view, stateVersion: 123 } }).success).toBe(false)
    expect(gameUpdateSchema.safeParse({ ...value, lifecycleStatus: 'FINISHED' }).success).toBe(false)
    expect(gameUpdateSchema.safeParse({ ...value, gameId: 'game:another' }).success).toBe(false)
  })

  it('rejects hidden discard, theft, purchase and negotiation events addressed to an outsider', () => {
    const value = update()
    const outsider = 'player:sentinel'
    for (const event of [
      { type: 'RESOURCES_DISCARDED', playerId: outsider, quantity: 1, resources: bag },
      { type: 'RESOURCE_STOLEN', fromPlayerId: outsider, toPlayerId: 'player:merchant', resource: 'LUMBER' },
      { type: 'DEVELOPMENT_CARD_BOUGHT', ownerId: outsider, cardId: 'card:secret', cardType: 'VICTORY_POINT', acquiredTurnNumber: 1 },
      { type: 'TRADE_PROPOSED', tradeId: 'trade:secret', initiatorId: outsider,
        counterpartyId: 'player:merchant', offer: { ...offer, initiatorId: outsider } },
    ]) expect(gameUpdateSchema.safeParse({ ...value, events: [event] }).success).toBe(false)
  })

  it('keeps acknowledgements compact and rejects raw rule details and source state', () => {
    const data = { accepted: false, commandId: 'human:test:1', stateVersion: 16,
      violation: { code: 'TRADE_RESOURCE_UNAVAILABLE' } }
    expect(gameCommandAcknowledgementSchema.safeParse({ ok: true, data }).success).toBe(true)
    for (const poisoned of [{ ...data, state: createCompletedGoldenSetup() },
      { ...data, violation: { ...data.violation, details: { playerResources: bag } } }]) {
      expect(gameCommandAcknowledgementSchema.safeParse({ ok: true, data: poisoned }).success).toBe(false)
    }
  })
})
