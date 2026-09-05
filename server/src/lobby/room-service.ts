import {
  CANONICAL_SEAT_IDS,
  REALTIME_PROTOCOL_VERSION,
  createSafeErrorAcknowledgement,
  deriveStartReadiness,
  displayNameSchema,
  roomRevisionSchema,
  roomSessionDataSchema,
  roomSnapshotSchema,
  type AiProfileId,
  type Acknowledgement,
  type ConnectionStatus,
  type ResumeToken,
  type RoomCode,
  type RoomLeaveData,
  type RoomRevision,
  type RoomSessionData,
  type RoomSnapshot,
  type RoomSnapshotData,
  type SafeError,
  type SeatId,
  type SessionCredential,
  type SessionId,
} from '@frontier-isles/realtime-contracts'
import {
  createCryptoNetworkIdentifierGenerators,
  type NetworkIdentifierGenerators,
} from './network-identifiers.js'

interface EmptyRoomSeat {
  readonly seatId: SeatId
  readonly occupancy: 'EMPTY'
}

interface HumanRoomSeat {
  readonly seatId: SeatId
  readonly occupancy: 'HUMAN'
  readonly sessionId: SessionId
  readonly displayName: string
  readonly ready: boolean
  readonly connectionStatus: ConnectionStatus
}

interface AiRoomSeat {
  readonly seatId: SeatId
  readonly occupancy: 'AI'
  readonly profileId: AiProfileId
}

type RoomSeat = EmptyRoomSeat | HumanRoomSeat | AiRoomSeat

interface RoomState {
  readonly roomCode: RoomCode
  revision: RoomRevision
  hostSessionId: SessionId
  seats: readonly RoomSeat[]
}

interface StoredSession {
  readonly sessionId: SessionId
  readonly resumeToken: ResumeToken
  readonly roomCode: RoomCode
  readonly seatId: SeatId
}

export interface RoomMutationData extends RoomSnapshotData {
  readonly changed: boolean
}

export interface RoomLeaveResult extends RoomLeaveData {
  readonly closed: boolean
  readonly snapshot: RoomSnapshot | null
}

export type RoomServiceResult<T> = Acknowledgement<T>

export interface InMemoryRoomServiceOptions {
  readonly generators?: NetworkIdentifierGenerators
  readonly maximumIdentifierAttempts?: number
}

const DEFAULT_MAXIMUM_IDENTIFIER_ATTEMPTS = 32

function emptySeats(): readonly EmptyRoomSeat[] {
  return CANONICAL_SEAT_IDS.map((seatId) => ({ seatId, occupancy: 'EMPTY' }))
}

function serviceFailure(code: SafeError['code'], message: string): { readonly ok: false; readonly error: SafeError } {
  return createSafeErrorAcknowledgement(code, message)
}

function incrementRevision(revision: RoomRevision): RoomRevision {
  return roomRevisionSchema.parse(revision + 1)
}

function replaceSeat(
  seats: readonly RoomSeat[],
  seatId: SeatId,
  replacement: RoomSeat,
): readonly RoomSeat[] {
  return seats.map((seat) => seat.seatId === seatId ? replacement : seat)
}

export class InMemoryRoomService {
  readonly #generators: NetworkIdentifierGenerators
  readonly #maximumIdentifierAttempts: number
  readonly #rooms = new Map<RoomCode, RoomState>()
  readonly #sessions = new Map<SessionId, StoredSession>()

