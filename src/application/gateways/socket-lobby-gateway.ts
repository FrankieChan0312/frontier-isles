import { io as createSocket, type Socket } from 'socket.io-client'
import {
  REALTIME_PROTOCOL_VERSION,
  displayNameInputSchema,
  roomClosedNoticeSchema,
  roomCreateAcknowledgementSchema,
  roomCreateRequestSchema,
  roomJoinAcknowledgementSchema,
  roomJoinRequestSchema,
  roomLeaveAcknowledgementSchema,
  roomLeaveRequestSchema,
  roomRequestSnapshotAcknowledgementSchema,
  roomRequestSnapshotRequestSchema,
  roomSetAiSeatAcknowledgementSchema,
  roomSetAiSeatRequestSchema,
  roomSetReadyAcknowledgementSchema,
  roomSetReadyRequestSchema,
  roomSnapshotSchema,
  roomCodeSchema,
  safeErrorSchema,
  serverHelloSchema,
  sessionReplacedNoticeSchema,
  sessionResumeAcknowledgementSchema,
  sessionResumeRequestSchema,
  type Acknowledgement,
  type AiProfileId,
  type ClientToServerEvents,
  type RoomSessionData,
  type RoomSnapshot,
  type SafeError,
  type SeatId,
  type ServerToClientEvents,
  type SessionCredential,
} from '@frontier-isles/realtime-contracts'
import type { LobbyCredentialStore } from '../../infrastructure/realtime/lobby-credential-store.ts'
import type {
  LobbyGateway,
  LobbyGatewayListener,
  LobbyGatewayState,
} from './lobby-gateway.ts'

type LobbySocket = Socket<ServerToClientEvents, ClientToServerEvents>

export interface SocketLobbyGatewayOptions {
  readonly credentialStore?: LobbyCredentialStore
  readonly socket?: LobbySocket
}

const INITIAL_STATE: LobbyGatewayState = Object.freeze({
  connectionState: 'DISCONNECTED',
  error: null,
  selfSeatId: null,
  snapshot: null,
})

function publicTransportError(message: string): SafeError {
  return safeErrorSchema.parse({ code: 'INTERNAL_ERROR', message })
}

function resultData<T>(result: Acknowledgement<T>): T {
  if (result.ok) return result.data
  throw new Error(result.error.message)
}

interface RuntimeSchema<T> {
  safeParse(value: unknown):
    | { readonly success: true; readonly data: T }
    | { readonly success: false }
}

function validatedResultData<T>(schema: RuntimeSchema<Acknowledgement<T>>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new Error('The multiplayer service returned an invalid response.')
  return resultData(parsed.data)
}

export class SocketLobbyGateway implements LobbyGateway {
  readonly #socket: LobbySocket
  readonly #credentialStore: LobbyCredentialStore | null
  readonly #listeners = new Set<LobbyGatewayListener>()
  #credential: SessionCredential | null
  #helloReceived = false
  #resumePromise: Promise<boolean> | null = null
  #sessionAttached = false
  #state: LobbyGatewayState = INITIAL_STATE

