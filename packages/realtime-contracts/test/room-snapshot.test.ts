import { describe, expect, it } from 'vitest'
import {
  deriveStartReadiness,
  REALTIME_PROTOCOL_VERSION,
  roomSeatsSchema,
  roomSnapshotSchema,
  type RoomSnapshot,
} from '../src/index.js'

function waitingRoom(): RoomSnapshot {
  const seats = [
    {
      seatId: 'NORTH',
      occupancy: 'HUMAN',
      displayName: 'Ada',
      ready: false,
      connectionStatus: 'CONNECTED',
    },
    { seatId: 'EAST', occupancy: 'EMPTY' },
    { seatId: 'SOUTH', occupancy: 'EMPTY' },
    { seatId: 'WEST', occupancy: 'EMPTY' },
  ] as const

  return roomSnapshotSchema.parse({
    protocolVersion: REALTIME_PROTOCOL_VERSION,
    roomCode: 'ABC234',
    revision: 0,
    lifecycleStatus: 'WAITING',
    hostSeatId: 'NORTH',
    seats,
    startReadiness: deriveStartReadiness(seats),
  })
}

describe('RoomSnapshot', () => {
  it('accepts a canonical waiting room and JSON round-trips it', () => {
    const snapshot = waitingRoom()
    expect(snapshot.startReadiness).toEqual({
      ready: false,
      blockers: ['SEATS_NOT_FULL', 'NOT_ENOUGH_HUMANS', 'HUMANS_NOT_READY'],
    })
    expect(roomSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
  })

  it('derives ready only for four occupied seats with two connected Ready Humans', () => {
    const seats = [
      {
        seatId: 'NORTH', occupancy: 'HUMAN', displayName: 'Ada', ready: true,
        connectionStatus: 'CONNECTED',
      },
      {
        seatId: 'EAST', occupancy: 'HUMAN', displayName: 'Grace', ready: true,
        connectionStatus: 'CONNECTED',
      },
      {
        seatId: 'SOUTH', occupancy: 'AI', profileId: 'BUILDER', ready: true,
        connectionStatus: 'CONNECTED',
      },
      {
        seatId: 'WEST', occupancy: 'AI', profileId: 'SENTINEL', ready: true,
        connectionStatus: 'CONNECTED',
      },
    ] as const

    expect(deriveStartReadiness(seats)).toEqual({ ready: true, blockers: [] })
  })

  it('rejects noncanonical order, impossible AI status, and a non-Human Host', () => {
    const snapshot = waitingRoom()
    const reversedSeats = [...snapshot.seats].reverse()
    expect(roomSnapshotSchema.safeParse({ ...snapshot, seats: reversedSeats }).success).toBe(false)

    const aiHostSeats = [
      {
        seatId: 'NORTH', occupancy: 'AI', profileId: 'MERCHANT', ready: false,
        connectionStatus: 'CONNECTED',
      },
      ...snapshot.seats.slice(1),
    ]
    expect(roomSnapshotSchema.safeParse({ ...snapshot, seats: aiHostSeats }).success).toBe(false)

    const validAiHostSeats = roomSeatsSchema.parse([
      {
        seatId: 'NORTH', occupancy: 'AI', profileId: 'MERCHANT', ready: true,
        connectionStatus: 'CONNECTED',
      },
      ...snapshot.seats.slice(1),
    ])
    expect(roomSnapshotSchema.safeParse({
      ...snapshot,
      seats: validAiHostSeats,
      startReadiness: deriveStartReadiness(validAiHostSeats),
    }).success).toBe(false)
  })

  it('rejects stale or forged derived start readiness', () => {
    const snapshot = waitingRoom()
    expect(roomSnapshotSchema.safeParse({
      ...snapshot,
      startReadiness: { ready: false, blockers: ['NOT_ENOUGH_HUMANS'] },
    }).success).toBe(false)
    expect(roomSnapshotSchema.safeParse({
      ...snapshot,
      startReadiness: { ready: true, blockers: [] },
    }).success).toBe(false)
  })

  it('contains no private credential or server implementation fields', () => {
    const snapshot = waitingRoom()
    const json = JSON.stringify(snapshot)
    for (const forbidden of [
      'ResumeToken',
      'resumeToken',
      'digest',
      'socketId',
      'socket.id',
      'ipAddress',
      'deadline',
      'timer',
      'GameState',
      'random',
    ]) {
      expect(json).not.toContain(forbidden)
    }

    for (const field of [
      'resumeToken',
      'tokenDigest',
      'socketId',
      'ipAddress',
      'reconnectDeadline',
      'gameState',
    ]) {
      expect(roomSnapshotSchema.safeParse({ ...snapshot, [field]: 'private' }).success).toBe(false)
    }
  })
})
