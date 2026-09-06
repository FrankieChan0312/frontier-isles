import { z } from 'zod'
import { REALTIME_PROTOCOL_VERSION } from './protocol-version.js'
import { roomCodeSchema, safeErrorSchema } from './domains.js'
import { gameIdSchema, commandIdSchema, integerSchema } from './game-values.js'
import { gameCommandSchema, ruleViolationCodeSchema } from './game-command.js'
import { playerViewSchema } from './game-view.js'
import { playerEventSchema } from './game-events.js'

const identity = {
  protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION), roomCode: roomCodeSchema, gameId: gameIdSchema,
}
export const gameCommandRequestSchema = z.strictObject({
  ...identity, commandId: commandIdSchema.refine((id) => !id.startsWith('server-ai:'), 'Reserved command namespace.'),
  expectedStateVersion: integerSchema, command: gameCommandSchema,
})
export const gameRequestSnapshotRequestSchema = z.strictObject(identity)
export const gameUpdateSchema = z.strictObject({
  ...identity, publicationRevision: integerSchema,
  lifecycleStatus: z.enum(['ACTIVE', 'FINISHED', 'ERROR']), aiThinking: z.boolean(),
  view: playerViewSchema, events: z.array(playerEventSchema).max(128),
}).superRefine((update, context) => {
  if (update.gameId !== update.view.publicGame.gameId
    || (update.lifecycleStatus === 'FINISHED') !== (update.view.publicGame.winnerId !== null)
    || (update.lifecycleStatus !== 'ACTIVE' && update.aiThinking)) {
    context.addIssue({ code: 'custom', message: 'Game identity and lifecycle must match the view.' })
  }
  const viewerId = update.view.self.id
  for (const event of update.events) {
    const privateDiscard = event.type === 'RESOURCES_DISCARDED'
      && event.playerId !== viewerId && event.resources !== null
    const privateTheft = event.type === 'RESOURCE_STOLEN' && event.fromPlayerId !== viewerId
      && event.toPlayerId !== viewerId && event.resource !== null
    const privateCard = event.type === 'DEVELOPMENT_CARD_BOUGHT' && event.ownerId !== viewerId
      && (event.cardId !== null || event.cardType !== null)
    const privateTrade = (event.type === 'TRADE_PROPOSED' || event.type === 'TRADE_COUNTERED')
      && event.initiatorId !== viewerId && event.counterpartyId !== viewerId && event.offer !== null
    if (privateDiscard || privateTheft || privateCard || privateTrade) {
      context.addIssue({ code: 'custom', message: 'Event contains information private to another viewer.' })
    }
  }
})
export const gameCommandResultSchema = z.discriminatedUnion('accepted', [
  z.strictObject({ accepted: z.literal(true), commandId: commandIdSchema, stateVersion: integerSchema }),
  z.strictObject({ accepted: z.literal(false), commandId: commandIdSchema, stateVersion: integerSchema,
    violation: z.strictObject({ code: ruleViolationCodeSchema }) }),
])
export const gameCommandAcknowledgementSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), data: gameCommandResultSchema }),
  z.strictObject({ ok: z.literal(false), error: safeErrorSchema }),
])
export const gameRequestSnapshotAcknowledgementSchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), data: gameUpdateSchema }),
  z.strictObject({ ok: z.literal(false), error: safeErrorSchema }),
])
export type GameCommandRequest = Readonly<z.infer<typeof gameCommandRequestSchema>>
export type GameRequestSnapshotRequest = Readonly<z.infer<typeof gameRequestSnapshotRequestSchema>>
export type GameUpdate = Readonly<z.infer<typeof gameUpdateSchema>>
export type GameCommandResult = Readonly<z.infer<typeof gameCommandResultSchema>>
export type GameCommandAcknowledgement = Readonly<z.infer<typeof gameCommandAcknowledgementSchema>>
export type GameRequestSnapshotAcknowledgement = Readonly<z.infer<typeof gameRequestSnapshotAcknowledgementSchema>>
