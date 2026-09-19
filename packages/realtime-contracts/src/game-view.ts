import { z } from 'zod'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import { GAME_COMMAND_TYPES } from './game-command.js'
import {
  playerIdSchema, cardIdSchema, vertexIdSchema, edgeIdSchema, tileIdSchema, integerSchema,
  resourceBagSchema, resourceSchema, controllerSchema, cardTypeSchema, publicGameSchema,
  robberCauseSchema, tradeOfferSchema, counterDepthSchema, oneOrTwoSchema, ratioSchema,
} from './game-values.js'

const playerFields = {
  id: playerIdSchema, name: z.string().min(1).max(64), color: z.enum(['RED', 'BLUE', 'ORANGE', 'WHITE']),
  controller: controllerSchema, playedKnights: integerSchema.max(14), publicVictoryPoints: integerSchema,
}
const pendingDecisionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('DISCARD_RESOURCES'), requiredCount: integerSchema.max(47) }),
  z.strictObject({ type: z.literal('AWAITING_DISCARDS'), remainingPlayerIds: z.array(playerIdSchema).max(4) }),
  z.strictObject({ type: z.literal('MOVE_ROBBER'), actingPlayerId: playerIdSchema,
    cause: robberCauseSchema, legalTileIds: z.array(tileIdSchema).max(19) }),
  z.strictObject({ type: z.literal('CHOOSE_ROBBER_TARGET'), actingPlayerId: playerIdSchema,
    selectedTileId: tileIdSchema, eligibleTargetPlayerIds: z.array(playerIdSchema).max(3), cause: robberCauseSchema }),
  z.strictObject({ type: z.literal('PLACE_FREE_ROADS'), actingPlayerId: playerIdSchema,
    cardId: cardIdSchema, remainingRoadCount: oneOrTwoSchema, legalEdgeIds: z.array(edgeIdSchema).max(72) }),
  z.strictObject({ type: z.literal('CHOOSE_INVENTION_RESOURCES'), actingPlayerId: playerIdSchema,
    cardId: cardIdSchema, availableResources: resourceBagSchema }),
  z.strictObject({ type: z.literal('CHOOSE_MONOPOLY_RESOURCE'), actingPlayerId: playerIdSchema,
    cardId: cardIdSchema, legalResourceTypes: z.array(resourceSchema).max(5) }),
  z.strictObject({ type: z.literal('RESPOND_TO_TRADE'), responderId: playerIdSchema,
    offer: tradeOfferSchema, counterDepth: counterDepthSchema }),
  z.strictObject({ type: z.literal('TRADE_IN_PROGRESS'), initiatorId: playerIdSchema,
    counterpartyId: playerIdSchema, responderId: playerIdSchema, counterDepth: counterDepthSchema }),
])

// Online snapshots always carry the complete current legal-action projection. Historical
// optional V1 fields remain compatible in game-core; the wire requires the current fields.
export const playerViewSchema: z.ZodType<PlayerView> = z.strictObject({
  stateVersion: integerSchema, publicGame: publicGameSchema,
  self: z.strictObject({ ...playerFields, resources: resourceBagSchema, actualVictoryPoints: integerSchema,
    developmentCards: z.array(z.strictObject({ id: cardIdSchema, type: cardTypeSchema,
      acquiredTurnNumber: integerSchema, status: z.enum(['IN_HAND', 'PLAYED', 'REVEALED']) })).max(25) }),
  opponents: z.array(z.strictObject({ ...playerFields,
    resourceCardCount: integerSchema.max(95), developmentCardCount: integerSchema.max(25) })).length(3),
  pendingDecision: pendingDecisionSchema.nullable(),
  legalActions: z.strictObject({
    permittedCommandTypes: z.array(z.enum(GAME_COMMAND_TYPES)).max(20),
    canRollDice: z.boolean(), canEndTurn: z.boolean(), canBuyDevelopmentCard: z.boolean(),
    canProposeTrade: z.boolean(), canFinishFreeRoadPlacement: z.boolean(),
    legalInitialSettlementVertexIds: z.array(vertexIdSchema).max(54),
    legalInitialRoadEdgeIds: z.array(edgeIdSchema).max(72),
    legalRoadEdgeIds: z.array(edgeIdSchema).max(72),
    legalSettlementVertexIds: z.array(vertexIdSchema).max(54),
    legalCityUpgradeVertexIds: z.array(vertexIdSchema).max(54),
    legalRobberTileIds: z.array(tileIdSchema).max(19),
    eligibleRobberTargetPlayerIds: z.array(playerIdSchema).max(3),
    requiredDiscardCount: integerSchema.max(47).nullable(), discardableResources: resourceBagSchema.nullable(),
    playableDevelopmentCardIds: z.array(cardIdSchema).max(25),
    developmentCardPlayability: z.array(z.strictObject({ cardId: cardIdSchema, canPlay: z.boolean(),
      reason: z.enum(['PLAYABLE', 'BOUGHT_THIS_TURN', 'ALREADY_PLAYED', 'VICTORY_POINT', 'NOT_YOUR_TURN',
        'PENDING_DECISION', 'WRONG_PHASE', 'CARD_LIMIT_REACHED', 'EFFECT_UNAVAILABLE', 'GAME_OVER']) })).max(25),
    legalInventionSelections: z.array(resourceBagSchema).max(15),
    legalMonopolyResourceTypes: z.array(resourceSchema).max(5),
    legalMaritimeTradeOptions: z.array(z.strictObject({ giveResource: resourceSchema,
      receiveResource: resourceSchema, ratio: ratioSchema })).max(20),
    legalDomesticTradeCounterpartyIds: z.array(playerIdSchema).max(3),
    tradeResponse: z.strictObject({ canAccept: z.boolean(), canReject: z.boolean(), canCounter: z.boolean() }).nullable(),
  }),
}).superRefine((view, context) => {
  if (view.stateVersion !== view.publicGame.stateVersion) {
    context.addIssue({ code: 'custom', message: 'View versions must match.' })
  }
  const ids = [view.self.id, ...view.opponents.map((opponent) => opponent.id)]
  if (new Set(ids).size !== 4 || !ids.includes(view.publicGame.turn.currentPlayerId)) {
    context.addIssue({ code: 'custom', message: 'View players must be coherent.' })
  }
  const pending = view.pendingDecision
  if ((pending?.type === 'CHOOSE_INVENTION_RESOURCES' || pending?.type === 'CHOOSE_MONOPOLY_RESOURCE')
    && pending.actingPlayerId !== view.self.id) {
    context.addIssue({ code: 'custom', message: 'Private decision belongs to another viewer.' })
  }
  if (pending?.type === 'RESPOND_TO_TRADE'
    && pending.offer.initiatorId !== view.self.id && pending.offer.counterpartyId !== view.self.id) {
    context.addIssue({ code: 'custom', message: 'Private trade belongs to other viewers.' })
  }
})
