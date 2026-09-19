import { describe, expect, it } from 'vitest'
import {
  AI_PROFILE_IDS,
  CANONICAL_SEAT_IDS,
  CONNECTION_STATUSES,
  displayNameInputSchema,
  displayNameSchema,
  normalizeDisplayName,
  resumeTokenSchema,
  ROOM_CODE_ALPHABET,
  roomCodeSchema,
  roomRevisionSchema,
  SAFE_ERROR_CODES,
  safeErrorSchema,
  sessionIdSchema,
  START_READINESS_BLOCKER_CODES,
} from '../src/index.js'

describe('realtime protocol domains', () => {
  it('publishes frozen canonical literals', () => {
    expect(CANONICAL_SEAT_IDS).toEqual(['NORTH', 'EAST', 'SOUTH', 'WEST'])
    expect(AI_PROFILE_IDS).toEqual(['MERCHANT', 'BUILDER', 'SENTINEL'])
    expect(CONNECTION_STATUSES).toEqual(['CONNECTED', 'RECONNECTING', 'DISCONNECTED'])
    expect(START_READINESS_BLOCKER_CODES).toHaveLength(5)
    expect(SAFE_ERROR_CODES).toContain('GAME_START_NOT_AVAILABLE')
    expect(ROOM_CODE_ALPHABET).toBe('ABCDEFGHJKLMNPQRSTUVWXYZ23456789')
    expect(Object.isFrozen(CANONICAL_SEAT_IDS)).toBe(true)
    expect(Object.isFrozen(AI_PROFILE_IDS)).toBe(true)
  })

  it.each(['ABC234', 'ZZZ999', 'HJKLMN'])('accepts canonical RoomCode %s', (roomCode) => {
    expect(roomCodeSchema.parse(roomCode)).toBe(roomCode)
  })

  it.each([
    'abc234',
    'ABC23',
    'ABC2345',
    'ABCI01',
    'ABC-23',
    '',
  ])('rejects malformed RoomCode %j', (roomCode) => {
    expect(roomCodeSchema.safeParse(roomCode).success).toBe(false)
  })

  it('validates opaque session identifiers without interpreting them', () => {
    expect(sessionIdSchema.safeParse('session_123456789').success).toBe(true)
    expect(resumeTokenSchema.safeParse('a'.repeat(43)).success).toBe(true)
    expect(sessionIdSchema.safeParse('short').success).toBe(false)
    expect(resumeTokenSchema.safeParse('a'.repeat(42)).success).toBe(false)
    expect(resumeTokenSchema.safeParse('a'.repeat(42) + '+').success).toBe(false)
  })

  it.each([0, 1, Number.MAX_SAFE_INTEGER])('accepts RoomRevision %d', (revision) => {
    expect(roomRevisionSchema.parse(revision)).toBe(revision)
  })

  it.each([
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    Number.NaN,
  ])('rejects malformed RoomRevision %j', (revision) => {
    expect(roomRevisionSchema.safeParse(revision).success).toBe(false)
  })

  it('normalizes display names at input boundaries', () => {
    expect(normalizeDisplayName('  Ada\t  Lovelace  ')).toBe('Ada Lovelace')
    expect(displayNameInputSchema.parse('  Ada\t  Lovelace  ')).toBe('Ada Lovelace')
    expect(displayNameSchema.safeParse('Ada Lovelace').success).toBe(true)
    expect(displayNameSchema.safeParse(' Ada  Lovelace ').success).toBe(false)
  })

  it('counts display-name length by Unicode code points and rejects controls', () => {
    expect(displayNameInputSchema.safeParse('🏝️'.repeat(8)).success).toBe(true)
    expect(displayNameInputSchema.safeParse('a'.repeat(24)).success).toBe(true)
    expect(displayNameInputSchema.safeParse('a'.repeat(25)).success).toBe(false)
    expect(displayNameInputSchema.safeParse('Ada\u0000Lovelace').success).toBe(false)
    expect(displayNameInputSchema.safeParse('   ').success).toBe(false)
  })

  it('serializes only a safe error code and public message', () => {
    const error = safeErrorSchema.parse({ code: 'ROOM_NOT_FOUND', message: 'Room not found.' })
    expect(JSON.parse(JSON.stringify(error))).toEqual(error)
    expect(safeErrorSchema.safeParse({ ...error, stack: 'private trace' }).success).toBe(false)
    expect(safeErrorSchema.safeParse({ code: 'NOPE', message: 'No.' }).success).toBe(false)
    expect(safeErrorSchema.safeParse({ code: 'INTERNAL_ERROR', message: 'bad\ntrace' }).success)
      .toBe(false)
  })
})
