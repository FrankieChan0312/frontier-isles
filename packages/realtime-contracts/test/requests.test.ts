import { describe, expect, it } from 'vitest'
import {
  CLIENT_EVENT_NAMES,
  CLIENT_REQUEST_SCHEMAS,
  REALTIME_PROTOCOL_VERSION,
  roomCreateRequestSchema,
  roomJoinRequestSchema,
  roomLeaveRequestSchema,
  roomRequestSnapshotRequestSchema,
  roomSetAiSeatRequestSchema,
  roomSetReadyRequestSchema,
  roomStartRequestSchema,
  sessionResumeRequestSchema,
} from '../src/index.js'

const version = REALTIME_PROTOCOL_VERSION

const validRequests = {
  'room:create': { protocolVersion: version, displayName: '  Ada   Lovelace ' },
  'room:join': { protocolVersion: version, displayName: 'Grace', roomCode: 'ABC234' },
  'room:set-ready': { protocolVersion: version, expectedRevision: 1, ready: true },
  'room:set-ai-seat': {
    protocolVersion: version,
    expectedRevision: 1,
    seatId: 'WEST',
    profileId: 'MERCHANT',
  },
  'room:leave': { protocolVersion: version },
  'room:request-snapshot': { protocolVersion: version },
  'session:resume': {
    protocolVersion: version,
    sessionId: 'session_123456789',
    resumeToken: 'a'.repeat(43),
    roomCode: 'ABC234',
    seatId: 'EAST',
  },
  'room:start': { protocolVersion: version, expectedRevision: 2 },
  'room:replace-human': { protocolVersion: version, gameId: 'game:test', expectedRevision: 2, seatId: 'EAST', profileId: 'BUILDER' },
  'room:close-game': { protocolVersion: version, gameId: 'game:test', expectedRevision: 2 },
  'game:command': { protocolVersion: version, roomCode: 'ABC234', gameId: 'game:test',
    commandId: 'command:test', expectedStateVersion: 0, command: { type: 'ROLL_DICE' } },
  'game:request-snapshot': { protocolVersion: version, roomCode: 'ABC234', gameId: 'game:test' },
} as const

describe('client request contracts', () => {
  it('preserves Goal A/B events and adds the explicit Goal C Host decisions', () => {
    expect(CLIENT_EVENT_NAMES).toEqual([
      'room:create',
      'room:join',
      'room:set-ready',
      'room:set-ai-seat',
      'room:leave',
      'room:request-snapshot',
      'session:resume',
      'room:start',
      'room:replace-human',
      'room:close-game',
      'game:command',
      'game:request-snapshot',
    ])
    expect(Object.isFrozen(CLIENT_REQUEST_SCHEMAS)).toBe(true)
    expect(Object.isFrozen(CLIENT_EVENT_NAMES)).toBe(true)
  })

  it('accepts every canonical request and normalizes names', () => {
    for (const eventName of CLIENT_EVENT_NAMES) {
      expect(CLIENT_REQUEST_SCHEMAS[eventName].safeParse(validRequests[eventName]).success).toBe(true)
    }
    expect(roomCreateRequestSchema.parse(validRequests['room:create']).displayName).toBe('Ada Lovelace')
  })

  it('rejects protocol mismatches and extra fields for every request', () => {
    for (const eventName of CLIENT_EVENT_NAMES) {
      const request = validRequests[eventName]
      expect(CLIENT_REQUEST_SCHEMAS[eventName].safeParse({
        ...request,
        protocolVersion: 'OLD_PROTOCOL',
      }).success).toBe(false)
      expect(CLIENT_REQUEST_SCHEMAS[eventName].safeParse({ ...request, actorId: 'spoofed' }).success)
        .toBe(false)
    }
  })

  it('rejects malformed event-specific fields', () => {
    expect(roomJoinRequestSchema.safeParse({
      ...validRequests['room:join'],
      roomCode: 'abc234',
    }).success).toBe(false)
    expect(roomSetReadyRequestSchema.safeParse({
      ...validRequests['room:set-ready'],
      expectedRevision: -1,
    }).success).toBe(false)
    expect(roomSetAiSeatRequestSchema.safeParse({
      ...validRequests['room:set-ai-seat'],
      seatId: 'CENTER',
    }).success).toBe(false)
    expect(roomSetAiSeatRequestSchema.safeParse({
      ...validRequests['room:set-ai-seat'],
      profileId: 'AGGRESSIVE',
    }).success).toBe(false)
    expect(sessionResumeRequestSchema.safeParse({
      ...validRequests['session:resume'],
      resumeToken: 'short',
    }).success).toBe(false)
    expect(roomStartRequestSchema.safeParse({
      ...validRequests['room:start'],
      expectedRevision: 1.5,
    }).success).toBe(false)
  })

  it('keeps leave and snapshot requests deliberately minimal', () => {
    expect(roomLeaveRequestSchema.parse({ protocolVersion: version })).toEqual({
      protocolVersion: version,
    })
    expect(roomRequestSnapshotRequestSchema.parse({ protocolVersion: version })).toEqual({
      protocolVersion: version,
    })
  })
})