  public constructor(options: InMemoryRoomServiceOptions = {}) {
    this.#generators = options.generators ?? createCryptoNetworkIdentifierGenerators()
    this.#maximumIdentifierAttempts = options.maximumIdentifierAttempts
      ?? DEFAULT_MAXIMUM_IDENTIFIER_ATTEMPTS
    if (!Number.isSafeInteger(this.#maximumIdentifierAttempts) || this.#maximumIdentifierAttempts < 1) {
      throw new Error('maximumIdentifierAttempts must be a positive safe integer.')
    }
  }

  public createRoom(displayName: string): RoomServiceResult<RoomSessionData> {
    const parsedName = displayNameSchema.safeParse(displayName)
    if (!parsedName.success) {
      return serviceFailure('INVALID_DISPLAY_NAME', 'Enter a valid display name.')
    }

    const roomCode = this.#nextUniqueRoomCode()
    if (roomCode === null) {
      return serviceFailure('INTERNAL_ERROR', 'Unable to create a room right now.')
    }
    const session = this.#nextUniqueSession(roomCode, 'NORTH')
    if (session === null) {
      return serviceFailure('INTERNAL_ERROR', 'Unable to create a room right now.')
    }

    const northSeat: HumanRoomSeat = {
      seatId: 'NORTH',
      occupancy: 'HUMAN',
      sessionId: session.sessionId,
      displayName: parsedName.data,
      ready: false,
      connectionStatus: 'CONNECTED',
    }
    const room: RoomState = {
      roomCode,
      revision: roomRevisionSchema.parse(0),
      hostSessionId: session.sessionId,
      seats: replaceSeat(emptySeats(), 'NORTH', northSeat),
    }
    this.#rooms.set(roomCode, room)
    this.#sessions.set(session.sessionId, session)

    return {
      ok: true,
      data: roomSessionDataSchema.parse({
        credential: this.#credential(session),
        snapshot: this.#snapshot(room),
      }),
    }
  }

  public joinRoom(roomCode: RoomCode, displayName: string): RoomServiceResult<RoomSessionData> {
    const room = this.#rooms.get(roomCode)
    if (room === undefined) return serviceFailure('ROOM_NOT_FOUND', 'Room not found.')

    const parsedName = displayNameSchema.safeParse(displayName)
    if (!parsedName.success) {
      return serviceFailure('INVALID_DISPLAY_NAME', 'Enter a valid display name.')
    }
    if (room.seats.some(
      (seat) => seat.occupancy === 'HUMAN' && seat.displayName === parsedName.data,
    )) {
      return serviceFailure('DISPLAY_NAME_TAKEN', 'That display name is already in this room.')
    }

    const availableSeat = room.seats.find((seat) => seat.occupancy === 'EMPTY')
    if (availableSeat === undefined) return serviceFailure('ROOM_FULL', 'This room is full.')

    const session = this.#nextUniqueSession(roomCode, availableSeat.seatId)
    if (session === null) {
      return serviceFailure('INTERNAL_ERROR', 'Unable to join the room right now.')
    }

    const humanSeat: HumanRoomSeat = {
      seatId: availableSeat.seatId,
      occupancy: 'HUMAN',
      sessionId: session.sessionId,
      displayName: parsedName.data,
      ready: false,
      connectionStatus: 'CONNECTED',
    }
    room.seats = replaceSeat(room.seats, availableSeat.seatId, humanSeat)
    room.revision = incrementRevision(room.revision)
    this.#sessions.set(session.sessionId, session)

    return {
      ok: true,
      data: roomSessionDataSchema.parse({
        credential: this.#credential(session),
        snapshot: this.#snapshot(room),
      }),
    }
  }

  public setReady(
    sessionId: SessionId,
    expectedRevision: RoomRevision,
    ready: boolean,
  ): RoomServiceResult<RoomMutationData> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    const revisionFailure = this.#checkRevision(membership.room, expectedRevision)
    if (revisionFailure !== null) return revisionFailure

    const seat = membership.room.seats.find((candidate) => candidate.seatId === membership.session.seatId)
    if (seat?.occupancy !== 'HUMAN' || seat.sessionId !== sessionId) {
      return serviceFailure('NOT_ROOM_MEMBER', 'Join a room before changing Ready state.')
    }

    if (seat.ready === ready) {
      return {
        ok: true,
        data: { changed: false, snapshot: this.#snapshot(membership.room) },
      }
    }

    membership.room.seats = replaceSeat(membership.room.seats, seat.seatId, { ...seat, ready })
    membership.room.revision = incrementRevision(membership.room.revision)
    return {
      ok: true,
      data: { changed: true, snapshot: this.#snapshot(membership.room) },
    }
  }

  public setAiSeat(
    sessionId: SessionId,
    expectedRevision: RoomRevision,
    seatId: SeatId,
    profileId: AiProfileId | null,
  ): RoomServiceResult<RoomMutationData> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    if (membership.room.hostSessionId !== sessionId) {
      return serviceFailure('NOT_HOST', 'Only the Host can manage AI seats.')
    }
    const revisionFailure = this.#checkRevision(membership.room, expectedRevision)
    if (revisionFailure !== null) return revisionFailure

    const seat = membership.room.seats.find((candidate) => candidate.seatId === seatId)
    if (seat === undefined || seat.occupancy === 'HUMAN') {
      return serviceFailure('SEAT_UNAVAILABLE', 'That seat is occupied by a Human.')
    }

    if (
      (seat.occupancy === 'EMPTY' && profileId === null)
      || (seat.occupancy === 'AI' && seat.profileId === profileId)
    ) {
      return {
        ok: true,
        data: { changed: false, snapshot: this.#snapshot(membership.room) },
      }
    }

    const replacement: EmptyRoomSeat | AiRoomSeat = profileId === null
      ? { seatId, occupancy: 'EMPTY' }
      : { seatId, occupancy: 'AI', profileId }
    membership.room.seats = replaceSeat(membership.room.seats, seatId, replacement)
    membership.room.revision = incrementRevision(membership.room.revision)
    return {
      ok: true,
      data: { changed: true, snapshot: this.#snapshot(membership.room) },
    }
  }

  public leaveRoom(sessionId: SessionId): RoomServiceResult<RoomLeaveResult> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership

    const { room, session } = membership
    room.seats = replaceSeat(room.seats, session.seatId, {
      seatId: session.seatId,
      occupancy: 'EMPTY',
    })
    room.revision = incrementRevision(room.revision)
    this.#sessions.delete(sessionId)

    const remainingHumans = room.seats.filter(
      (seat): seat is HumanRoomSeat => seat.occupancy === 'HUMAN',
    )
    if (remainingHumans.length === 0) {
      this.#rooms.delete(room.roomCode)
      return {
        ok: true,
        data: { roomCode: room.roomCode, closed: true, snapshot: null },
      }
    }

    if (room.hostSessionId === sessionId) {
      const nextHost = remainingHumans.find((seat) => seat.connectionStatus === 'CONNECTED')
      if (nextHost === undefined) {
        throw new Error('A waiting room with Human occupants must have a connected Host candidate.')
      }
      room.hostSessionId = nextHost.sessionId
    }

    return {
      ok: true,
      data: { roomCode: room.roomCode, closed: false, snapshot: this.#snapshot(room) },
    }
  }

  public requestSnapshot(sessionId: SessionId): RoomServiceResult<RoomSnapshotData> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    return { ok: true, data: { snapshot: this.#snapshot(membership.room) } }
  }

  public requestStart(
    sessionId: SessionId,
    expectedRevision: RoomRevision,
  ): RoomServiceResult<RoomSnapshotData> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    const revisionFailure = this.#checkRevision(membership.room, expectedRevision)
    if (revisionFailure !== null) return revisionFailure
    return serviceFailure(
      'GAME_START_NOT_AVAILABLE',
      'Online game start arrives in Milestone B.',
    )
  }

  public getSnapshot(roomCode: RoomCode): RoomSnapshot | null {
    const room = this.#rooms.get(roomCode)
    return room === undefined ? null : this.#snapshot(room)
  }

  public get roomCount(): number {
    return this.#rooms.size
  }

  public hasSession(sessionId: SessionId): boolean {
    return this.#sessions.has(sessionId)
  }

  #nextUniqueRoomCode(): RoomCode | null {
    for (let attempt = 0; attempt < this.#maximumIdentifierAttempts; attempt += 1) {
      const roomCode = this.#generators.nextRoomCode()
      if (!this.#rooms.has(roomCode)) return roomCode
    }
    return null
  }

  #nextUniqueSession(roomCode: RoomCode, seatId: SeatId): StoredSession | null {
    for (let attempt = 0; attempt < this.#maximumIdentifierAttempts; attempt += 1) {
      const sessionId = this.#generators.nextSessionId()
      if (this.#sessions.has(sessionId)) continue
      return {
        sessionId,
        resumeToken: this.#generators.nextResumeToken(),
        roomCode,
        seatId,
      }
    }
    return null
  }

  #credential(session: StoredSession): SessionCredential {
    return {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      resumeToken: session.resumeToken,
      roomCode: session.roomCode,
      seatId: session.seatId,
    }
  }

  #membership(sessionId: SessionId):
    | { readonly ok: true; readonly session: StoredSession; readonly room: RoomState }
    | { readonly ok: false; readonly error: SafeError } {
    const session = this.#sessions.get(sessionId)
    if (session === undefined) {
      return serviceFailure('NOT_ROOM_MEMBER', 'Join a room before using this action.')
    }
    const room = this.#rooms.get(session.roomCode)
    if (room === undefined) {
      this.#sessions.delete(sessionId)
      return serviceFailure('ROOM_CLOSED', 'This room is closed.')
    }
    return { ok: true, session, room }
  }

  #checkRevision(
    room: RoomState,
    expectedRevision: RoomRevision,
  ): { readonly ok: false; readonly error: SafeError } | null {
    if (room.revision === expectedRevision) return null
    return serviceFailure('REVISION_CONFLICT', 'The room changed. Refresh its snapshot and try again.')
  }

  #snapshot(room: RoomState): RoomSnapshot {
    const hostSeat = room.seats.find(
      (seat) => seat.occupancy === 'HUMAN' && seat.sessionId === room.hostSessionId,
    )
    if (hostSeat?.occupancy !== 'HUMAN') {
      throw new Error('Waiting Room invariant failed: Host must occupy a Human seat.')
    }

    const seats = room.seats.map((seat) => {
      if (seat.occupancy === 'EMPTY') return { seatId: seat.seatId, occupancy: 'EMPTY' as const }
      if (seat.occupancy === 'AI') {
        return {
          seatId: seat.seatId,
          occupancy: 'AI' as const,
          profileId: seat.profileId,
          ready: true as const,
          connectionStatus: 'CONNECTED' as const,
        }
      }
      return {
        seatId: seat.seatId,
        occupancy: 'HUMAN' as const,
        displayName: seat.displayName,
        ready: seat.ready,
        connectionStatus: seat.connectionStatus,
      }
    })

    return roomSnapshotSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomCode: room.roomCode,
      revision: room.revision,
      lifecycleStatus: 'WAITING',
      hostSeatId: hostSeat.seatId,
      seats,
      startReadiness: deriveStartReadiness(seats),
    })
  }
}
