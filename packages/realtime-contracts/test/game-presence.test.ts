import { describe, expect, it } from 'vitest'
import { gamePresenceSchema, roomReplaceHumanRequestSchema, roomCloseGameRequestSchema, REALTIME_PROTOCOL_VERSION } from '../src/index.js'

const active = { lifecycleStatus: 'ACTIVE', disconnectedSeats: [], replacements: [], abandonedDeadlineMs: null }
const reconnecting = { ...active, lifecycleStatus: 'PAUSED_RECONNECTING', disconnectedSeats: [{ seatId: 'EAST', reconnectDeadlineMs: 30_000, replacementRequired: false }] }
describe('public game presence and Host decision contracts', () => {
  it('accepts every coherent lifecycle and public presence shape', () => {
    for (const value of [active, reconnecting, { ...reconnecting, lifecycleStatus: 'PAUSED_REPLACEMENT_REQUIRED', abandonedDeadlineMs: 100_000,
      disconnectedSeats: [{ seatId: 'EAST', reconnectDeadlineMs: 30_000, replacementRequired: true }] },
      { ...active, replacements: [{ seatId: 'EAST', profileId: 'BUILDER' }] },
      ...['FINISHED', 'ERROR', 'CLOSED'].map((lifecycleStatus) => ({ ...active, lifecycleStatus }))]) {
      expect(gamePresenceSchema.safeParse(value).success).toBe(true)
    }
  })
  it('rejects private fields, contradictory lifecycle, duplicate seats and invalid deadlines', () => {
    for (const value of [{ ...active, sessionId: 'private' }, { ...active, state: {} }, { ...active, disconnectedSeats: reconnecting.disconnectedSeats },
      { ...reconnecting, disconnectedSeats: [] }, { ...reconnecting, lifecycleStatus: 'PAUSED_REPLACEMENT_REQUIRED' },
      { ...reconnecting, replacements: [{ seatId: 'EAST', profileId: 'BUILDER' }] },
      { ...reconnecting, disconnectedSeats: [...reconnecting.disconnectedSeats, ...reconnecting.disconnectedSeats] },
      ...[-1, 0.5, Number.POSITIVE_INFINITY].map((reconnectDeadlineMs) => ({ ...reconnecting, disconnectedSeats: [{ ...reconnecting.disconnectedSeats[0], reconnectDeadlineMs }] })),
      { ...reconnecting, disconnectedSeats: [{ ...reconnecting.disconnectedSeats[0], resources: {} }] }]) {
      expect(gamePresenceSchema.safeParse(value).success).toBe(false)
    }
  })
  it('strictly accepts only an explicit game, Room revision, seat and selected profile for replacement', () => {
    const close = { protocolVersion: REALTIME_PROTOCOL_VERSION, gameId: 'game:presence', expectedRevision: 8 }
    const replace = { ...close, seatId: 'EAST', profileId: 'SENTINEL' }
    expect(roomReplaceHumanRequestSchema.safeParse(replace).success).toBe(true)
    expect(roomCloseGameRequestSchema.safeParse(close).success).toBe(true)
    for (const extra of [{ sessionId: 'private' }, { actorId: 'spoof' }, { host: true }, { resources: {} }]) {
      expect(roomReplaceHumanRequestSchema.safeParse({ ...replace, ...extra }).success).toBe(false)
      expect(roomCloseGameRequestSchema.safeParse({ ...close, ...extra }).success).toBe(false)
    }
    for (const profileId of [null, 'UNKNOWN', undefined]) expect(roomReplaceHumanRequestSchema.safeParse({ ...replace, profileId }).success).toBe(false)
  })
})
