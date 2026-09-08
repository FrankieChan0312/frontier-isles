import type { GameId } from '@frontier-isles/game-core/model/ids'
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
  type GameCommandRequest,
  type GameCommandAcknowledgement,
  type GameRequestSnapshotRequest,
  type GameRequestSnapshotAcknowledgement,
  type RoomClosedNotice,
  type DisconnectedSeatPresence,
} from '@frontier-isles/realtime-contracts'
import { createGameIdentity, type GameIdentity } from '../game/game-entropy.js'
import { GameSession, type GamePublication, type GameSeat, type GameSessionDependencies } from '../game/game-session.js'
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
import { InMemoryMultiplayerRepository, PersistenceError, type MultiplayerRepository, type PersistenceDiagnostic } from '../persistence/multiplayer-repository.js'
import { MULTIPLAYER_PERSISTENCE_VERSION, type MultiplayerRecord } from '../persistence/multiplayer-record.js'
import { canonicalJson } from '../persistence/canonical-json.js'
import { MAX_ROOMS } from '../security/network-limits.js'

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
  readonly reconnectDeadlineMs: number | null
}

interface AiRoomSeat {
  readonly seatId: SeatId
  readonly occupancy: 'AI'
  readonly profileId: AiProfileId
}

type RoomSeat = EmptyRoomSeat | HumanRoomSeat | AiRoomSeat

interface RoomState {
  game: GameSession | null
  readonly roomCode: RoomCode
  revision: RoomRevision
  hostSessionId: SessionId
  seats: readonly RoomSeat[]
  idleDeadlineMs: number
  idleTask: ScheduledLifecycleTask | null
  abandonedDeadlineMs: number | null
  abandonedTask: ScheduledLifecycleTask | null
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
      readonly reason: RoomClosedNotice['reason']
    }

export type RoomLifecycleListener = (event: RoomLifecycleEvent) => void

export interface InMemoryRoomServiceOptions {
  readonly nextGameIdentity?: () => GameIdentity
  readonly gameDependencies?: GameSessionDependencies
  readonly generators?: NetworkIdentifierGenerators
  readonly maximumIdentifierAttempts?: number
  readonly reconnectGraceMs?: number
  readonly roomIdleTtlMs?: number
  readonly gameAbandonedTtlMs?: number
  readonly runtime?: RoomLifecycleRuntime
  readonly repository?: MultiplayerRepository
  readonly restartRecoveryGraceMs?: number
  readonly onPersistenceDiagnostic?: (diagnostic: PersistenceDiagnostic) => void
}

