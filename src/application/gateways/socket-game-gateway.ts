import type { Socket } from 'socket.io-client'
import type { CommandEnvelope } from '@frontier-isles/game-core/contracts/commands'
import type { PlayerEventView } from '@frontier-isles/game-core/contracts/player-events'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import {
  REALTIME_PROTOCOL_VERSION, gameCommandRequestSchema, gameCommandAcknowledgementSchema,
  gameRequestSnapshotRequestSchema, gameRequestSnapshotAcknowledgementSchema, gameUpdateSchema,
  type ClientToServerEvents, type ServerToClientEvents, type GameUpdate as WireGameUpdate,
} from '@frontier-isles/realtime-contracts'
import type { CommandResponse, GameUpdate, OnlineGameGateway } from './game-gateway.ts'
import type { LobbyGatewayState, LobbyGatewayListener } from './lobby-gateway.ts'

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>
export interface SocketGameGatewayOptions {
  readonly socket: GameSocket
  readonly subscribeToLobby: (listener: LobbyGatewayListener) => () => void
  readonly isSessionAttached: () => boolean
  readonly commandNamespaceFactory?: () => string
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
    if (this.#submitting || this.#resynchronizing) throw new Error('Wait for the current game update before playing.')
    if (this.#wire.lifecycleStatus === 'ERROR') throw new Error('The server could not continue this game.')
    const epoch = this.#epoch
    this.#namespace ??= this.#namespaceFactory()
    const parsedRequest = gameCommandRequestSchema.safeParse({
      protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: this.#wire.roomCode, gameId: this.#wire.gameId,
      // The same envelope keeps the same ID across a reconnect or caller retry. A new tab
      // or page load gets a different namespace. This adds no automatic retry policy.
      commandId: `human:${this.#namespace}:${envelope.commandId}`,
      expectedStateVersion: envelope.expectedStateVersion, command: envelope.command,
    })
    if (!parsedRequest.success) throw new Error('This game action could not be submitted. Resynchronize and try again.')
    const request = parsedRequest.data
    this.#submitting = true
    this.#error = null
    this.#publish([])
    try {
      const untrusted: unknown = await this.#socket.timeout(8_000).emitWithAck('game:command', request)
      if (epoch !== this.#epoch || !this.#attached()) throw new Error('Your connection changed. Resynchronize before playing.')
      const parsed = gameCommandAcknowledgementSchema.safeParse(untrusted)
      if (!parsed.success) throw new Error(INVALID_RESPONSE)
      if (!parsed.data.ok) throw new Error(parsed.data.error.message)
      if (parsed.data.data.commandId !== request.commandId) throw new Error(INVALID_RESPONSE)
      await this.requestSnapshot()
      const view = this.#requireView()
      if (view.stateVersion < parsed.data.data.stateVersion) throw new Error(INVALID_RESPONSE)
      if (parsed.data.data.accepted) return { ok: true, view, events: [] }
      return { ok: false, view, violation: parsed.data.data.violation }
    } catch (error: unknown) {
      if (epoch === this.#epoch && !this.#disposed) {
        this.#error = error instanceof Error && error.message !== 'operation has timed out'
          ? error.message : 'The command response was interrupted. Resynchronize before trying again.'
        // A transport failure may follow an accepted command. Read the current view without
        // re-sending the command or guessing its result from local events.
        if (this.#attached()) await this.requestSnapshot().catch(() => {})
      }
      throw new Error(this.#error ?? 'The game connection changed. Resynchronize before playing.', { cause: error })
    } finally {
      if (epoch === this.#epoch && !this.#disposed) {
        this.#submitting = false
        this.#publish([])
      }
    }
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
        const untrusted: unknown = await this.#socket.timeout(8_000).emitWithAck('game:request-snapshot', request)
        if (epoch !== this.#epoch || !this.#attached()) return
        const parsed = gameRequestSnapshotAcknowledgementSchema.safeParse(untrusted)
        if (!parsed.success) throw new Error(INVALID_RESPONSE)
        if (!parsed.data.ok) throw new Error(parsed.data.error.message)
        if (!this.#matchesViewer(parsed.data.data)) throw new Error(INVALID_RESPONSE)
        this.#error = parsed.data.data.lifecycleStatus === 'ERROR' ? 'The server could not continue this game.' : null
        this.#accept(parsed.data.data, false)
      } catch (error: unknown) {
        if (epoch !== this.#epoch || this.#disposed) return
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
      this.#submitting = false
      this.#resynchronizing = false
      if (identityChanged) this.#wire = null
    }
    this.#error = lobby.error?.message ?? null
    this.#publish([])
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
      error: this.#error, submitting: this.#submitting, resynchronizing: this.#resynchronizing }
  }

  #publish(events: readonly PlayerEventView[]): void {
    if (this.#disposed) return
    const update = this.#update(events)
    for (const listener of this.#listeners) listener(update)
  }
}
