import { z } from 'zod'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import type { PlayerId } from '@frontier-isles/game-core/model/ids'
import { CANONICAL_SEAT_IDS, aiProfileIdSchema, connectionStatusSchema, displayNameSchema,
  epochDeadlineSchema, gameCommandResultSchema, gamePresenceSchema, integerSchema, playerIdSchema,
  roomCodeSchema, roomRevisionSchema, seatIdSchema, sessionIdSchema,
  type GameCommandResult, type GamePresence, type SessionId } from '@frontier-isles/realtime-contracts'
import type { GameSeat } from '../game/game-session.js'
import { persistedGameStateSchema } from './game-state-schema.js'

export const MULTIPLAYER_PERSISTENCE_VERSION = 1 as const
export const MAX_MULTIPLAYER_RECORD_BYTES = 2 * 1024 * 1024
const gameSeat = z.discriminatedUnion('occupancy', [
  z.strictObject({ occupancy: z.literal('HUMAN'), seatId: seatIdSchema, sessionId: sessionIdSchema, displayName: displayNameSchema }),
  z.strictObject({ occupancy: z.literal('AI'), seatId: seatIdSchema, profileId: aiProfileIdSchema }),
])
export interface PersistedCommandEntry {
  readonly fingerprint: string
  readonly result: GameCommandResult
}
export interface PersistedGame {
  readonly originalSeats: readonly GameSeat[]
  readonly state: GameState
  readonly publicationRevision: number
  readonly presence: GamePresence
  readonly cacheLimit: number
  readonly commandCache: readonly { readonly sessionId: SessionId; readonly entries: readonly PersistedCommandEntry[] }[]
  readonly aiCommandCount: number
  readonly turnIdentity: string
  readonly ownCommandKeys: readonly { readonly playerId: PlayerId; readonly keys: readonly string[] }[]
  readonly failed: boolean
}
export const persistedGameSchema: z.ZodType<PersistedGame> = z.strictObject({
  originalSeats: z.array(gameSeat).length(4), state: persistedGameStateSchema,
  publicationRevision: integerSchema, presence: gamePresenceSchema,
  cacheLimit: integerSchema.min(1).max(1024),
  commandCache: z.array(z.strictObject({ sessionId: sessionIdSchema,
    entries: z.array(z.strictObject({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/u), result: gameCommandResultSchema })).max(1024) })).max(4),
  aiCommandCount: integerSchema, turnIdentity: z.string().min(1).max(256),
  ownCommandKeys: z.array(z.strictObject({ playerId: playerIdSchema, keys: z.array(z.string().max(4096)).max(1024) })).max(4),
  failed: z.boolean(),
})
const roomSeat = z.discriminatedUnion('occupancy', [
  z.strictObject({ occupancy: z.literal('EMPTY'), seatId: seatIdSchema }),
  z.strictObject({ occupancy: z.literal('AI'), seatId: seatIdSchema, profileId: aiProfileIdSchema }),
  z.strictObject({ occupancy: z.literal('HUMAN'), seatId: seatIdSchema, sessionId: sessionIdSchema,
    displayName: displayNameSchema, ready: z.boolean(), connectionStatus: connectionStatusSchema,
    reconnectDeadlineMs: epochDeadlineSchema.nullable() }),
])
export const multiplayerRecordSchema = z.strictObject({
  persistenceVersion: z.literal(MULTIPLAYER_PERSISTENCE_VERSION), roomCode: roomCodeSchema,
  revision: roomRevisionSchema, hostSessionId: sessionIdSchema, seats: z.array(roomSeat).length(4),
  idleDeadlineMs: epochDeadlineSchema, abandonedDeadlineMs: epochDeadlineSchema.nullable(),
  sessions: z.array(z.strictObject({ sessionId: sessionIdSchema, seatId: seatIdSchema,
    resumeTokenDigest: z.string().regex(/^[A-Za-z0-9_-]{43}$/u), reconnectDeadlineMs: epochDeadlineSchema.nullable() })).max(4),
  game: persistedGameSchema.nullable(),
}).superRefine((record, context) => {
  const invalid = (): void => { context.addIssue({ code: 'custom', message: 'Multiplayer aggregate relationships failed.' }) }
  const unique = (values: readonly string[]): boolean => new Set(values).size === values.length
  if (record.seats.some((seat, index) => seat.seatId !== CANONICAL_SEAT_IDS[index])
    || !unique(record.sessions.map((session) => session.sessionId)) || !unique(record.sessions.map((session) => session.seatId))) invalid()
  const humans = record.seats.filter((seat) => seat.occupancy === 'HUMAN')
  if (!unique(humans.map((seat) => seat.sessionId)) || !humans.some((seat) => seat.sessionId === record.hostSessionId)
    || record.sessions.length === 0) invalid()
  for (const seat of humans) {
    const session = record.sessions.find((candidate) => candidate.sessionId === seat.sessionId)
    if ((seat.connectionStatus === 'CONNECTED') !== (seat.reconnectDeadlineMs === null)
      || (seat.connectionStatus === 'DISCONNECTED') !== (session === undefined)
      || (session !== undefined && (session.seatId !== seat.seatId || session.reconnectDeadlineMs !== seat.reconnectDeadlineMs))) invalid()
  }
  for (const session of record.sessions) if (!humans.some((seat) => seat.sessionId === session.sessionId && seat.seatId === session.seatId)) invalid()
  const game = record.game
  if (game === null) { if (record.abandonedDeadlineMs !== null || humans.some((seat) => seat.connectionStatus === 'DISCONNECTED')) invalid(); return }
  if (record.seats.some((seat) => seat.occupancy === 'EMPTY') || game.presence.lifecycleStatus === 'CLOSED'
    || game.presence.abandonedDeadlineMs !== record.abandonedDeadlineMs) invalid()
  const expectedLifecycle = game.state.winnerId !== null ? 'FINISHED' : game.failed ? 'ERROR'
    : humans.some((seat) => seat.connectionStatus === 'DISCONNECTED') ? 'PAUSED_REPLACEMENT_REQUIRED'
      : humans.some((seat) => seat.connectionStatus === 'RECONNECTING') ? 'PAUSED_RECONNECTING' : 'ACTIVE'
  if (game.presence.lifecycleStatus !== expectedLifecycle) invalid()
  const originalHumans = game.originalSeats.filter((seat) => seat.occupancy === 'HUMAN')
  if (originalHumans.length < 2 || !unique(originalHumans.map((seat) => seat.sessionId))) invalid()
  for (const [index, seat] of game.originalSeats.entries()) {
    const playerId = `player:${record.roomCode}:${seat.seatId}` as PlayerId
    const player = game.state.players[playerId]
    const current = record.seats[index]
    const replacement = game.presence.replacements.find((candidate) => candidate.seatId === seat.seatId)
    if (seat.seatId !== CANONICAL_SEAT_IDS[index] || player === undefined || current === undefined) { invalid(); continue }
    if (seat.occupancy === 'AI') {
      if (player.controller.type !== 'AI' || player.controller.profileId !== seat.profileId
        || current.occupancy !== 'AI' || current.profileId !== seat.profileId || replacement !== undefined) invalid()
    } else {
      if (player.controller.type !== 'HUMAN') invalid()
      if (replacement === undefined) {
        if (current.occupancy !== 'HUMAN' || current.sessionId !== seat.sessionId || current.displayName !== seat.displayName) invalid()
      } else if (current.occupancy !== 'AI' || current.profileId !== replacement.profileId) invalid()
    }
  }
  const disconnected = humans.filter((seat) => seat.connectionStatus !== 'CONNECTED')
  if (game.presence.disconnectedSeats.length !== disconnected.length) invalid()
  for (const presence of game.presence.disconnectedSeats) {
    const seat = disconnected.find((candidate) => candidate.seatId === presence.seatId)
    if (seat === undefined || presence.reconnectDeadlineMs !== seat.reconnectDeadlineMs
      || presence.replacementRequired !== (seat.connectionStatus === 'DISCONNECTED')) invalid()
  }
  if (!unique(game.commandCache.map((cache) => cache.sessionId)) || !unique(game.ownCommandKeys.map((entry) => entry.playerId))) invalid()
  for (const cache of game.commandCache) {
    if (!humans.some((seat) => seat.sessionId === cache.sessionId) || cache.entries.length > game.cacheLimit
      || !unique(cache.entries.map((entry) => entry.result.commandId))
      || cache.entries.some((entry) => entry.result.stateVersion > game.state.stateVersion)) invalid()
  }
  for (const entry of game.ownCommandKeys) if (!game.state.playerOrder.includes(entry.playerId)) invalid()
})
export type MultiplayerRecord = Readonly<z.infer<typeof multiplayerRecordSchema>>
