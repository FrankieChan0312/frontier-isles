import { z } from 'zod'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import { GAME_STATE_SCHEMA_VERSION, RANDOM_ALGORITHM_ID, RULESET_ID } from '@frontier-isles/game-core/model/ruleset'
import { assertTradingState } from '@frontier-isles/game-core/engine/trading-invariants'
import { boardSchema, turnSchema, resourceBagSchema, controllerSchema, cardIdSchema, cardTypeSchema,
  robberCauseSchema, tradeOfferSchema, integerSchema, tileIdSchema, playerIdSchema, gameIdSchema } from '@frontier-isles/realtime-contracts'

const player = z.strictObject({
  id: playerIdSchema, name: z.string().min(1).max(64), color: z.enum(['RED', 'BLUE', 'ORANGE', 'WHITE']),
  controller: controllerSchema, resources: resourceBagSchema, playedKnights: integerSchema.max(14),
  developmentCards: z.array(z.strictObject({ id: cardIdSchema, type: cardTypeSchema,
    acquiredTurnNumber: integerSchema, status: z.enum(['IN_HAND', 'PLAYED', 'REVEALED']) })).max(25),
})
const privatePending = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('DISCARD_RESOURCES'), triggeringPlayerId: playerIdSchema,
    requiredCountByPlayer: z.record(playerIdSchema, integerSchema.max(47)), completedPlayerIds: z.array(playerIdSchema).max(4) }),
  z.strictObject({ type: z.literal('MOVE_ROBBER'), actingPlayerId: playerIdSchema, cause: robberCauseSchema }),
  z.strictObject({ type: z.literal('CHOOSE_ROBBER_TARGET'), actingPlayerId: playerIdSchema, selectedTileId: tileIdSchema,
    eligibleTargetPlayerIds: z.array(playerIdSchema).max(3), cause: robberCauseSchema }),
  z.strictObject({ type: z.literal('PLACE_FREE_ROADS'), actingPlayerId: playerIdSchema, cardId: cardIdSchema,
    remainingRoadCount: z.union([z.literal(1), z.literal(2)]) }),
  z.strictObject({ type: z.literal('CHOOSE_INVENTION_RESOURCES'), actingPlayerId: playerIdSchema, cardId: cardIdSchema }),
  z.strictObject({ type: z.literal('CHOOSE_MONOPOLY_RESOURCE'), actingPlayerId: playerIdSchema, cardId: cardIdSchema }),
  z.strictObject({ type: z.literal('RESPOND_TO_TRADE'), responderId: playerIdSchema, offer: tradeOfferSchema,
    counterDepth: z.union([z.literal(0), z.literal(1)]) }),
])

/** Private infrastructure schema. Never export through the realtime/browser package. */
export const persistedGameStateSchema: z.ZodType<GameState> = z.strictObject({
  schemaVersion: z.literal(GAME_STATE_SCHEMA_VERSION), gameId: gameIdSchema, stateVersion: integerSchema,
  rulesetId: z.literal(RULESET_ID), board: boardSchema, players: z.record(playerIdSchema, player),
  playerOrder: z.tuple([playerIdSchema, playerIdSchema, playerIdSchema, playerIdSchema]),
  bank: z.strictObject({ resources: resourceBagSchema,
    developmentDeck: z.array(z.strictObject({ id: cardIdSchema, type: cardTypeSchema })).max(25) }),
  turn: turnSchema,
  awards: z.strictObject({ longestRoadHolderId: playerIdSchema.nullable(), largestArmyHolderId: playerIdSchema.nullable() }),
  pendingDecision: privatePending.nullable(),
  random: z.strictObject({ algorithm: z.literal(RANDOM_ALGORITHM_ID), seed: z.string().min(1).max(4096),
    state: integerSchema.max(0xffff_ffff), drawCount: integerSchema }),
  winnerId: playerIdSchema.nullable(),
}).superRefine((state, context) => {
  try { assertTradingState(state) } catch {
    context.addIssue({ code: 'custom', message: 'Authoritative game invariants failed.' })
  }
})