  public constructor(url: string, options: SocketLobbyGatewayOptions = {}) {
    this.#credentialStore = options.credentialStore ?? null
    this.#credential = this.#credentialStore?.load() ?? null
    this.#socket = options.socket ?? createSocket(url, {
      autoConnect: false,
      reconnection: true,
      transports: ['websocket'],
      withCredentials: true,
    })
    this.#registerTransportListeners()
  }

  public subscribe(listener: LobbyGatewayListener): () => void {
    this.#listeners.add(listener)
    listener(this.#state)
    return () => this.#listeners.delete(listener)
  }

  public async createRoom(displayName: string): Promise<void> {
    await this.#ensureConnected()
    if (!displayNameInputSchema.safeParse(displayName).success) {
      throw new Error('Enter a valid display name.')
    }
    const request = roomCreateRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      displayName,
    })
    const acknowledgement = await new Promise<unknown>((resolve) => {
      this.#socket.emit('room:create', request, resolve)
    })
    const data = validatedResultData(roomCreateAcknowledgementSchema, acknowledgement)
    this.#acceptSession(data)
  }

  public async joinRoom(displayName: string, roomCode: string): Promise<void> {
    await this.#ensureConnected()
    if (!displayNameInputSchema.safeParse(displayName).success) {
      throw new Error('Enter a valid display name.')
    }
    if (!roomCodeSchema.safeParse(roomCode.trim().toUpperCase()).success) {
      throw new Error('Enter a valid six-character Room code.')
    }
    const request = roomJoinRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      displayName,
      roomCode: roomCode.trim().toUpperCase(),
    })
    const acknowledgement = await new Promise<unknown>((resolve) => {
      this.#socket.emit('room:join', request, resolve)
    })
    const data = validatedResultData(roomJoinAcknowledgementSchema, acknowledgement)
    this.#acceptSession(data)
  }

  public resumeSession(): Promise<boolean> {
    if (this.#credential === null) return Promise.resolve(false)
    this.#resumePromise ??= this.#performResume().finally(() => {
      this.#resumePromise = null
    })
    return this.#resumePromise
  }

  public async setReady(ready: boolean): Promise<void> {
    const snapshot = this.#requireSnapshot()
    const request = roomSetReadyRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      expectedRevision: snapshot.revision,
      ready,
    })
    const acknowledgement = await new Promise<unknown>((resolve) => {
      this.#socket.emit('room:set-ready', request, resolve)
    })
    const data = validatedResultData(roomSetReadyAcknowledgementSchema, acknowledgement)
    this.#acceptSnapshot(data.snapshot)
  }

  public async setAiSeat(seatId: SeatId, profileId: AiProfileId | null): Promise<void> {
    const snapshot = this.#requireSnapshot()
    const request = roomSetAiSeatRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      expectedRevision: snapshot.revision,
      seatId,
      profileId,
    })
    const acknowledgement = await new Promise<unknown>((resolve) => {
      this.#socket.emit('room:set-ai-seat', request, resolve)
    })
    const data = validatedResultData(roomSetAiSeatAcknowledgementSchema, acknowledgement)
    this.#acceptSnapshot(data.snapshot)
  }

  public async requestSnapshot(): Promise<void> {
    this.#requireSnapshot()
    const request = roomRequestSnapshotRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
    })
    const acknowledgement = await new Promise<unknown>((resolve) => {
      this.#socket.emit('room:request-snapshot', request, resolve)
    })
    const data = validatedResultData(roomRequestSnapshotAcknowledgementSchema, acknowledgement)
    this.#acceptSnapshot(data.snapshot)
  }

  public async leaveRoom(): Promise<void> {
    if (this.#credential === null) {
      this.#socket.disconnect()
      this.#replaceState(INITIAL_STATE)
      return
    }
    const request = roomLeaveRequestSchema.parse({ protocolVersion: REALTIME_PROTOCOL_VERSION })
    const acknowledgement = await new Promise<unknown>((resolve) => {
      this.#socket.emit('room:leave', request, resolve)
    })
    validatedResultData(roomLeaveAcknowledgementSchema, acknowledgement)
    this.#credential = null
    this.#credentialStore?.clear()
    this.#sessionAttached = false
    this.#socket.disconnect()
    this.#replaceState(INITIAL_STATE)
  }

  public dispose(): void {
    this.#listeners.clear()
    this.#socket.disconnect()
  }

  #registerTransportListeners(): void {
    this.#socket.on('connect', () => {
      this.#replaceState({
        ...this.#state,
        connectionState: this.#credential !== null && !this.#sessionAttached
          ? 'RECONNECTING'
          : 'CONNECTED',
        error: null,
      })
    })
    this.#socket.on('disconnect', (reason) => {
      this.#sessionAttached = false
      const reconnecting = reason !== 'io client disconnect' && this.#credential !== null
      this.#replaceState({
        ...this.#state,
        connectionState: reconnecting ? 'RECONNECTING' : 'DISCONNECTED',
      })
    })
    this.#socket.on('connect_error', () => {
      this.#replaceState({
        ...this.#state,
        connectionState: this.#credential === null ? 'DISCONNECTED' : 'RECONNECTING',
        error: publicTransportError('Unable to connect to the multiplayer service.'),
      })
    })
    this.#socket.on('server:hello', (untrusted) => {
      const parsed = serverHelloSchema.safeParse(untrusted)
      if (!parsed.success) {
        this.#helloReceived = false
        this.#replaceState({
          ...this.#state,
          error: safeErrorSchema.parse({
            code: 'PROTOCOL_VERSION_MISMATCH',
            message: 'Refresh the page to use the supported realtime protocol.',
          }),
        })
        return
      }
      this.#helloReceived = true
      if (this.#credential !== null && !this.#sessionAttached) {
        void this.resumeSession()
      }
    })
    this.#socket.on('room:snapshot', (untrusted) => {
      const parsed = roomSnapshotSchema.safeParse(untrusted)
      if (!parsed.success) {
        this.#rejectInvalidServerData()
        return
      }
      if (this.#credential?.roomCode !== parsed.data.roomCode) return
      this.#acceptSnapshot(parsed.data)
    })
    this.#socket.on('server:error', (untrusted) => {
      const parsed = safeErrorSchema.safeParse(untrusted)
      if (!parsed.success) {
        this.#rejectInvalidServerData()
        return
      }
      this.#replaceState({ ...this.#state, error: parsed.data })
    })
    this.#socket.on('room:closed', (untrusted) => {
      const parsed = roomClosedNoticeSchema.safeParse(untrusted)
      if (!parsed.success) {
        this.#rejectInvalidServerData()
        return
      }
      if (this.#credential?.roomCode !== parsed.data.roomCode) return
      this.#credential = null
      this.#credentialStore?.clear()
      this.#sessionAttached = false
      this.#replaceState({
        connectionState: this.#state.connectionState,
        error: safeErrorSchema.parse({ code: 'ROOM_CLOSED', message: parsed.data.message }),
        selfSeatId: null,
        snapshot: null,
      })
    })
    this.#socket.on('session:replaced', (untrusted) => {
      const parsed = sessionReplacedNoticeSchema.safeParse(untrusted)
      if (!parsed.success) {
        this.#rejectInvalidServerData()
        return
      }
      this.#credential = null
      this.#credentialStore?.clear()
      this.#sessionAttached = false
      this.#replaceState({
        connectionState: 'DISCONNECTED',
        error: safeErrorSchema.parse({ code: parsed.data.code, message: parsed.data.message }),
        selfSeatId: this.#state.selfSeatId,
        snapshot: this.#state.snapshot,
      })
    })
  }

  async #ensureConnected(): Promise<void> {
    if (this.#socket.connected && this.#helloReceived) return
    this.#replaceState({ ...this.#state, connectionState: 'CONNECTING', error: null })
    await new Promise<void>((resolve, reject) => {
      let connected = this.#socket.connected
      let hello = this.#helloReceived
      const settle = (): void => {
        if (!connected || !hello) return
        cleanup()
        resolve()
      }
      const onConnect = (): void => {
        connected = true
        settle()
      }
      const onHello = (untrusted: unknown): void => {
        if (!serverHelloSchema.safeParse(untrusted).success) return
        hello = true
        settle()
      }
      const onError = (): void => {
        cleanup()
        reject(new Error('Unable to connect to the multiplayer service.'))
      }
      const cleanup = (): void => {
        this.#socket.off('connect', onConnect)
        this.#socket.off('server:hello', onHello)
        this.#socket.off('connect_error', onError)
      }
      this.#socket.on('connect', onConnect)
      this.#socket.on('server:hello', onHello)
      this.#socket.on('connect_error', onError)
      this.#socket.connect()
      settle()
    })
  }

  #acceptSession(data: RoomSessionData): void {
    this.#credential = data.credential
    this.#credentialStore?.save(data.credential)
    this.#sessionAttached = true
    this.#replaceState({
      connectionState: 'CONNECTED',
      error: null,
      selfSeatId: data.credential.seatId,
      snapshot: data.snapshot,
    })
  }

  #acceptSnapshot(snapshot: RoomSnapshot): void {
    this.#replaceState({ ...this.#state, error: null, snapshot: roomSnapshotSchema.parse(snapshot) })
  }

  async #performResume(): Promise<boolean> {
    await this.#ensureConnected()
    const credential = this.#credential
    if (credential === null) return false
    const request = sessionResumeRequestSchema.parse(credential)
    const untrusted = await new Promise<unknown>((resolve) => {
      this.#socket.emit('session:resume', request, resolve)
    })
    const parsed = sessionResumeAcknowledgementSchema.safeParse(untrusted)
    if (!parsed.success) {
      this.#rejectInvalidServerData()
      return false
    }
    if (!parsed.data.ok) {
      this.#credential = null
      this.#credentialStore?.clear()
      this.#sessionAttached = false
      this.#replaceState({
        connectionState: this.#state.connectionState,
        error: parsed.data.error,
        selfSeatId: null,
        snapshot: null,
      })
      return false
    }
    this.#acceptSession(parsed.data.data)
    return true
  }

  #requireSnapshot(): RoomSnapshot {
    if (this.#credential === null || this.#state.snapshot === null) {
      throw new Error('Join a Room before using this action.')
    }
    return this.#state.snapshot
  }

  #rejectInvalidServerData(): void {
    this.#replaceState({
      ...this.#state,
      error: publicTransportError('The multiplayer service returned an invalid response.'),
    })
  }

  #replaceState(state: LobbyGatewayState): void {
    this.#state = Object.freeze(state)
    for (const listener of this.#listeners) listener(this.#state)
  }
}
