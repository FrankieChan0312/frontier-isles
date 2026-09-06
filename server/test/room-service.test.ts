import { describe, expect, it } from 'vitest'
import {
  resumeTokenSchema,
  roomCodeSchema,
  roomRevisionSchema,
  sessionIdSchema,
  type Acknowledgement,
} from '@frontier-isles/realtime-contracts'
import {
  createCryptoNetworkIdentifierGenerators,
  type NetworkIdentifierGenerators,
} from '../src/lobby/network-identifiers.js'
import { InMemoryRoomService } from '../src/lobby/room-service.js'

function sequenceValue(values: readonly string[], index: number, label: string): string {
  const value = values[index]
  if (value === undefined) throw new Error(`Missing deterministic ${label} at index ${index}.`)
  return value
}

function deterministicGenerators(
  roomCodes: readonly string[] = ['ABC234'],
  sessionIds: readonly string[] = [
    'session_000000001',
    'session_000000002',
    'session_000000003',
    'session_000000004',
  ],
): NetworkIdentifierGenerators {
  let roomIndex = 0
  let sessionIndex = 0
  let tokenIndex = 0
  return {
    nextRoomCode: () => roomCodeSchema.parse(sequenceValue(roomCodes, roomIndex++, 'RoomCode')),
    nextSessionId: () => sessionIdSchema.parse(
      sequenceValue(sessionIds, sessionIndex++, 'SessionId'),
    ),
    nextResumeToken: () => resumeTokenSchema.parse(
      String.fromCharCode(65 + tokenIndex++).repeat(43),
    ),
  }
}

