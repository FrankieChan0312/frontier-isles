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
  createSystemRoomLifecycleRuntime,
  type RoomLifecycleRuntime,
  type ScheduledLifecycleTask,
} from './lifecycle-runtime.js'
import {
  createCryptoNetworkIdentifierGenerators,
  type NetworkIdentifierGenerators,
} from './network-identifiers.js'
import { digestResumeToken, resumeTokenMatches } from './resume-token-digest.js'

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
  idleDeadlineMs: number
  idleTask: ScheduledLifecycleTask | null
}

interface StoredSession {
  readonly sessionId: SessionId
  readonly resumeTokenDigest: string
  readonly roomCode: RoomCode
  readonly seatId: SeatId
  reconnectDeadlineMs: number | null
  reconnectTask: ScheduledLifecycleTask | null
}

interface GeneratedSession {
  readonly resumeToken: ResumeToken
  readonly stored: StoredSession
}

export interface RoomMutationData extends RoomSnapshotData {
  readonly changed: boolean
}

export interface RoomResumeData extends RoomSessionData {
  readonly changed: boolean
}

export interface RoomLeaveResult extends RoomLeaveData {
  readonly closed: boolean
  readonly snapshot: RoomSnapshot | null
}

export type RoomServiceResult<T> = Acknowledgement<T>

export type RoomLifecycleEvent =
  | { readonly type: 'SNAPSHOT_UPDATED'; readonly snapshot: RoomSnapshot }
  | {
      readonly type: 'ROOM_CLOSED'
      readonly roomCode: RoomCode
      readonly reason: 'EMPTY' | 'IDLE_TIMEOUT'
    }

export type RoomLifecycleListener = (event: RoomLifecycleEvent) => void

export interface InMemoryRoomServiceOptions {
  readonly generators?: NetworkIdentifierGenerators
  readonly maximumIdentifierAttempts?: number
  readonly reconnectGraceMs?: number
  readonly roomIdleTtlMs?: number
  readonly runtime?: RoomLifecycleRuntime
}

const DEFAULT_MAXIMUM_IDENTIFIER_ATTEMPTS = 32
export const DEFAULT_RECONNECT_GRACE_MS = 30_000
export const DEFAULT_ROOM_IDLE_TTL_MS = 1_800_000

function emptySeats(): readonly EmptyRoomSeat[] {
  return CANONICAL_SEAT_IDS.map((seatId) => ({ seatId, occupancy: 'EMPTY' }))
}

