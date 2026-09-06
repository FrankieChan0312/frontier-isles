import { z } from 'zod'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { RuleViolationCode } from '@frontier-isles/game-core/contracts/errors'
import {
  vertexIdSchema, edgeIdSchema, tileIdSchema, playerIdSchema, cardIdSchema, tradeIdSchema,
  tradeOfferSchema, resourceBagSchema, resourceSchema,
} from './game-values.js'

export const gameCommandSchema: z.ZodType<GameCommand> = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('PLACE_INITIAL_SETTLEMENT'), vertexId: vertexIdSchema }),
  z.strictObject({ type: z.literal('PLACE_INITIAL_ROAD'), edgeId: edgeIdSchema }),
  z.strictObject({ type: z.literal('ROLL_DICE') }),
  z.strictObject({ type: z.literal('DISCARD_RESOURCES'), resources: resourceBagSchema }),
  z.strictObject({ type: z.literal('MOVE_ROBBER'), tileId: tileIdSchema }),
  z.strictObject({ type: z.literal('STEAL_FROM_PLAYER'), targetPlayerId: playerIdSchema }),
  z.strictObject({ type: z.literal('BUILD_ROAD'), edgeId: edgeIdSchema }),
  z.strictObject({ type: z.literal('BUILD_SETTLEMENT'), vertexId: vertexIdSchema }),
  z.strictObject({ type: z.literal('UPGRADE_CITY'), vertexId: vertexIdSchema }),
  z.strictObject({ type: z.literal('BUY_DEVELOPMENT_CARD') }),
  z.strictObject({ type: z.literal('PLAY_DEVELOPMENT_CARD'), cardId: cardIdSchema }),
  z.strictObject({ type: z.literal('CHOOSE_INVENTION_RESOURCES'), resources: resourceBagSchema }),
  z.strictObject({ type: z.literal('CHOOSE_MONOPOLY_RESOURCE'), resource: resourceSchema }),
  z.strictObject({ type: z.literal('FINISH_FREE_ROAD_PLACEMENT') }),
  z.strictObject({ type: z.literal('PROPOSE_TRADE'), offer: tradeOfferSchema }),
  z.strictObject({ type: z.literal('ACCEPT_TRADE'), tradeId: tradeIdSchema }),
  z.strictObject({ type: z.literal('REJECT_TRADE'), tradeId: tradeIdSchema }),
  z.strictObject({ type: z.literal('COUNTER_TRADE'), previousTradeId: tradeIdSchema, offer: tradeOfferSchema }),
  z.strictObject({ type: z.literal('MARITIME_TRADE'), giveResource: resourceSchema, receiveResource: resourceSchema }),
  z.strictObject({ type: z.literal('END_TURN') }),
])

export const GAME_COMMAND_TYPES = [
  'PLACE_INITIAL_SETTLEMENT', 'PLACE_INITIAL_ROAD', 'ROLL_DICE', 'DISCARD_RESOURCES',
  'MOVE_ROBBER', 'STEAL_FROM_PLAYER', 'BUILD_ROAD', 'BUILD_SETTLEMENT', 'UPGRADE_CITY',
  'BUY_DEVELOPMENT_CARD', 'PLAY_DEVELOPMENT_CARD', 'CHOOSE_INVENTION_RESOURCES',
  'CHOOSE_MONOPOLY_RESOURCE', 'FINISH_FREE_ROAD_PLACEMENT', 'PROPOSE_TRADE', 'ACCEPT_TRADE',
  'REJECT_TRADE', 'COUNTER_TRADE', 'MARITIME_TRADE', 'END_TURN',
] as const satisfies readonly GameCommand['type'][]

export const ruleViolationCodeSchema: z.ZodType<RuleViolationCode> = z.enum([
  'STALE_STATE_VERSION', 'UNKNOWN_ACTOR', 'GAME_OVER', 'NOT_YOUR_TURN', 'WRONG_PHASE',
  'PENDING_DECISION_REQUIRED', 'INSUFFICIENT_RESOURCES', 'INSUFFICIENT_PIECES',
  'BANK_RESOURCE_UNAVAILABLE', 'DEVELOPMENT_DECK_EMPTY', 'DEVELOPMENT_CARD_NOT_OWNED',
  'DEVELOPMENT_CARD_NOT_PLAYABLE', 'DEVELOPMENT_CARD_LIMIT_REACHED', 'ILLEGAL_VERTEX',
  'ILLEGAL_EDGE', 'DISTANCE_RULE_VIOLATION', 'ROAD_NOT_CONNECTED', 'ROAD_BLOCKED',
  'INVALID_ROBBER_TILE', 'INVALID_ROBBER_TARGET', 'INVALID_DISCARD', 'TRADE_NOT_ALLOWED',
  'INVALID_TRADE_OFFER', 'TRADE_PARTY_MISMATCH', 'TRADE_RESOURCE_UNAVAILABLE',
  'TRADE_NOT_PENDING', 'SAME_RESOURCE_TRADE', 'MARITIME_TRADE_NOT_ALLOWED',
])