const DEFAULT_MAXIMUM_IDENTIFIER_ATTEMPTS = 32
export const DEFAULT_RECONNECT_GRACE_MS = 30_000
export const DEFAULT_ROOM_IDLE_TTL_MS = 1_800_000
export const DEFAULT_GAME_ABANDONED_TTL_MS = 1_800_000
export const DEFAULT_RESTART_RECOVERY_GRACE_MS = 120_000

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
  readonly #nextGameIdentity: () => GameIdentity
  readonly #gameDependencies: GameSessionDependencies
  readonly #gameListeners = new Set<(publication: GamePublication) => void>()
  readonly #generators: NetworkIdentifierGenerators
  readonly #maximumIdentifierAttempts: number
  readonly #reconnectGraceMs: number
  readonly #roomIdleTtlMs: number
  readonly #gameAbandonedTtlMs: number
  readonly #runtime: RoomLifecycleRuntime
  readonly #rooms = new Map<RoomCode, RoomState>()
  readonly #sessions = new Map<SessionId, StoredSession>()
  readonly #listeners = new Set<RoomLifecycleListener>()
  #disposed = false
  #stopping = false
  readonly #repository: MultiplayerRepository
  readonly #restartRecoveryGraceMs: number
  readonly #onPersistenceDiagnostic: (diagnostic: PersistenceDiagnostic) => void
  readonly #committedRecords = new Map<RoomCode, string>()

  public constructor(options: InMemoryRoomServiceOptions = {}) {
    this.#nextGameIdentity = options.nextGameIdentity ?? createGameIdentity
    this.#gameDependencies = options.gameDependencies ?? {}
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
    this.#gameAbandonedTtlMs = validatePositiveInteger(options.gameAbandonedTtlMs ?? DEFAULT_GAME_ABANDONED_TTL_MS, 'gameAbandonedTtlMs')
    this.#runtime = options.runtime ?? createSystemRoomLifecycleRuntime()
    this.#repository = options.repository ?? new InMemoryMultiplayerRepository()
    this.#restartRecoveryGraceMs = validatePositiveInteger(options.restartRecoveryGraceMs ?? DEFAULT_RESTART_RECOVERY_GRACE_MS, 'restartRecoveryGraceMs')
    this.#onPersistenceDiagnostic = options.onPersistenceDiagnostic ?? (() => {})
    try { this.#recover(this.#repository.load()) } catch {
      this.dispose()
      throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
    }
  }

  #safely<T>(operation: () => RoomServiceResult<T>): RoomServiceResult<T> {
    if (this.#stopping || this.#disposed) return serviceFailure('GAME_UNAVAILABLE', 'The multiplayer server is unavailable. Resume shortly.')
    try { return operation() } catch {
      this.dispose()
      return serviceFailure('INTERNAL_ERROR', 'The server could not complete the request.')
    }
  }

  public createRoom(displayName: string): RoomServiceResult<RoomSessionData> {
    // Preserve the established disposal response for callers that have already detached.
    if (this.#disposed) return serviceFailure('ROOM_CLOSED', 'The multiplayer service is closing.')
    return this.#safely(() => this.#createRoom(displayName))
  }
  public joinRoom(roomCode: RoomCode, displayName: string): RoomServiceResult<RoomSessionData> {
    return this.#safely(() => this.#joinRoom(roomCode, displayName))
  }
  public resumeSession(credential: SessionCredential): RoomServiceResult<RoomResumeData> {
    return this.#safely(() => this.#resumeSession(credential))
  }
  public markDisconnected(sessionId: SessionId): RoomServiceResult<RoomMutationData> {
    return this.#safely(() => this.#markDisconnected(sessionId))
  }
  public setReady(sessionId: SessionId, revision: RoomRevision, ready: boolean): RoomServiceResult<RoomMutationData> {
    return this.#safely(() => this.#setReady(sessionId, revision, ready))
  }
  public setAiSeat(sessionId: SessionId, revision: RoomRevision, seatId: SeatId, profileId: AiProfileId | null): RoomServiceResult<RoomMutationData> {
    return this.#safely(() => this.#setAiSeat(sessionId, revision, seatId, profileId))
  }
  public leaveRoom(sessionId: SessionId): RoomServiceResult<RoomLeaveResult> { return this.#safely(() => this.#leaveRoom(sessionId)) }
  public requestSnapshot(sessionId: SessionId): RoomServiceResult<RoomSnapshotData> { return this.#safely(() => this.#requestSnapshot(sessionId)) }
  public requestStart(sessionId: SessionId, revision: RoomRevision): RoomServiceResult<RoomSnapshotData> { return this.#safely(() => this.#requestStart(sessionId, revision)) }
  public closeActiveGame(sessionId: SessionId, gameId: GameId, revision: RoomRevision): RoomServiceResult<RoomLeaveData> {
    return this.#safely(() => this.#closeActiveGame(sessionId, gameId, revision))
  }

  public subscribeToLifecycle(listener: RoomLifecycleListener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #createRoom(displayName: string): RoomServiceResult<RoomSessionData> {
    if (this.#disposed) return serviceFailure('ROOM_CLOSED', 'The multiplayer service is closing.')
    if (this.#rooms.size >= MAX_ROOMS) return serviceFailure('SERVER_BUSY', 'The server has reached its Room limit. Try again later.')
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
      game: null,
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
        reconnectDeadlineMs: null,
      }),
      idleDeadlineMs: 0,
      idleTask: null,
      abandonedDeadlineMs: null,
      abandonedTask: null,
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

  #joinRoom(roomCode: RoomCode, displayName: string): RoomServiceResult<RoomSessionData> {
    const room = this.#rooms.get(roomCode)
    if (room === undefined) return serviceFailure('ROOM_NOT_FOUND', 'Room not found.')
    if (room.game !== null) return serviceFailure('ROOM_NOT_WAITING', 'This room has already started.')
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
      reconnectDeadlineMs: null,
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

  #resumeSession(credential: SessionCredential): RoomServiceResult<RoomResumeData> {
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
        reconnectDeadlineMs: null,
      })
      membership.room.revision = incrementRevision(membership.room.revision)
    }
    this.#transferExpiredHost(membership.room)
    this.#synchronizeGamePresence(membership.room)
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

  #markDisconnected(sessionId: SessionId): RoomServiceResult<RoomMutationData> {
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

    const deadline = this.#runtime.now() + this.#reconnectGraceMs
    membership.room.seats = replaceSeat(membership.room.seats, seat.seatId, {
      ...seat,
      connectionStatus: 'RECONNECTING',
      reconnectDeadlineMs: deadline,
    })
    membership.room.revision = incrementRevision(membership.room.revision)
    membership.session.reconnectTask?.cancel()
    membership.session.reconnectDeadlineMs = deadline
    membership.session.reconnectTask = this.#schedule(
      this.#reconnectGraceMs,
      () => this.#expireDisconnectedSession(sessionId, deadline),
    )
    this.#synchronizeGamePresence(membership.room)
    return {
      ok: true,
      data: { changed: true, snapshot: this.#snapshot(membership.room) },
    }
  }

  #setReady(
    sessionId: SessionId,
    expectedRevision: RoomRevision,
    ready: boolean,
  ): RoomServiceResult<RoomMutationData> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    if (membership.room.game !== null) return serviceFailure('ROOM_NOT_WAITING', 'Ready state is fixed after game start.')
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

  #setAiSeat(
    sessionId: SessionId,
    expectedRevision: RoomRevision,
    seatId: SeatId,
    profileId: AiProfileId | null,
  ): RoomServiceResult<RoomMutationData> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    if (membership.room.game !== null) return serviceFailure('ROOM_NOT_WAITING', 'Seats are fixed after game start.')
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

  #leaveRoom(sessionId: SessionId): RoomServiceResult<RoomLeaveResult> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    const { room, session } = membership
    if (room.game !== null) return serviceFailure('ROOM_NOT_WAITING', 'Game seats cannot be removed after start.')
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

  #requestSnapshot(sessionId: SessionId): RoomServiceResult<RoomSnapshotData> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    this.#touchRoom(membership.room)
    return { ok: true, data: { snapshot: this.#snapshot(membership.room) } }
  }

  #requestStart(
    sessionId: SessionId,
    expectedRevision: RoomRevision,
  ): RoomServiceResult<RoomSnapshotData> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    const { room } = membership
    if (room.hostSessionId !== sessionId) return serviceFailure('NOT_HOST', 'Only the Host can start the game.')
    if (room.game !== null) return serviceFailure('ROOM_NOT_WAITING', 'This room has already started.')
    const revisionFailure = this.#checkRevision(membership.room, expectedRevision)
    if (revisionFailure !== null) return revisionFailure
    if (!this.#snapshot(room, false).startReadiness.ready) {
      return serviceFailure('START_CONDITIONS_NOT_MET', 'Fill all seats and have every connected Human ready up.')
    }
    const seats: GameSeat[] = []
    for (const seat of room.seats) {
      if (seat.occupancy === 'EMPTY') return serviceFailure('START_CONDITIONS_NOT_MET', 'Fill every seat before starting.')
      if (seat.occupancy === 'HUMAN') {
        const session = this.#sessions.get(seat.sessionId)
        if (session?.roomCode !== room.roomCode || session.seatId !== seat.seatId) {
          return serviceFailure('START_CONDITIONS_NOT_MET', 'Room membership must be restored before starting.')
        }
      }
      seats.push(seat)
    }
    try {
      const identity = this.#nextGameIdentity()
      const game = new GameSession(room.roomCode, identity.gameId, seats, identity.seed,
        { ...this.#gameDependencies, commit: () => this.#persist(room) })
      this.#subscribeGame(room, game)
      room.game = game
      room.revision = incrementRevision(room.revision)
      room.idleTask?.cancel()
      room.idleTask = null
      return { ok: true, data: { snapshot: this.#snapshot(room) } }
    } catch {
      return serviceFailure('INTERNAL_ERROR', 'The server could not start the game.')
    }
  }

  public subscribeToGames(listener: (publication: GamePublication) => void): () => void {
    this.#gameListeners.add(listener)
    return () => this.#gameListeners.delete(listener)
  }

  public async replaceExpiredHuman(
    hostSessionId: SessionId,
    gameId: GameId,
    expectedRevision: RoomRevision,
    seatId: SeatId,
    profileId: AiProfileId,
    isTransportCurrent: () => boolean = () => true,
  ): Promise<RoomServiceResult<RoomSnapshotData>> {
    try { return await this.#replaceExpiredHuman(hostSessionId, gameId, expectedRevision, seatId, profileId, isTransportCurrent) }
    catch { return serviceFailure('INTERNAL_ERROR', 'The server could not complete the request.') }
  }

  async #replaceExpiredHuman(
    hostSessionId: SessionId, gameId: GameId, expectedRevision: RoomRevision, seatId: SeatId,
    profileId: AiProfileId, isTransportCurrent: () => boolean,
  ): Promise<RoomServiceResult<RoomSnapshotData>> {
    const authority = this.#replacementAuthority(hostSessionId, gameId, expectedRevision)
    if (!authority.ok) return authority
    const { room, game } = authority
    const target = room.seats.find((seat) => seat.seatId === seatId)
    if (target?.occupancy !== 'HUMAN' || target.connectionStatus !== 'DISCONNECTED') {
      return serviceFailure('REPLACEMENT_NOT_AVAILABLE', 'Only a Human seat whose reconnect grace has expired can be replaced.')
    }
    let refusal: SafeError | null = null
    const result = await game.replaceHuman(target.sessionId, profileId, () => {
      const current = this.#replacementAuthority(hostSessionId, gameId, expectedRevision)
      if (!isTransportCurrent()) { refusal = { code: 'NOT_HOST', message: 'Resume the authoritative Host session before replacing a seat.' }; return false }
      if (!current.ok) { refusal = current.error; return false }
      return current.room === room && current.game === game
    }, () => {
      room.seats = replaceSeat(room.seats, target.seatId, { seatId: target.seatId, occupancy: 'AI', profileId })
      room.revision = incrementRevision(room.revision)
      this.#synchronizeGamePresence(room)
      this.#emit({ type: 'SNAPSHOT_UPDATED', snapshot: this.#snapshot(room) })
    })
    if (result === 'BUSY') return serviceFailure('GAME_BUSY', 'The game is busy. Retry the replacement shortly.')
    if (result === 'NOT_AUTHORIZED') return { ok: false, error: refusal ?? { code: 'NOT_HOST', message: 'Only the connected Host can replace this seat.' } }
    if (result !== 'REPLACED') return serviceFailure('REPLACEMENT_NOT_AVAILABLE', 'This seat no longer requires replacement.')
    if (this.#rooms.get(room.roomCode) !== room) return serviceFailure('ROOM_CLOSED', 'This online game has closed.')
    return { ok: true, data: { snapshot: this.#snapshot(room) } }
  }

  #closeActiveGame(hostSessionId: SessionId, gameId: GameId, expectedRevision: RoomRevision): RoomServiceResult<RoomLeaveData> {
    const authority = this.#replacementAuthority(hostSessionId, gameId, expectedRevision)
    if (!authority.ok) return authority
    const roomCode = authority.room.roomCode
    this.#closeRoom(authority.room)
    return { ok: true, data: { roomCode } }
  }

  #replacementAuthority(hostSessionId: SessionId, gameId: GameId, expectedRevision: RoomRevision):
    | { readonly ok: true; readonly room: RoomState; readonly game: GameSession }
    | { readonly ok: false; readonly error: SafeError } {
    const membership = this.#membership(hostSessionId)
    if (!membership.ok) return membership
    const { room } = membership
    const host = this.#humanSeats(room).find((seat) => seat.sessionId === hostSessionId)
    if (room.hostSessionId !== hostSessionId || host?.connectionStatus !== 'CONNECTED') return serviceFailure('NOT_HOST', 'Only the connected Host can make this decision.')
    if (room.game === null || room.game.gameId !== gameId) return serviceFailure('GAME_NOT_FOUND', 'This online game is unavailable.')
    const revisionFailure = this.#checkRevision(room, expectedRevision)
    if (revisionFailure !== null) return revisionFailure
    if (room.game.lifecycleStatus !== 'PAUSED_REPLACEMENT_REQUIRED') return serviceFailure('REPLACEMENT_NOT_AVAILABLE', 'Wait until the server confirms that a Human reconnect grace has expired.')
    return { ok: true, room, game: room.game }
  }

  public getGameSession(roomCode: RoomCode): GameSession | null {
    return this.#rooms.get(roomCode)?.game ?? null
  }

  public async submitGameCommand(
    sessionId: SessionId,
    request: GameCommandRequest,
    isTransportCurrent: () => boolean = () => true,
  ): Promise<GameCommandAcknowledgement> {
    const authority = this.#gameAuthority(sessionId, request)
    if (!authority.ok) return authority
    try {
      return await authority.data.dispatchHuman(sessionId, request, () => {
        const current = this.#gameAuthority(sessionId, request)
        return isTransportCurrent() && current.ok && current.data === authority.data
      })
    } catch { return serviceFailure('INTERNAL_ERROR', 'The server could not complete the request.') }
  }

  public requestGameSnapshot(sessionId: SessionId, request: GameRequestSnapshotRequest): GameRequestSnapshotAcknowledgement {
    const authority = this.#gameAuthority(sessionId, request)
    return authority.ok ? { ok: true, data: authority.data.snapshot(sessionId) } : authority
  }

  #gameAuthority(sessionId: SessionId, identity: GameRequestSnapshotRequest): RoomServiceResult<GameSession> {
    const membership = this.#membership(sessionId)
    if (!membership.ok) return membership
    const { room, session } = membership
    const seat = room.seats.find((candidate) => candidate.seatId === session.seatId)
    if (seat?.occupancy !== 'HUMAN' || seat.sessionId !== sessionId || seat.connectionStatus !== 'CONNECTED') {
      return serviceFailure('NOT_ROOM_MEMBER', 'Resume your Human seat before playing.')
    }
    if (room.roomCode !== identity.roomCode || room.game?.gameId !== identity.gameId
      || room.game.playerForSession(sessionId) !== room.game.playerForSeat(seat.seatId)) {
      return serviceFailure('GAME_NOT_FOUND', 'This game is unavailable for your session.')
    }
    return { ok: true, data: room.game }
  }

  public getSnapshot(roomCode: RoomCode): RoomSnapshot | null {
    const room = this.#rooms.get(roomCode)
    return room === undefined ? null : this.#snapshot(room, false)
  }

  public get roomCount(): number {
    return this.#rooms.size
  }

  public get isReady(): boolean { return !this.#stopping && !this.#disposed }
  /** No identity, payload or path is exposed; used only by local verification. */
  public resources(): Readonly<Record<'rooms' | 'sessions' | 'listeners' | 'timers' | 'records', number>> {
    return { rooms: this.#rooms.size, sessions: this.#sessions.size, listeners: this.#listeners.size + this.#gameListeners.size,
      records: this.#committedRecords.size, timers: [...this.#rooms.values()].reduce((sum, room) => sum
        + (room.idleTask === null ? 0 : 1) + (room.abandonedTask === null ? 0 : 1), 0)
        + [...this.#sessions.values()].filter((session) => session.reconnectTask !== null).length }
  }

  public hasSession(sessionId: SessionId): boolean {
    return this.#sessions.has(sessionId)
  }

  public dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    for (const room of this.#rooms.values()) { room.idleTask?.cancel(); room.abandonedTask?.cancel(); room.game?.close() }
    for (const session of this.#sessions.values()) session.reconnectTask?.cancel()
    this.#sessions.clear()
    this.#rooms.clear()
    this.#listeners.clear()
    this.#gameListeners.clear()
    this.#committedRecords.clear()
  }

  public async shutdown(): Promise<void> {
    if (this.#disposed) { this.#repository.close(); return }
    this.#stopping = true
    const games = [...this.#rooms.values()].flatMap((room) => room.game === null ? [] : [room.game])
    for (const room of this.#rooms.values()) { room.idleTask?.cancel(); room.abandonedTask?.cancel() }
    for (const session of this.#sessions.values()) session.reconnectTask?.cancel()
    for (const game of games) game.stop()
    await Promise.all(games.map((game) => game.drain()))
    this.#repository.flush()
  }
  public closeRepository(): void { this.#repository.close() }

  #persistenceFailed(): never {
    this.#onPersistenceDiagnostic({ code: 'PERSISTENCE_WRITE_FAILED' })
    this.dispose()
    throw new PersistenceError('PERSISTENCE_WRITE_FAILED')
  }

  #persist(room: RoomState): void {
    if (this.#disposed) throw new PersistenceError('PERSISTENCE_WRITE_FAILED')
    if (room.game?.lifecycleStatus === 'FINISHED' && room.abandonedDeadlineMs === null) {
      this.#scheduleGameCleanup(room)
      this.#synchronizeGamePresence(room, false)
    }
    const record: MultiplayerRecord = {
      persistenceVersion: MULTIPLAYER_PERSISTENCE_VERSION, roomCode: room.roomCode,
      revision: room.revision, hostSessionId: room.hostSessionId, seats: structuredClone([...room.seats]),
      idleDeadlineMs: room.idleDeadlineMs, abandonedDeadlineMs: room.abandonedDeadlineMs,
      sessions: CANONICAL_SEAT_IDS.flatMap((seatId) => {
        const seat = room.seats.find((candidate) => candidate.seatId === seatId)
        const session = seat?.occupancy === 'HUMAN' ? this.#sessions.get(seat.sessionId) : undefined
        return session === undefined ? [] : [{ sessionId: session.sessionId, seatId,
          resumeTokenDigest: session.resumeTokenDigest, reconnectDeadlineMs: session.reconnectDeadlineMs }]
      }),
      game: room.game?.exportPersistence() ?? null,
    }
    try {
      const serialized = canonicalJson(record)
      if (this.#committedRecords.get(room.roomCode) === serialized) return
      this.#repository.save(record)
      this.#committedRecords.set(room.roomCode, serialized)
    } catch { this.#persistenceFailed() }
  }

  #runLifecycle(operation: () => void): void {
    if (this.#stopping || this.#disposed) return
    try { operation() } catch {
      if (!this.#disposed) { this.#onPersistenceDiagnostic({ code: 'PERSISTENCE_WRITE_FAILED' }); this.dispose() }
    }
  }
  #schedule(delay: number, operation: () => void): ScheduledLifecycleTask {
    return this.#runtime.schedule(delay, () => this.#runLifecycle(operation))
  }

  #subscribeGame(room: RoomState, game: GameSession): void {
    let finishedPublished = game.lifecycleStatus === 'FINISHED'
    game.subscribe((publication) => {
      if (publication.update.lifecycleStatus === 'FINISHED' && !finishedPublished) {
        finishedPublished = true
        queueMicrotask(() => this.#runLifecycle(() => {
          if (this.#rooms.get(room.roomCode) !== room) return
          room.revision = incrementRevision(room.revision)
          this.#emit({ type: 'SNAPSHOT_UPDATED', snapshot: this.#snapshot(room) })
        }))
      }
      for (const listener of this.#gameListeners) listener(publication)
    })
  }

  #recover(records: readonly MultiplayerRecord[]): void {
    if (records.length > MAX_ROOMS) throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
    const now = this.#runtime.now()
    for (const record of records) {
      if ((record.game === null && record.idleDeadlineMs <= now)
        || (record.abandonedDeadlineMs !== null && record.abandonedDeadlineMs <= now)) {
        this.#repository.remove(record.roomCode)
        continue
      }
      if (record.sessions.some((session) => this.#sessions.has(session.sessionId))) throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
      const room: RoomState = { roomCode: record.roomCode, revision: record.revision,
        hostSessionId: record.hostSessionId, seats: structuredClone(record.seats), game: null,
        idleDeadlineMs: record.idleDeadlineMs, idleTask: null,
        abandonedDeadlineMs: record.abandonedDeadlineMs, abandonedTask: null }
      this.#rooms.set(room.roomCode, room)
      for (const saved of record.sessions) {
        const deadline = saved.reconnectDeadlineMs ?? now + this.#restartRecoveryGraceMs
        const session: StoredSession = { ...saved, roomCode: record.roomCode, reconnectDeadlineMs: deadline, reconnectTask: null }
        this.#sessions.set(session.sessionId, session)
        room.seats = room.seats.map((seat) => seat.occupancy === 'HUMAN' && seat.sessionId === session.sessionId
          ? { ...seat, connectionStatus: 'RECONNECTING', reconnectDeadlineMs: deadline } : seat)
        session.reconnectTask = this.#schedule(Math.max(1, deadline - now), () => this.#expireDisconnectedSession(session.sessionId, deadline))
      }
      if (record.game !== null) {
        room.game = GameSession.restore(record.roomCode, record.game, { ...this.#gameDependencies, commit: () => this.#persist(room) })
        this.#subscribeGame(room, room.game)
        this.#synchronizeGamePresence(room)
      } else room.idleTask = this.#schedule(room.idleDeadlineMs - now, () => this.#expireIdleRoom(room.roomCode, room.idleDeadlineMs))
      if (room.abandonedDeadlineMs !== null && room.abandonedTask === null) {
        const deadline = room.abandonedDeadlineMs
        room.abandonedTask = this.#schedule(deadline - now, () => this.#expireAbandonedGame(room.roomCode, deadline))
      }
      for (const saved of record.sessions) {
        const session = this.#sessions.get(saved.sessionId)
        if (session?.reconnectDeadlineMs !== null && session?.reconnectDeadlineMs !== undefined && session.reconnectDeadlineMs <= now) {
          this.#expireDisconnectedSession(session.sessionId, session.reconnectDeadlineMs)
        }
      }
      if (this.#rooms.has(room.roomCode)) this.#persist(room)
    }
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
    if (this.#stopping || this.#disposed) return serviceFailure('GAME_UNAVAILABLE', 'The multiplayer server is unavailable. Resume shortly.')
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
    if (room.game !== null) { room.idleTask = null; return }
    const deadline = this.#runtime.now() + this.#roomIdleTtlMs
    room.idleDeadlineMs = deadline
    room.idleTask = this.#schedule(
      this.#roomIdleTtlMs,
      () => this.#expireIdleRoom(room.roomCode, deadline),
    )
  }

  #expireIdleRoom(roomCode: RoomCode, expectedDeadline: number): void {
    const room = this.#rooms.get(roomCode)
    if (room === undefined || room.game !== null || room.idleDeadlineMs !== expectedDeadline) return
    const remaining = expectedDeadline - this.#runtime.now()
    if (remaining > 0) {
      room.idleTask = this.#schedule(
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
      session.reconnectTask = this.#schedule(
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

    if (room.game !== null) {
      session.reconnectTask?.cancel()
      this.#sessions.delete(sessionId)
      room.seats = room.seats.map((seat) => seat.occupancy === 'HUMAN' && seat.sessionId === sessionId
        ? { ...seat, connectionStatus: 'DISCONNECTED' } : seat)
      room.revision = incrementRevision(room.revision)
      if (!this.#humanSeats(room).some((seat) => this.#sessions.has(seat.sessionId))) {
        this.#closeRoom(room)
        this.#emit({ type: 'ROOM_CLOSED', roomCode: room.roomCode, reason: 'EMPTY' })
        return
      }
      this.#transferExpiredHost(room)
      this.#scheduleGameCleanup(room)
      this.#synchronizeGamePresence(room)
      this.#emit({ type: 'SNAPSHOT_UPDATED', snapshot: this.#snapshot(room) })
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
    try { this.#repository.remove(room.roomCode) } catch { this.#persistenceFailed() }
    this.#committedRecords.delete(room.roomCode)
    room.idleTask?.cancel()
    room.abandonedTask?.cancel()
    room.game?.close()
    for (const seat of this.#humanSeats(room)) {
      const session = this.#sessions.get(seat.sessionId)
      session?.reconnectTask?.cancel()
      this.#sessions.delete(seat.sessionId)
    }
    this.#rooms.delete(room.roomCode)
  }

  #transferExpiredHost(room: RoomState): void {
    if (room.game === null || this.#sessions.has(room.hostSessionId)) return
    const next = this.#humanSeats(room).find((seat) => seat.connectionStatus === 'CONNECTED')
    if (next !== undefined) room.hostSessionId = next.sessionId
  }

  #synchronizeGamePresence(room: RoomState, publish = true): void {
    if (room.game === null) return
    const disconnected: DisconnectedSeatPresence[] = this.#humanSeats(room).flatMap((seat) => {
      if (seat.connectionStatus === 'CONNECTED') return []
      if (seat.reconnectDeadlineMs === null) throw new Error('Disconnected Human requires an authoritative deadline.')
      return [{ seatId: seat.seatId, reconnectDeadlineMs: seat.reconnectDeadlineMs,
        replacementRequired: seat.connectionStatus === 'DISCONNECTED' }]
    })
    if (!disconnected.some((seat) => seat.replacementRequired) && room.game.lifecycleStatus !== 'FINISHED') {
      room.abandonedTask?.cancel()
      room.abandonedTask = null
      room.abandonedDeadlineMs = null
    }
    room.game.setPresence(disconnected, room.abandonedDeadlineMs, publish)
  }

  #scheduleGameCleanup(room: RoomState): void {
    if (room.abandonedDeadlineMs !== null) return
    const deadline = this.#runtime.now() + this.#gameAbandonedTtlMs
    room.abandonedDeadlineMs = deadline
    room.abandonedTask = this.#schedule(this.#gameAbandonedTtlMs, () => this.#expireAbandonedGame(room.roomCode, deadline))
  }

  #expireAbandonedGame(roomCode: RoomCode, expectedDeadline: number): void {
    const room = this.#rooms.get(roomCode)
    if (room?.game === null || room === undefined || room.abandonedDeadlineMs !== expectedDeadline) return
    const remaining = expectedDeadline - this.#runtime.now()
    if (remaining > 0) {
      room.abandonedTask = this.#schedule(remaining, () => this.#expireAbandonedGame(roomCode, expectedDeadline))
      return
    }
    this.#closeRoom(room)
    this.#emit({ type: 'ROOM_CLOSED', roomCode, reason: 'ABANDONED_TIMEOUT' })
  }

  #emit(event: RoomLifecycleEvent): void {
    for (const listener of this.#listeners) listener(event)
  }

  #snapshot(room: RoomState, commit = true): RoomSnapshot {
    if (commit) this.#persist(room)
    const lifecycleStatus = room.game === null ? 'WAITING'
      : room.game.lifecycleStatus === 'FINISHED' ? 'FINISHED' : 'ACTIVE'
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
      lifecycleStatus,
      ...(room.game === null ? {} : { gameId: room.game.gameId, gamePresence: room.game.presenceSnapshot }),
      hostSeatId: hostSeat.seatId,
      seats,
      startReadiness: deriveStartReadiness(seats, lifecycleStatus),
    })
  }
}