function serviceFailure(code: SafeError['code'], message: string): {
  readonly ok: false
  readonly error: SafeError
} {
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

function validatePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer.`)
  }
  return value
}

export class InMemoryRoomService {
  readonly #generators: NetworkIdentifierGenerators
  readonly #maximumIdentifierAttempts: number
  readonly #reconnectGraceMs: number
  readonly #roomIdleTtlMs: number
  readonly #runtime: RoomLifecycleRuntime
  readonly #rooms = new Map<RoomCode, RoomState>()
  readonly #sessions = new Map<SessionId, StoredSession>()
  readonly #listeners = new Set<RoomLifecycleListener>()

  public constructor(options: InMemoryRoomServiceOptions = {}) {
    this.#generators = options.generators ?? createCryptoNetworkIdentifierGenerators()
    this.#maximumIdentifierAttempts = validatePositiveInteger(
      options.maximumIdentifierAttempts ?? DEFAULT_MAXIMUM_IDENTIFIER_ATTEMPTS,
      'maximumIdentifierAttempts',
    )
    this.#reconnectGraceMs = validatePositiveInteger(
      options.reconnectGraceMs ?? DEFAULT_RECONNECT_GRACE_MS,
      'reconnectGraceMs',
    )
    this.#roomIdleTtlMs = validatePositiveInteger(
      options.roomIdleTtlMs ?? DEFAULT_ROOM_IDLE_TTL_MS,
      'roomIdleTtlMs',
    )
    this.#runtime = options.runtime ?? createSystemRoomLifecycleRuntime()
  }

  public subscribeToLifecycle(listener: RoomLifecycleListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
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
    const generated = this.#nextUniqueSession(roomCode, 'NORTH')
    if (generated === null) {
      return serviceFailure('INTERNAL_ERROR', 'Unable to create a room right now.')
    }

    const room: RoomState = {
      roomCode,
      revision: roomRevisionSchema.parse(0),
      hostSessionId: generated.stored.sessionId,
      seats: replaceSeat(emptySeats(), 'NORTH', {
        seatId: 'NORTH',
        occupancy: 'HUMAN',
        sessionId: generated.stored.sessionId,
        displayName: parsedName.data,
        ready: false,
        connectionStatus: 'CONNECTED',
      }),
      idleDeadlineMs: 0,
      idleTask: null,
    }
    this.#rooms.set(roomCode, room)
    this.#sessions.set(generated.stored.sessionId, generated.stored)
    this.#touchRoom(room)

    return {
      ok: true,
      data: roomSessionDataSchema.parse({
        credential: this.#credential(generated.stored, generated.resumeToken),
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
    const generated = this.#nextUniqueSession(roomCode, availableSeat.seatId)
    if (generated === null) {
      return serviceFailure('INTERNAL_ERROR', 'Unable to join the room right now.')
    }

    room.seats = replaceSeat(room.seats, availableSeat.seatId, {
      seatId: availableSeat.seatId,
      occupancy: 'HUMAN',
      sessionId: generated.stored.sessionId,
      displayName: parsedName.data,
      ready: false,
      connectionStatus: 'CONNECTED',
    })
    room.revision = incrementRevision(room.revision)
    this.#sessions.set(generated.stored.sessionId, generated.stored)
    this.#touchRoom(room)

    return {
      ok: true,
      data: roomSessionDataSchema.parse({
        credential: this.#credential(generated.stored, generated.resumeToken),
        snapshot: this.#snapshot(room),
      }),
    }
  }

  public resumeSession(credential: SessionCredential): RoomServiceResult<RoomResumeData> {
    const session = this.#sessions.get(credential.sessionId)
    if (
      session === undefined
      || session.roomCode !== credential.roomCode
      || session.seatId !== credential.seatId
      || !resumeTokenMatches(credential.resumeToken, session.resumeTokenDigest)
    ) {
      return serviceFailure('SESSION_INVALID', 'This multiplayer session is invalid or expired.')
    }

    if (
      session.reconnectDeadlineMs !== null
      && this.#runtime.now() >= session.reconnectDeadlineMs
    ) {
      this.#expireDisconnectedSession(session.sessionId, session.reconnectDeadlineMs)
      return serviceFailure('SESSION_INVALID', 'This multiplayer session is invalid or expired.')
    }

    const membership = this.#membership(session.sessionId)
    if (!membership.ok) {
      return serviceFailure('SESSION_INVALID', 'This multiplayer session is invalid or expired.')
    }
    const seat = membership.room.seats.find((candidate) => candidate.seatId === session.seatId)
    if (seat?.occupancy !== 'HUMAN' || seat.sessionId !== session.sessionId) {
      return serviceFailure('SESSION_INVALID', 'This multiplayer session is invalid or expired.')
    }

    session.reconnectTask?.cancel()
    session.reconnectTask = null
    session.reconnectDeadlineMs = null
    const changed = seat.connectionStatus !== 'CONNECTED'
    if (changed) {
      membership.room.seats = replaceSeat(membership.room.seats, seat.seatId, {
        ...seat,
        connectionStatus: 'CONNECTED',
      })
      membership.room.revision = incrementRevision(membership.room.revision)
    }
    this.#touchRoom(membership.room)
    return {
      ok: true,
      data: {
        changed,
        credential: this.#credential(session, credential.resumeToken),
        snapshot: this.#snapshot(membership.room),
      },
    }
  }

  public markDisconnected(sessionId: SessionId): RoomServiceResult<RoomMutationData> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    const seat = membership.room.seats.find(
      (candidate) => candidate.seatId === membership.session.seatId,
    )
    if (seat?.occupancy !== 'HUMAN' || seat.sessionId !== sessionId) {
      return serviceFailure('NOT_ROOM_MEMBER', 'Join a room before using this action.')
    }
    if (seat.connectionStatus === 'RECONNECTING') {
      return { ok: true, data: { changed: false, snapshot: this.#snapshot(membership.room) } }
    }

    membership.room.seats = replaceSeat(membership.room.seats, seat.seatId, {
      ...seat,
      connectionStatus: 'RECONNECTING',
    })
    membership.room.revision = incrementRevision(membership.room.revision)
    const deadline = this.#runtime.now() + this.#reconnectGraceMs
    membership.session.reconnectTask?.cancel()
    membership.session.reconnectDeadlineMs = deadline
    membership.session.reconnectTask = this.#runtime.schedule(
      this.#reconnectGraceMs,
      () => this.#expireDisconnectedSession(sessionId, deadline),
    )
    return {
      ok: true,
      data: { changed: true, snapshot: this.#snapshot(membership.room) },
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
    const seat = membership.room.seats.find(
      (candidate) => candidate.seatId === membership.session.seatId,
    )
    if (
      seat?.occupancy !== 'HUMAN'
      || seat.sessionId !== sessionId
      || seat.connectionStatus !== 'CONNECTED'
    ) {
      return serviceFailure('NOT_ROOM_MEMBER', 'Resume the Room before changing Ready state.')
    }
    this.#touchRoom(membership.room)
    if (seat.ready === ready) {
      return { ok: true, data: { changed: false, snapshot: this.#snapshot(membership.room) } }
    }

    membership.room.seats = replaceSeat(membership.room.seats, seat.seatId, { ...seat, ready })
    membership.room.revision = incrementRevision(membership.room.revision)
    return { ok: true, data: { changed: true, snapshot: this.#snapshot(membership.room) } }
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
    this.#touchRoom(membership.room)
    if (
      (seat.occupancy === 'EMPTY' && profileId === null)
      || (seat.occupancy === 'AI' && seat.profileId === profileId)
    ) {
      return { ok: true, data: { changed: false, snapshot: this.#snapshot(membership.room) } }
    }

    const replacement: EmptyRoomSeat | AiRoomSeat = profileId === null
      ? { seatId, occupancy: 'EMPTY' }
      : { seatId, occupancy: 'AI', profileId }
    membership.room.seats = replaceSeat(membership.room.seats, seatId, replacement)
    membership.room.revision = incrementRevision(membership.room.revision)
    return { ok: true, data: { changed: true, snapshot: this.#snapshot(membership.room) } }
  }

  public leaveRoom(sessionId: SessionId): RoomServiceResult<RoomLeaveResult> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    const { room, session } = membership
    this.#removeSessionAndSeat(room, session)
    room.revision = incrementRevision(room.revision)
    const remainingHumans = this.#humanSeats(room)
    if (remainingHumans.length === 0) {
      this.#closeRoom(room)
      return { ok: true, data: { roomCode: room.roomCode, closed: true, snapshot: null } }
    }

    if (room.hostSessionId === sessionId) {
      const nextHost = remainingHumans.find((seat) => seat.connectionStatus === 'CONNECTED')
      if (nextHost === undefined) {
        this.#closeRoom(room)
        return { ok: true, data: { roomCode: room.roomCode, closed: true, snapshot: null } }
      }
      room.hostSessionId = nextHost.sessionId
    }
    this.#touchRoom(room)
    return {
      ok: true,
      data: { roomCode: room.roomCode, closed: false, snapshot: this.#snapshot(room) },
    }
  }

  public requestSnapshot(sessionId: SessionId): RoomServiceResult<RoomSnapshotData> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    this.#touchRoom(membership.room)
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
    return serviceFailure('GAME_START_NOT_AVAILABLE', 'Online game start arrives in Milestone B.')
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

  public dispose(): void {
    for (const room of this.#rooms.values()) room.idleTask?.cancel()
    for (const session of this.#sessions.values()) session.reconnectTask?.cancel()
    this.#listeners.clear()
  }

  #nextUniqueRoomCode(): RoomCode | null {
    for (let attempt = 0; attempt < this.#maximumIdentifierAttempts; attempt += 1) {
      const roomCode = this.#generators.nextRoomCode()
      if (!this.#rooms.has(roomCode)) return roomCode
    }
    return null
  }

  #nextUniqueSession(roomCode: RoomCode, seatId: SeatId): GeneratedSession | null {
    for (let attempt = 0; attempt < this.#maximumIdentifierAttempts; attempt += 1) {
      const sessionId = this.#generators.nextSessionId()
      if (this.#sessions.has(sessionId)) continue
      const resumeToken = this.#generators.nextResumeToken()
      return {
        resumeToken,
        stored: {
          sessionId,
          resumeTokenDigest: digestResumeToken(resumeToken),
          roomCode,
          seatId,
          reconnectDeadlineMs: null,
          reconnectTask: null,
        },
      }
    }
    return null
  }

  #credential(session: StoredSession, resumeToken: ResumeToken): SessionCredential {
    return {
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      sessionId: session.sessionId,
      resumeToken,
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

  #touchRoom(room: RoomState): void {
    room.idleTask?.cancel()
    const deadline = this.#runtime.now() + this.#roomIdleTtlMs
    room.idleDeadlineMs = deadline
    room.idleTask = this.#runtime.schedule(
      this.#roomIdleTtlMs,
      () => this.#expireIdleRoom(room.roomCode, deadline),
    )
  }

  #expireIdleRoom(roomCode: RoomCode, expectedDeadline: number): void {
    const room = this.#rooms.get(roomCode)
    if (room === undefined || room.idleDeadlineMs !== expectedDeadline) return
    const remaining = expectedDeadline - this.#runtime.now()
    if (remaining > 0) {
      room.idleTask = this.#runtime.schedule(
        remaining,
        () => this.#expireIdleRoom(roomCode, expectedDeadline),
      )
      return
    }
    this.#closeRoom(room)
    this.#emit({ type: 'ROOM_CLOSED', roomCode, reason: 'IDLE_TIMEOUT' })
  }

  #expireDisconnectedSession(sessionId: SessionId, expectedDeadline: number): void {
    const session = this.#sessions.get(sessionId)
    if (session === undefined || session.reconnectDeadlineMs !== expectedDeadline) return
    const remaining = expectedDeadline - this.#runtime.now()
    if (remaining > 0) {
      session.reconnectTask = this.#runtime.schedule(
        remaining,
        () => this.#expireDisconnectedSession(sessionId, expectedDeadline),
      )
      return
    }
    const room = this.#rooms.get(session.roomCode)
    if (room === undefined) {
      this.#sessions.delete(sessionId)
      return
    }

    this.#removeSessionAndSeat(room, session)
    room.revision = incrementRevision(room.revision)
    const remainingHumans = this.#humanSeats(room)
    if (remainingHumans.length === 0) {
      this.#closeRoom(room)
      this.#emit({ type: 'ROOM_CLOSED', roomCode: room.roomCode, reason: 'EMPTY' })
      return
    }
    if (room.hostSessionId === sessionId) {
      const nextHost = remainingHumans.find((seat) => seat.connectionStatus === 'CONNECTED')
      if (nextHost === undefined) {
        this.#closeRoom(room)
        this.#emit({ type: 'ROOM_CLOSED', roomCode: room.roomCode, reason: 'EMPTY' })
        return
      }
      room.hostSessionId = nextHost.sessionId
    }
    this.#touchRoom(room)
    this.#emit({ type: 'SNAPSHOT_UPDATED', snapshot: this.#snapshot(room) })
  }

  #removeSessionAndSeat(room: RoomState, session: StoredSession): void {
    session.reconnectTask?.cancel()
    this.#sessions.delete(session.sessionId)
    room.seats = replaceSeat(room.seats, session.seatId, {
      seatId: session.seatId,
      occupancy: 'EMPTY',
    })
  }

  #humanSeats(room: RoomState): readonly HumanRoomSeat[] {
    return room.seats.filter((seat): seat is HumanRoomSeat => seat.occupancy === 'HUMAN')
  }

  #closeRoom(room: RoomState): void {
    room.idleTask?.cancel()
    for (const seat of this.#humanSeats(room)) {
      const session = this.#sessions.get(seat.sessionId)
      session?.reconnectTask?.cancel()
      this.#sessions.delete(seat.sessionId)
    }
    this.#rooms.delete(room.roomCode)
  }

  #emit(event: RoomLifecycleEvent): void {
    for (const listener of this.#listeners) listener(event)
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