function successData<T>(result: Acknowledgement<T>): T {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

describe('InMemoryRoomService', () => {
  it('creates revision zero with one NORTH Host and private credentials', () => {
    const service = new InMemoryRoomService({ generators: deterministicGenerators() })

    const data = successData(service.createRoom('Ada'))

    expect(data.credential).toMatchObject({ roomCode: 'ABC234', seatId: 'NORTH' })
    expect(data.credential.sessionId).toBe('session_000000001')
    expect(data.credential.resumeToken).toHaveLength(43)
    expect(data.snapshot).toMatchObject({
      roomCode: 'ABC234',
      revision: 0,
      hostSeatId: 'NORTH',
    })
    expect(data.snapshot.seats.map((seat) => [seat.seatId, seat.occupancy])).toEqual([
      ['NORTH', 'HUMAN'],
      ['EAST', 'EMPTY'],
      ['SOUTH', 'EMPTY'],
      ['WEST', 'EMPTY'],
    ])
    expect(JSON.stringify(data.snapshot)).not.toContain(data.credential.resumeToken)
    expect(service.roomCount).toBe(1)
  })

  it('joins Humans in canonical order and rejects normalized duplicate names', () => {
    const service = new InMemoryRoomService({ generators: deterministicGenerators() })
    const creator = successData(service.createRoom('Ada'))

    const joiner = successData(service.joinRoom(creator.credential.roomCode, 'Grace'))

    expect(joiner.credential.seatId).toBe('EAST')
    expect(joiner.snapshot.revision).toBe(1)
    expect(joiner.snapshot.seats[1]).toMatchObject({
      occupancy: 'HUMAN',
      displayName: 'Grace',
      ready: false,
    })
    const duplicate = service.joinRoom(creator.credential.roomCode, 'Grace')
    expect(duplicate).toMatchObject({ ok: false, error: { code: 'DISPLAY_NAME_TAKEN' } })
    expect(service.getSnapshot(creator.credential.roomCode)?.revision).toBe(1)
  })

  it('rejects unknown Rooms and a fifth Human without mutating a full Room', () => {
    const service = new InMemoryRoomService({ generators: deterministicGenerators() })
    expect(service.joinRoom(roomCodeSchema.parse('ZZZ999'), 'Grace')).toMatchObject({
      ok: false,
      error: { code: 'ROOM_NOT_FOUND' },
    })

    const creator = successData(service.createRoom('Ada'))
    successData(service.joinRoom(creator.credential.roomCode, 'Grace'))
    successData(service.joinRoom(creator.credential.roomCode, 'Linus'))
    const fullSnapshot = successData(service.joinRoom(creator.credential.roomCode, 'Margaret')).snapshot

    expect(service.joinRoom(creator.credential.roomCode, 'Edsger')).toMatchObject({
      ok: false,
      error: { code: 'ROOM_FULL' },
    })
    expect(service.getSnapshot(creator.credential.roomCode)).toEqual(fullSnapshot)
  })

  it('increments Ready changes once and treats a repeated value as an idempotent no-op', () => {
    const service = new InMemoryRoomService({ generators: deterministicGenerators() })
    const creator = successData(service.createRoom('Ada'))

    const changed = successData(service.setReady(
      creator.credential.sessionId,
      creator.snapshot.revision,
      true,
    ))
    expect(changed.changed).toBe(true)
    expect(changed.snapshot.revision).toBe(1)

    const noOp = successData(service.setReady(
      creator.credential.sessionId,
      changed.snapshot.revision,
      true,
    ))
    expect(noOp.changed).toBe(false)
    expect(noOp.snapshot.revision).toBe(1)

    const stale = service.setReady(
      creator.credential.sessionId,
      roomRevisionSchema.parse(0),
      false,
    )
    expect(stale).toMatchObject({ ok: false, error: { code: 'REVISION_CONFLICT' } })
  })

  it('lets only the Host assign AI and never overwrites a Human', () => {
    const service = new InMemoryRoomService({ generators: deterministicGenerators() })
    const creator = successData(service.createRoom('Ada'))
    const joiner = successData(service.joinRoom(creator.credential.roomCode, 'Grace'))

    const nonHost = service.setAiSeat(
      joiner.credential.sessionId,
      joiner.snapshot.revision,
      'SOUTH',
      'BUILDER',
    )
    expect(nonHost).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } })

    const humanSeat = service.setAiSeat(
      creator.credential.sessionId,
      joiner.snapshot.revision,
      'EAST',
      'MERCHANT',
    )
    expect(humanSeat).toMatchObject({ ok: false, error: { code: 'SEAT_UNAVAILABLE' } })

    const assigned = successData(service.setAiSeat(
      creator.credential.sessionId,
      joiner.snapshot.revision,
      'SOUTH',
      'BUILDER',
    ))
    expect(assigned.changed).toBe(true)
    expect(assigned.snapshot.revision).toBe(2)
    expect(assigned.snapshot.seats[2]).toEqual({
      seatId: 'SOUTH',
      occupancy: 'AI',
      profileId: 'BUILDER',
      ready: true,
      connectionStatus: 'CONNECTED',
    })

    const noOp = successData(service.setAiSeat(
      creator.credential.sessionId,
      assigned.snapshot.revision,
      'SOUTH',
      'BUILDER',
    ))
    expect(noOp.changed).toBe(false)
    expect(noOp.snapshot.revision).toBe(2)
  })

  it('derives future start readiness but always rejects room:start in Goal A', () => {
    const service = new InMemoryRoomService({ generators: deterministicGenerators() })
    const creator = successData(service.createRoom('Ada'))
    const joiner = successData(service.joinRoom(creator.credential.roomCode, 'Grace'))
    const south = successData(service.setAiSeat(
      creator.credential.sessionId,
      joiner.snapshot.revision,
      'SOUTH',
      'MERCHANT',
    ))
    const west = successData(service.setAiSeat(
      creator.credential.sessionId,
      south.snapshot.revision,
      'WEST',
      'SENTINEL',
    ))
    const creatorReady = successData(service.setReady(
      creator.credential.sessionId,
      west.snapshot.revision,
      true,
    ))
    const allReady = successData(service.setReady(
      joiner.credential.sessionId,
      creatorReady.snapshot.revision,
      true,
    ))

    expect(allReady.snapshot.startReadiness).toEqual({ ready: true, blockers: [] })
    expect(service.requestStart(
      creator.credential.sessionId,
      allReady.snapshot.revision,
    )).toMatchObject({ ok: true, data: { snapshot: { lifecycleStatus: 'ACTIVE' } } })
  })

  it('transfers Host on leave and closes the Room after the last Human leaves', () => {
    const service = new InMemoryRoomService({ generators: deterministicGenerators() })
    const creator = successData(service.createRoom('Ada'))
    const joiner = successData(service.joinRoom(creator.credential.roomCode, 'Grace'))

    const hostLeave = successData(service.leaveRoom(creator.credential.sessionId))
    expect(hostLeave.closed).toBe(false)
    expect(hostLeave.snapshot).toMatchObject({ revision: 2, hostSeatId: 'EAST' })
    expect(service.hasSession(creator.credential.sessionId)).toBe(false)

    const finalLeave = successData(service.leaveRoom(joiner.credential.sessionId))
    expect(finalLeave).toMatchObject({ closed: true, snapshot: null })
    expect(service.roomCount).toBe(0)
    expect(service.hasSession(joiner.credential.sessionId)).toBe(false)
  })

  it('bounds RoomCode collision retries and keeps rooms isolated', () => {
    const generators = deterministicGenerators(
      ['ABC234', 'DEF567', 'ABC234', 'ABC234'],
      ['session_000000001', 'session_000000002'],
    )
    const service = new InMemoryRoomService({ generators, maximumIdentifierAttempts: 2 })
    const first = successData(service.createRoom('Ada'))
    const second = successData(service.createRoom('Grace'))
    expect(first.snapshot.roomCode).toBe('ABC234')
    expect(second.snapshot.roomCode).toBe('DEF567')

    const exhausted = service.createRoom('Linus')
    expect(exhausted).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    expect(service.getSnapshot(first.credential.roomCode)?.revision).toBe(0)
    expect(service.getSnapshot(second.credential.roomCode)?.revision).toBe(0)
  })

  it('generates production identifiers with the frozen formats', () => {
    const generators = createCryptoNetworkIdentifierGenerators()
    expect(roomCodeSchema.safeParse(generators.nextRoomCode()).success).toBe(true)
    expect(sessionIdSchema.safeParse(generators.nextSessionId()).success).toBe(true)
    expect(resumeTokenSchema.safeParse(generators.nextResumeToken()).success).toBe(true)
  })
})
