import { z } from 'zod'
import type { Brand } from '@frontier-isles/game-core/model/ids'
import { BOARD_GENERATOR_VERSION, RULESET_ID } from '@frontier-isles/game-core/model/ruleset'

// Branding follows structural validation; it is never used as authorization.
function domainId<Name extends string>() {
  return z.string().min(1).max(160).regex(/^[A-Za-z0-9_:.,|-]+$/u)
    .transform((value): Brand<string, Name> => value as Brand<string, Name>)
}
export const gameIdSchema = domainId<'GameId'>()
export const playerIdSchema = domainId<'PlayerId'>()
export const vertexIdSchema = domainId<'VertexId'>()
export const edgeIdSchema = domainId<'EdgeId'>()
export const tileIdSchema = domainId<'TileId'>()
export const portIdSchema = domainId<'PortId'>()
export const cardIdSchema = domainId<'DevelopmentCardId'>()
export const tradeIdSchema = domainId<'TradeId'>()
export const commandIdSchema = domainId<'CommandId'>()
export const integerSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const resourceSchema = z.enum(['LUMBER', 'BRICK', 'WOOL', 'GRAIN', 'ORE'])
const resourceCount = integerSchema.max(19)
export const resourceBagSchema = z.strictObject({
  LUMBER: resourceCount, BRICK: resourceCount, WOOL: resourceCount,
  GRAIN: resourceCount, ORE: resourceCount,
})
export const cardTypeSchema = z.enum(['KNIGHT', 'ROAD_BUILDING', 'MONOPOLY', 'INVENTION', 'VICTORY_POINT'])
export const controllerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('HUMAN') }),
  z.strictObject({ type: z.literal('AI'), profileId: domainId<'AiProfileId'>() }),
])
export const robberCauseSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('DICE_SEVEN') }),
  z.strictObject({ type: z.literal('KNIGHT'), cardId: cardIdSchema }),
])
export const tradeOfferSchema = z.strictObject({
  tradeId: tradeIdSchema, initiatorId: playerIdSchema, counterpartyId: playerIdSchema,
  proposedById: playerIdSchema, initiatorGives: resourceBagSchema,
  counterpartyGives: resourceBagSchema, parentTradeId: tradeIdSchema.nullable(),
})
const die = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)])
const total = z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6),
  z.literal(7), z.literal(8), z.literal(9), z.literal(10), z.literal(11), z.literal(12)])
export const rollSchema = z.strictObject({ dice: z.tuple([die, die]), total })
  .refine((roll) => roll.dice[0] + roll.dice[1] === roll.total)
export const ratioSchema = z.union([z.literal(2), z.literal(3), z.literal(4)])
export const counterDepthSchema = z.union([z.literal(0), z.literal(1)])
export const oneOrTwoSchema = z.union([z.literal(1), z.literal(2)])
export const turnSchema = z.strictObject({
  turnNumber: integerSchema, currentPlayerId: playerIdSchema,
  phase: z.enum(['SETUP_SETTLEMENT', 'SETUP_ROAD', 'ROLL_REQUIRED', 'DISCARD_REQUIRED',
    'ROBBER_MOVE_REQUIRED', 'ROBBER_TARGET_REQUIRED', 'ACTION', 'FREE_ROAD_PLACEMENT', 'GAME_OVER']),
  setup: z.strictObject({ round: oneOrTwoSchema, placementIndex: integerSchema.max(3),
    pendingSettlementVertexId: vertexIdSchema.nullable() }).nullable(),
  lastRoll: rollSchema.nullable(), developmentCardPlayedThisTurn: z.boolean(),
})
const vertices = z.array(vertexIdSchema).max(54)
const edges = z.array(edgeIdSchema).max(72)
const tiles = z.array(tileIdSchema).max(19)
export const boardSchema = z.strictObject({
  generatorVersion: z.literal(BOARD_GENERATOR_VERSION),
  topology: z.strictObject({
    tiles: z.record(tileIdSchema, z.strictObject({
      id: tileIdSchema, coordinate: z.strictObject({ q: z.number().int(), r: z.number().int() }),
      vertexIds: z.tuple([vertexIdSchema, vertexIdSchema, vertexIdSchema, vertexIdSchema, vertexIdSchema, vertexIdSchema]),
      edgeIds: z.tuple([edgeIdSchema, edgeIdSchema, edgeIdSchema, edgeIdSchema, edgeIdSchema, edgeIdSchema]),
    })),
    vertices: z.record(vertexIdSchema, z.strictObject({
      id: vertexIdSchema, adjacentVertexIds: vertices, edgeIds: edges, tileIds: tiles,
    })),
    edges: z.record(edgeIdSchema, z.strictObject({
      id: edgeIdSchema, vertexIds: z.tuple([vertexIdSchema, vertexIdSchema]), tileIds: tiles, coastal: z.boolean(),
    })),
    ports: z.record(portIdSchema, z.strictObject({
      id: portIdSchema, edgeId: edgeIdSchema, vertexIds: z.tuple([vertexIdSchema, vertexIdSchema]),
      kind: z.discriminatedUnion('type', [z.strictObject({ type: z.literal('GENERIC') }),
        z.strictObject({ type: z.literal('RESOURCE'), resource: resourceSchema })]),
    })),
  }),
  tileContents: z.record(tileIdSchema, z.strictObject({
    terrain: z.enum(['FOREST', 'HILLS', 'PASTURE', 'FIELDS', 'MOUNTAINS', 'DESERT']),
    numberToken: z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6),
      z.literal(8), z.literal(9), z.literal(10), z.literal(11), z.literal(12)]).nullable(),
  })),
  vertexOccupancy: z.record(vertexIdSchema, z.discriminatedUnion('type', [
    z.strictObject({ type: z.literal('SETTLEMENT'), ownerId: playerIdSchema }),
    z.strictObject({ type: z.literal('CITY'), ownerId: playerIdSchema }),
  ]).nullable()),
  edgeOccupancy: z.record(edgeIdSchema, z.strictObject({ ownerId: playerIdSchema }).nullable()),
  robberTileId: tileIdSchema,
})
export const publicGameSchema = z.strictObject({
  gameId: gameIdSchema, stateVersion: integerSchema, rulesetId: z.literal(RULESET_ID),
  board: boardSchema,
  bank: z.strictObject({ resources: resourceBagSchema, developmentDeckCount: integerSchema.max(25) }),
  turn: turnSchema,
  awards: z.strictObject({ longestRoadHolderId: playerIdSchema.nullable(), largestArmyHolderId: playerIdSchema.nullable() }),
  winnerId: playerIdSchema.nullable(),
})
