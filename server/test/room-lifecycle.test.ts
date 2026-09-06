import { describe, expect, it } from 'vitest'
import {
  resumeTokenSchema,
  roomCodeSchema,
  sessionIdSchema,
  type Acknowledgement,
  type ResumeToken,
} from '@frontier-isles/realtime-contracts'
import type { NetworkIdentifierGenerators } from '../src/lobby/network-identifiers.js'
import { digestResumeToken, resumeTokenMatches } from '../src/lobby/resume-token-digest.js'
import {
  InMemoryRoomService,
  type RoomLifecycleEvent,
} from '../src/lobby/room-service.js'
import { FakeLifecycleRuntime } from './fake-lifecycle-runtime.js'

function sequenceValue(values: readonly string[], index: number, label: string): string {
  const value = values[index]
  if (value === undefined) throw new Error(`Missing deterministic ${label} at index ${index}.`)
  return value
}

function deterministicGenerators(): NetworkIdentifierGenerators {
  const sessionIds = [
    'session_000000001',
    'session_000000002',
    'session_000000003',
    'session_000000004',
  ]
  let roomIndex = 0
  let sessionIndex = 0
  let tokenIndex = 0
  return {
    nextRoomCode: () => roomCodeSchema.parse(sequenceValue(['ABC234'], roomIndex++, 'RoomCode')),
    nextSessionId: () => sessionIdSchema.parse(
      sequenceValue(sessionIds, sessionIndex++, 'SessionId'),
    ),
    nextResumeToken: () => resumeTokenSchema.parse(String.fromCharCode(65 + tokenIndex++).repeat(43)),
  }
}

function service(runtime: FakeLifecycleRuntime): InMemoryRoomService {
  return new InMemoryRoomService({
    generators: deterministicGenerators(),
    reconnectGraceMs: 100,
    roomIdleTtlMs: 1_000,
    runtime,
  })
}

