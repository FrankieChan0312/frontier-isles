import type { Socket } from 'socket.io-client'
import type { CommandEnvelope } from '@frontier-isles/game-core/contracts/commands'
import type { PlayerEventView } from '@frontier-isles/game-core/contracts/player-events'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import {
  REALTIME_PROTOCOL_VERSION, gameCommandRequestSchema, gameCommandAcknowledgementSchema,
  gameRequestSnapshotRequestSchema, gameRequestSnapshotAcknowledgementSchema, gameUpdateSchema,
  gameDeliveryStateSchema, type GameDeliveryState, type GameCommandRequest,
  type ClientToServerEvents, type ServerToClientEvents, type GameUpdate as WireGameUpdate,
} from '@frontier-isles/realtime-contracts'
import type { CommandResponse, GameUpdate, OnlineGameGateway } from './game-gateway.ts'
import type { LobbyGatewayState, LobbyGatewayListener } from './lobby-gateway.ts'
import { abortable, commandDeliverySettings, deliveryDelay, type CommandDeliveryOptions, type CommandDeliverySettings } from './command-delivery.ts'

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>
export interface SocketGameGatewayOptions {
  readonly socket: GameSocket
  readonly subscribeToLobby: (listener: LobbyGatewayListener) => () => void
  readonly isSessionAttached: () => boolean
  readonly commandNamespaceFactory?: () => string
  readonly commandDelivery?: CommandDeliveryOptions
}

interface QueuedCommand {
  readonly request: GameCommandRequest
  readonly cancellation: AbortController
  readonly resolve: (response: CommandResponse) => void
  readonly reject: (error: Error) => void
}

const OFFLINE_ONLY = 'Online games resume through your Room session; browser saves are for Single Player.'
const INVALID_RESPONSE = 'The multiplayer service returned an invalid game response.'

/** A cryptographic transport namespace is separate from the deterministic game RNG. */
function browserCommandNamespace(): string { return globalThis.crypto.randomUUID() }

export class SocketGameGateway implements OnlineGameGateway {
  readonly #socket: GameSocket
  readonly #isSessionAttached: () => boolean
  readonly #namespaceFactory: () => string
  readonly #unsubscribeLobby: () => void
  readonly #listeners = new Set<(update: GameUpdate) => void>()
  readonly #settings: CommandDeliverySettings
  readonly #queue: QueuedCommand[] = []
  readonly #attachmentWaiters = new Set<() => void>()
  #active: QueuedCommand | null = null
  #draining = false
  #attempt = 0
  #deliveryPhase: GameDeliveryState['status'] = 'IDLE'
  #resyncRequired = false
  #lobby: LobbyGatewayState | null = null
  #wire: WireGameUpdate | null = null
  #namespace: string | null = null
  #snapshotTask: Promise<void> | null = null
  #submitting = false
  #resynchronizing = false
  #disposed = false
  #epoch = 0
  #error: string | null = null

  public constructor(options: SocketGameGatewayOptions) {
    this.#socket = options.socket
    this.#isSessionAttached = options.isSessionAttached
    this.#namespaceFactory = options.commandNamespaceFactory ?? browserCommandNamespace
    this.#settings = commandDeliverySettings(options.commandDelivery)
    this.#socket.on('game:update', this.#onGameUpdate)
    this.#unsubscribeLobby = options.subscribeToLobby(this.#onLobbyUpdate)
  }

