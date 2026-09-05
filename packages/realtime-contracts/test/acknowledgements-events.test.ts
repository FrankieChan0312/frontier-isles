import { describe, expect, it } from 'vitest'
import {
  CLIENT_EVENT_NAMES,
  createSafeErrorAcknowledgement,
  REALTIME_PROTOCOL_VERSION,
  roomClosedNoticeSchema,
  roomCreateAcknowledgementSchema,
  roomJoinAcknowledgementSchema,
  roomLeaveAcknowledgementSchema,
  roomRequestSnapshotAcknowledgementSchema,
  roomSetAiSeatAcknowledgementSchema,
  roomSetReadyAcknowledgementSchema,
  roomSnapshotSchema,
  roomStartAcknowledgementSchema,
  SERVER_EVENT_NAMES,
  SERVER_EVENT_SCHEMAS,
  serverHelloSchema,
  sessionCredentialSchema,
  sessionReplacedNoticeSchema,
  sessionResumeAcknowledgementSchema,
  type ClientToServerEvents,
  type ServerToClientEvents,
} from '../src/index.js'

function validSnapshot() {
  return roomSnapshotSchema.parse({
    protocolVersion: REALTIME_PROTOCOL_VERSION,
    roomCode: 'ABC234',
    revision: 1,
    lifecycleStatus: 'WAITING',
    hostSeatId: 'NORTH',
    seats: [
      {
        seatId: 'NORTH', occupancy: 'HUMAN', displayName: 'Ada', ready: false,
        connectionStatus: 'CONNECTED',
      },
      { seatId: 'EAST', occupancy: 'EMPTY' },
      { seatId: 'SOUTH', occupancy: 'EMPTY' },
      { seatId: 'WEST', occupancy: 'EMPTY' },
    ],
    startReadiness: {
      ready: false,
      blockers: ['SEATS_NOT_FULL', 'NOT_ENOUGH_HUMANS', 'HUMANS_NOT_READY'],
    },
  })
}

function validCredential() {
  return sessionCredentialSchema.parse({
    protocolVersion: REALTIME_PROTOCOL_VERSION,
    sessionId: 'session_123456789',
    resumeToken: 'a'.repeat(43),
    roomCode: 'ABC234',
    seatId: 'NORTH',
  })
}

describe('acknowledgement and server-event contracts', () => {
  it('validates every success acknowledgement', () => {
    const snapshot = validSnapshot()
    const sessionData = { credential: validCredential(), snapshot }
    const snapshotData = { snapshot }
    const cases = [
      [roomCreateAcknowledgementSchema, { ok: true, data: sessionData }],
      [roomJoinAcknowledgementSchema, { ok: true, data: sessionData }],
      [roomSetReadyAcknowledgementSchema, { ok: true, data: snapshotData }],
      [roomSetAiSeatAcknowledgementSchema, { ok: true, data: snapshotData }],
      [roomLeaveAcknowledgementSchema, { ok: true, data: { roomCode: 'ABC234' } }],
      [roomRequestSnapshotAcknowledgementSchema, { ok: true, data: snapshotData }],
      [sessionResumeAcknowledgementSchema, { ok: true, data: sessionData }],
      [roomStartAcknowledgementSchema, { ok: true, data: snapshotData }],
    ] as const

    for (const [schema, acknowledgement] of cases) {
      expect(schema.safeParse(acknowledgement).success).toBe(true)
    }
  })

  it('validates public-safe failures and rejects extra/private fields', () => {
    const failure = createSafeErrorAcknowledgement('ROOM_NOT_FOUND', 'Room not found.')
    expect(roomJoinAcknowledgementSchema.parse(failure)).toEqual(failure)
    expect(roomJoinAcknowledgementSchema.safeParse({
      ...failure,
      stack: 'private',
    }).success).toBe(false)
    expect(roomJoinAcknowledgementSchema.safeParse({
      ok: false,
      error: { ...failure.error, resumeToken: 'secret' },
    }).success).toBe(false)
  })

  it('keeps private credentials in session results and out of RoomSnapshot', () => {
    const credential = validCredential()
    const snapshot = validSnapshot()
    expect(JSON.stringify(credential)).toContain('resumeToken')
    expect(JSON.stringify(snapshot)).not.toContain('resumeToken')
  })

  it('validates the complete frozen server event inventory', () => {
    expect(SERVER_EVENT_NAMES).toEqual([
      'server:hello',
      'room:snapshot',
      'session:replaced',
      'room:closed',
      'server:error',
    ])
    expect(Object.isFrozen(SERVER_EVENT_SCHEMAS)).toBe(true)
    expect(serverHelloSchema.safeParse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      service: 'frontier-isles-realtime',
    }).success).toBe(true)
    expect(sessionReplacedNoticeSchema.safeParse({
      code: 'SESSION_REPLACED',
      message: 'This session continued in a newer tab.',
    }).success).toBe(true)
    expect(roomClosedNoticeSchema.safeParse({
      roomCode: 'ABC234',
      reason: 'IDLE_TIMEOUT',
      message: 'Room closed after inactivity.',
    }).success).toBe(true)
  })

  it('compiles complete typed Socket.IO event maps', () => {
    const clientEvents: ReadonlyArray<keyof ClientToServerEvents> = CLIENT_EVENT_NAMES
    const serverEvents: ReadonlyArray<keyof ServerToClientEvents> = SERVER_EVENT_NAMES
    expect(clientEvents).toHaveLength(8)
    expect(serverEvents).toHaveLength(5)
  })
})