function successData<T>(result: Acknowledgement<T>): T {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

describe('Room session lifecycle with fake time', () => {
  it('preserves Ready and Host during grace, then restores the same session and seat', () => {
    const runtime = new FakeLifecycleRuntime()
    const rooms = service(runtime)
    const creator = successData(rooms.createRoom('Ada'))
    const joiner = successData(rooms.joinRoom(creator.credential.roomCode, 'Grace'))
    const ready = successData(rooms.setReady(
      joiner.credential.sessionId,
      joiner.snapshot.revision,
      true,
    ))

    const disconnected = successData(rooms.markDisconnected(joiner.credential.sessionId))
    expect(disconnected.snapshot).toMatchObject({ hostSeatId: 'NORTH', revision: 3 })
    expect(disconnected.snapshot.seats[1]).toMatchObject({
      seatId: 'EAST',
      ready: true,
      connectionStatus: 'RECONNECTING',
    })
    expect(disconnected.snapshot.startReadiness.blockers).toContain('HUMANS_NOT_CONNECTED')

    runtime.advanceBy(99)
    const resumed = successData(rooms.resumeSession(joiner.credential))
    expect(resumed).toMatchObject({ changed: true, credential: joiner.credential })
    expect(resumed.snapshot).toMatchObject({ hostSeatId: 'NORTH', revision: 4 })
    expect(resumed.snapshot.seats[1]).toMatchObject({
      seatId: 'EAST',
      ready: true,
      connectionStatus: 'CONNECTED',
    })
    runtime.advanceBy(1)
    expect(rooms.hasSession(joiner.credential.sessionId)).toBe(true)
    expect(ready.snapshot.seats[1]).toMatchObject({ ready: true })
  })

  it('rejects an invalid token and removes an expired reconnecting Human exactly at deadline', () => {
    const runtime = new FakeLifecycleRuntime()
    const rooms = service(runtime)
    const events: RoomLifecycleEvent[] = []
    rooms.subscribeToLifecycle((event) => events.push(event))
    const creator = successData(rooms.createRoom('Ada'))
    const joiner = successData(rooms.joinRoom(creator.credential.roomCode, 'Grace'))
    successData(rooms.markDisconnected(joiner.credential.sessionId))
    const wrongToken = 'Z'.repeat(43) as ResumeToken

    expect(rooms.resumeSession({ ...joiner.credential, resumeToken: wrongToken })).toMatchObject({
      ok: false,
      error: { code: 'SESSION_INVALID' },
    })
    runtime.advanceBy(100)

    expect(rooms.hasSession(joiner.credential.sessionId)).toBe(false)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'SNAPSHOT_UPDATED', snapshot: { revision: 3 } })
    expect(rooms.resumeSession(joiner.credential)).toMatchObject({
      ok: false,
      error: { code: 'SESSION_INVALID' },
    })
  })

  it('does not transfer Host inside grace and transfers to the first Connected Human on expiry', () => {
    const runtime = new FakeLifecycleRuntime()
    const rooms = service(runtime)
    const events: RoomLifecycleEvent[] = []
    rooms.subscribeToLifecycle((event) => events.push(event))
    const creator = successData(rooms.createRoom('Ada'))
    const joiner = successData(rooms.joinRoom(creator.credential.roomCode, 'Grace'))
    const withAi = successData(rooms.setAiSeat(
      creator.credential.sessionId,
      joiner.snapshot.revision,
      'SOUTH',
      'SENTINEL',
    ))

    const grace = successData(rooms.markDisconnected(creator.credential.sessionId))
    expect(grace.snapshot).toMatchObject({ hostSeatId: 'NORTH', revision: 3 })
    runtime.advanceBy(100)

    const expiry = events.at(-1)
    expect(expiry).toMatchObject({
      type: 'SNAPSHOT_UPDATED',
      snapshot: { hostSeatId: 'EAST', revision: 4 },
    })
    if (expiry?.type !== 'SNAPSHOT_UPDATED') throw new Error('Expected an expiry snapshot.')
    expect(expiry.snapshot.seats[2]).toMatchObject({ occupancy: 'AI', profileId: 'SENTINEL' })
    expect(expiry.snapshot.hostSeatId).not.toBe('SOUTH')
    expect(withAi.snapshot.hostSeatId).toBe('NORTH')
  })

  it('closes after the last Human grace expires and invalidates the session', () => {
    const runtime = new FakeLifecycleRuntime()
    const rooms = service(runtime)
    const events: RoomLifecycleEvent[] = []
    rooms.subscribeToLifecycle((event) => events.push(event))
    const creator = successData(rooms.createRoom('Ada'))
    successData(rooms.markDisconnected(creator.credential.sessionId))

    runtime.advanceBy(100)

    expect(events).toEqual([{
      type: 'ROOM_CLOSED',
      roomCode: creator.credential.roomCode,
      reason: 'EMPTY',
    }])
    expect(rooms.roomCount).toBe(0)
    expect(rooms.hasSession(creator.credential.sessionId)).toBe(false)
  })

  it('resets idle expiry on accepted activity and then closes and invalidates all sessions', () => {
    const runtime = new FakeLifecycleRuntime()
    const rooms = service(runtime)
    const events: RoomLifecycleEvent[] = []
    rooms.subscribeToLifecycle((event) => events.push(event))
    const creator = successData(rooms.createRoom('Ada'))
    const joiner = successData(rooms.joinRoom(creator.credential.roomCode, 'Grace'))

    runtime.advanceBy(999)
    successData(rooms.requestSnapshot(joiner.credential.sessionId))
    runtime.advanceBy(999)
    expect(rooms.roomCount).toBe(1)
    runtime.advanceBy(1)

    expect(events).toEqual([{
      type: 'ROOM_CLOSED',
      roomCode: creator.credential.roomCode,
      reason: 'IDLE_TIMEOUT',
    }])
    expect(rooms.roomCount).toBe(0)
    expect(rooms.hasSession(creator.credential.sessionId)).toBe(false)
    expect(rooms.hasSession(joiner.credential.sessionId)).toBe(false)
  })
})

describe('resume token digest', () => {
  it('uses a one-way fixed-size digest and constant-time comparison helper', () => {
    const token = resumeTokenSchema.parse('A'.repeat(43))
    const other = resumeTokenSchema.parse('B'.repeat(43))
    const digest = digestResumeToken(token)

    expect(digest).toHaveLength(43)
    expect(digest).not.toBe(token)
    expect(resumeTokenMatches(token, digest)).toBe(true)
    expect(resumeTokenMatches(other, digest)).toBe(false)
  })
})