  public subscribe(listener: (update: GameUpdate) => void): () => void {
    this.#listeners.add(listener)
    listener(this.#update([]))
    return () => this.#listeners.delete(listener)
  }

  public async submit(envelope: CommandEnvelope): Promise<CommandResponse> {
    if (!this.#attached() || this.#wire === null) throw new Error('Reconnect to your Room before playing.')
    if (this.#resyncRequired && this.#active === null) throw new Error('Resynchronize the game before playing.')
    if (this.#wire.lifecycleStatus === 'ERROR') throw new Error('The server could not continue this game.')
    if (this.#wire.lifecycleStatus === 'PAUSED_RECONNECTING' || this.#wire.lifecycleStatus === 'PAUSED_REPLACEMENT_REQUIRED') {
      throw new Error('The game is paused until every Human reconnects or an expired seat is replaced.')
    }
    if (this.#wire.lifecycleStatus === 'CLOSED') throw new Error('This online game has closed.')
    if (this.#wire.lifecycleStatus === 'FINISHED' || this.#lobby?.snapshot?.lifecycleStatus === 'FINISHED') throw new Error('This game has finished.')
    if (this.#queue.length + (this.#active === null ? 0 : 1) >= this.#settings.queueCapacity) throw new Error('The command queue is full. Wait for the current game update.')
    this.#namespace ??= this.#namespaceFactory()
    const parsedRequest = gameCommandRequestSchema.safeParse({
      protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: this.#wire.roomCode, gameId: this.#wire.gameId,
      // Admission detaches the complete request. Every retry sends this exact object.
      commandId: `human:${this.#namespace}:${envelope.commandId}`,
      expectedStateVersion: envelope.expectedStateVersion, command: envelope.command,
    })
    if (!parsedRequest.success) throw new Error('This game action could not be submitted. Resynchronize and try again.')
    return new Promise<CommandResponse>((resolve, reject) => {
      this.#queue.push({ request: parsedRequest.data, cancellation: new AbortController(), resolve, reject })
      void this.#drain()
      this.#publish([])
    })
  }

  async #drain(): Promise<void> {
    if (this.#draining) return
    this.#draining = true
    try {
      for (let entry = this.#queue.shift(); entry !== undefined; entry = this.#queue.shift()) {
        this.#active = entry
        this.#submitting = true
        this.#error = null
        try { entry.resolve(await this.#deliver(entry)) } catch (error: unknown) {
          entry.reject(error instanceof Error ? error : new Error('Unable to deliver the game action.'))
        } finally { this.#active = null }
      }
    } finally {
      this.#draining = false
      this.#submitting = false
      this.#attempt = 0
      this.#deliveryPhase = 'IDLE'
      this.#publish([])
    }
  }

  async #deliver(entry: QueuedCommand): Promise<CommandResponse> {
    const { request, cancellation } = entry
    const signal = cancellation.signal
    try {
      for (let attempt = 1; attempt <= this.#settings.maxRetries + 1; attempt += 1) {
        signal.throwIfAborted()
        this.#attempt = attempt
        if (!this.#attached()) await this.#waitForAttachment(signal)
        if (attempt > 1 || this.#resyncRequired || this.#snapshotTask !== null) {
          await abortable(this.requestSnapshot(), signal)
        }
        if (attempt > 1) {
          this.#deliveryPhase = 'RETRYING'
          this.#publish([])
          await deliveryDelay(Math.min(this.#settings.maxRetryDelayMs,
            this.#settings.retryDelayMs * 2 ** (attempt - 2)), signal)
        }
        if (!this.#attached()) {
          await this.#waitForAttachment(signal)
          await abortable(this.requestSnapshot(), signal)
        }
        signal.throwIfAborted()
        this.#deliveryPhase = 'SUBMITTING'
        this.#publish([])
        let untrusted: unknown
        try {
          untrusted = await abortable(this.#socket.timeout(this.#settings.acknowledgementTimeoutMs)
            .emitWithAck('game:command', request), signal)
        } catch {
          signal.throwIfAborted()
          this.#resyncRequired = true
          continue
        }
        const parsed = gameCommandAcknowledgementSchema.safeParse(untrusted)
        if (!parsed.success || (parsed.data.ok && parsed.data.data.commandId !== request.commandId)) {
          this.#resyncRequired = true
          continue
        }
        if (!parsed.data.ok) {
          if (parsed.data.error.code === 'GAME_BUSY'
            || (parsed.data.error.code === 'NOT_ROOM_MEMBER' && !this.#attached())) {
            this.#resyncRequired = true
            continue
          }
          throw new Error(parsed.data.error.message)
        }
        await abortable(this.requestSnapshot(), signal)
        signal.throwIfAborted()
        const view = this.#requireView()
        if (view.stateVersion < parsed.data.data.stateVersion) throw new Error(INVALID_RESPONSE)
        return parsed.data.data.accepted ? { ok: true, view, events: [] }
          : { ok: false, view, violation: parsed.data.data.violation }
      }
      throw new Error('The command outcome is uncertain after bounded retries. A fresh snapshot is required.')
    } catch (error: unknown) {
      if (signal.aborted || this.#disposed) throw new Error('The game session changed. Pending delivery was cancelled.', { cause: error })
      const message = error instanceof Error ? error.message : 'Unable to deliver the game action.'
      this.#resyncRequired = true
      if (this.#attached()) await abortable(this.requestSnapshot(), signal).catch(() => {})
      if (!signal.aborted && !this.#disposed) { this.#error = message; this.#publish([]) }
      throw new Error(message, { cause: error })
    }
  }

  #waitForAttachment(signal: AbortSignal): Promise<void> {
    this.#deliveryPhase = 'WAITING_RECONNECT'
    this.#publish([])
    return new Promise<void>((resolve, reject) => {
      const cleanup = (): void => {
        clearTimeout(timer)
        this.#attachmentWaiters.delete(wake)
        signal.removeEventListener('abort', cancel)
      }
      const wake = (): void => { if (this.#attached()) { cleanup(); resolve() } }
      const cancel = (): void => { cleanup(); reject(new Error('Pending delivery was cancelled.')) }
      const timer = setTimeout(() => { cleanup(); reject(new Error('Reconnect timed out. Resynchronize before playing.')) }, this.#settings.reconnectTimeoutMs)
      this.#attachmentWaiters.add(wake)
      if (signal.aborted) cancel()
      else { signal.addEventListener('abort', cancel, { once: true }); wake() }
    })
  }

  #cancelQueued(message: string): void {
    for (const entry of this.#queue.splice(0)) { entry.cancellation.abort(); entry.reject(new Error(message)) }
  }

  #cancelDelivery(): void {
    this.#cancelQueued('The game session changed. Pending delivery was cancelled.')
    this.#active?.cancellation.abort()
  }

  public requestSnapshot(): Promise<void> {
    if (this.#snapshotTask !== null) return this.#snapshotTask
    const snapshot = this.#lobby?.snapshot
    if (!this.#attached() || snapshot?.gameId === undefined) {
      return Promise.reject(new Error('Reconnect to your Room before resynchronizing.'))
    }
    const epoch = this.#epoch
    const request = gameRequestSnapshotRequestSchema.parse({ protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomCode: snapshot.roomCode, gameId: snapshot.gameId })
    this.#resynchronizing = true
    this.#publish([])
    const task = (async (): Promise<void> => {
      try {
        // One additional authoritative request repairs a malformed or mismatched snapshot.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const untrusted: unknown = await this.#socket.timeout(this.#settings.acknowledgementTimeoutMs).emitWithAck('game:request-snapshot', request)
          if (epoch !== this.#epoch || !this.#attached()) return
          const parsed = gameRequestSnapshotAcknowledgementSchema.safeParse(untrusted)
          if (!parsed.success || (parsed.data.ok && !this.#matchesViewer(parsed.data.data))) {
            if (attempt === 0) continue
            throw new Error(INVALID_RESPONSE)
          }
          if (!parsed.data.ok) throw new Error(parsed.data.error.message)
          this.#error = parsed.data.data.lifecycleStatus === 'ERROR' ? 'The server could not continue this game.' : null
          this.#accept(parsed.data.data, false)
          this.#resyncRequired = false
          return
        }
      } catch (error: unknown) {
        if (epoch !== this.#epoch || this.#disposed) return
        this.#resyncRequired = true
        this.#error = error instanceof Error && error.message !== 'operation has timed out'
          ? error.message : 'Unable to refresh the online game. Try Resync game.'
        throw new Error(this.#error, { cause: error })
      } finally {
        if (epoch === this.#epoch && !this.#disposed) {
          this.#snapshotTask = null
          this.#resynchronizing = false
          this.#publish([])
        }
      }
    })()
    this.#snapshotTask = task
    return task
  }

  public createGame(): Promise<PlayerView> { return Promise.reject(new Error(OFFLINE_ONLY)) }
  public saveGame(): Promise<void> { return Promise.reject(new Error(OFFLINE_ONLY)) }
  public loadGame(): Promise<PlayerView> { return Promise.reject(new Error(OFFLINE_ONLY)) }
  public loadLatestGame(): Promise<PlayerView> { return Promise.reject(new Error(OFFLINE_ONLY)) }
  public hasSavedGame(): Promise<boolean> { return Promise.resolve(false) }
  public deleteSavedGame(): Promise<void> { return Promise.reject(new Error(OFFLINE_ONLY)) }

  public dispose(): void {
    if (this.#disposed) return
    this.#disposed = true
    this.#cancelDelivery()
    this.#epoch += 1
    this.#unsubscribeLobby()
    this.#socket.off('game:update', this.#onGameUpdate)
    this.#listeners.clear()
    this.#wire = null
    this.#snapshotTask = null
  }

  readonly #onGameUpdate = (untrusted: unknown, received: () => void): void => {
    const parsed = gameUpdateSchema.safeParse(untrusted)
    if (typeof received === 'function') received()
    if (!this.#attached()) return
    if (!parsed.success || !this.#matchesViewer(parsed.data)) {
      this.#error = INVALID_RESPONSE
      this.#publish([])
      void this.requestSnapshot().catch(() => {})
      return
    }
    this.#accept(parsed.data, true)
  }

  readonly #onLobbyUpdate = (lobby: LobbyGatewayState): void => {
    if (this.#disposed) return
    const previous = this.#lobby
    const wasAttached = previous?.connectionState === 'CONNECTED'
    const identityChanged = previous?.snapshot?.gameId !== lobby.snapshot?.gameId
      || previous?.snapshot?.roomCode !== lobby.snapshot?.roomCode || previous?.selfSeatId !== lobby.selfSeatId
    this.#lobby = lobby
    if (identityChanged || !this.#attached()) {
      this.#epoch += 1
      this.#snapshotTask = null
      this.#resynchronizing = false
      this.#resyncRequired = !identityChanged && lobby.snapshot?.gameId !== undefined
      if (identityChanged) this.#wire = null
    }
    if (identityChanged || lobby.error?.code === 'SESSION_REPLACED' || lobby.error?.code === 'SESSION_INVALID'
      || lobby.error?.code === 'ROOM_CLOSED') this.#cancelDelivery()
    if (lobby.snapshot?.lifecycleStatus === 'FINISHED') this.#cancelQueued('This game has finished.')
    this.#error = lobby.error?.message ?? null
    this.#publish([])
    for (const wake of this.#attachmentWaiters) wake()
    if (this.#attached() && lobby.snapshot?.gameId !== undefined && (identityChanged || !wasAttached
      || previous?.snapshot?.lifecycleStatus !== lobby.snapshot.lifecycleStatus)) {
      void this.requestSnapshot().catch(() => {})
    }
  }

  #attached(): boolean {
    return !this.#disposed && this.#socket.connected && this.#isSessionAttached()
      && this.#lobby?.connectionState === 'CONNECTED'
  }

  #matchesViewer(update: WireGameUpdate): boolean {
    const snapshot = this.#lobby?.snapshot
    return snapshot?.gameId === update.gameId && snapshot.roomCode === update.roomCode
      && update.view.self.id === `player:${snapshot.roomCode}:${this.#lobby?.selfSeatId}`
      && update.view.self.controller.type === 'HUMAN'
  }

  #accept(update: WireGameUpdate, fromEvent: boolean): void {
    const previous = this.#wire
    if (previous !== null && (update.view.stateVersion < previous.view.stateVersion
      || update.publicationRevision < previous.publicationRevision
      || (update.view.stateVersion === previous.view.stateVersion && update.publicationRevision === previous.publicationRevision))) return
    const gap = previous !== null && (update.view.stateVersion > previous.view.stateVersion + 1
      || update.publicationRevision > previous.publicationRevision + 1)
    this.#wire = update
    if (update.lifecycleStatus === 'FINISHED') this.#cancelQueued('This game has finished.')
    this.#error = update.lifecycleStatus === 'ERROR' ? 'The server could not continue this game.' : null
    this.#publish(fromEvent ? update.events : [])
    if (fromEvent && gap) void this.requestSnapshot().catch(() => {})
  }

  #requireView(): PlayerView {
    if (this.#wire === null) throw new Error('Waiting for your authoritative game view.')
    return this.#wire.view
  }

  #update(events: readonly PlayerEventView[]): GameUpdate {
    return { view: this.#wire?.view ?? null, events, saveStatus: 'IDLE',
      aiThinking: this.#wire?.aiThinking ?? false,
      connectionStatus: this.#attached() ? this.#wire?.lifecycleStatus === 'ERROR' ? 'ERROR' : 'READY'
        : this.#lobby?.connectionState === 'RECONNECTING' ? 'RECONNECTING'
          : this.#lobby?.connectionState === 'CONNECTING' ? 'CONNECTING' : 'DISCONNECTED',
      error: this.#error, submitting: this.#submitting, resynchronizing: this.#resynchronizing,
      ...(this.#wire === null ? {} : { presence: this.#wire.presence }),
      delivery: gameDeliveryStateSchema.parse({ status: this.#resynchronizing ? 'RESYNCHRONIZING'
        : this.#resyncRequired && this.#attached() ? 'RESYNC_REQUIRED' : this.#deliveryPhase,
        attempt: this.#attempt, queuedCommands: this.#queue.length }) }
  }

  #publish(events: readonly PlayerEventView[]): void {
    if (this.#disposed) return
    const update = this.#update(events)
    for (const listener of this.#listeners) listener(update)
  }
}
