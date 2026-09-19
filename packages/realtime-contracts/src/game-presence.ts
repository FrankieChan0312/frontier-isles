import { z } from 'zod'
import { aiProfileIdSchema, seatIdSchema } from './domains.js'

export const gameLifecycleStatusSchema = z.enum([
  'ACTIVE', 'PAUSED_RECONNECTING', 'PAUSED_REPLACEMENT_REQUIRED', 'FINISHED', 'ERROR', 'CLOSED',
])
export const epochDeadlineSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const disconnectedSeatPresenceSchema = z.strictObject({
  seatId: seatIdSchema,
  reconnectDeadlineMs: epochDeadlineSchema,
  replacementRequired: z.boolean(),
})
export const gamePresenceSchema = z.strictObject({
  lifecycleStatus: gameLifecycleStatusSchema,
  disconnectedSeats: z.array(disconnectedSeatPresenceSchema).max(4),
  replacements: z.array(z.strictObject({ seatId: seatIdSchema, profileId: aiProfileIdSchema })).max(4),
  abandonedDeadlineMs: epochDeadlineSchema.nullable(),
}).superRefine((presence, context) => {
  const disconnected = presence.disconnectedSeats.map((seat) => seat.seatId)
  const replaced = presence.replacements.map((seat) => seat.seatId)
  if (new Set(disconnected).size !== disconnected.length || new Set(replaced).size !== replaced.length
    || disconnected.some((seat) => replaced.includes(seat))) {
    context.addIssue({ code: 'custom', message: 'Presence seats must be unique and disjoint.' })
  }
  const expired = presence.disconnectedSeats.some((seat) => seat.replacementRequired)
  if ((presence.lifecycleStatus === 'ACTIVE' && disconnected.length !== 0)
    || (presence.lifecycleStatus === 'PAUSED_RECONNECTING' && (disconnected.length === 0 || expired))
    || (presence.lifecycleStatus === 'PAUSED_REPLACEMENT_REQUIRED' && !expired)) {
    context.addIssue({ code: 'custom', message: 'Presence must match the online lifecycle.' })
  }
})
export type GameLifecycleStatus = z.infer<typeof gameLifecycleStatusSchema>
export type GamePresence = Readonly<z.infer<typeof gamePresenceSchema>>
export type DisconnectedSeatPresence = Readonly<z.infer<typeof disconnectedSeatPresenceSchema>>
