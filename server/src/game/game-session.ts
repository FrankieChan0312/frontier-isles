import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { GameEvent } from '@frontier-isles/game-core/contracts/events'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import type { PlayerController } from '@frontier-isles/game-core/model/player'
import type { GameConfig, FourPlayerTuple, PlayerConfig } from '@frontier-isles/game-core/model/game-config'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import type { AiProfileId, CommandId, GameId, PlayerId } from '@frontier-isles/game-core/model/ids'
import { RULESET_ID } from '@frontier-isles/game-core/model/ruleset'
import { createOnlineGame } from '@frontier-isles/game-core/engine/create-game'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { assertTradingState } from '@frontier-isles/game-core/engine/trading-invariants'
import { createPlayerEventViews } from '@frontier-isles/game-core/selectors/player-event-view'
import { DEFAULT_AI_SAFETY_LIMITS, type AiAgent, type AiSafetyLimits } from '@frontier-isles/game-ai/ai-agent'
import { createAiCommandKey } from '@frontier-isles/game-ai/core-ai-agent'
import { PersonalityAiAgent } from '@frontier-isles/game-ai/personality-ai-agent'
import {
  CANONICAL_SEAT_IDS, REALTIME_PROTOCOL_VERSION, gameUpdateSchema, gamePresenceSchema,
  createSafeErrorAcknowledgement, type AiProfileId as LobbyAiProfileId,
  type GameCommandAcknowledgement, type GameCommandRequest, type GameCommandResult,
  type GameUpdate, type RoomCode, type SeatId, type SessionId,
  type DisconnectedSeatPresence, type GamePresence,
} from '@frontier-isles/realtime-contracts'
import { commandRequestFingerprint } from './command-request-fingerprint.js'
import { GameExecutionQueue, GameQueueFullError } from './game-execution-queue.js'
import type { PersistedGame } from '../persistence/multiplayer-record.js'
import { PersistenceError } from '../persistence/multiplayer-repository.js'

export type GameSeat =
  | { readonly seatId: SeatId; readonly occupancy: 'HUMAN'; readonly sessionId: SessionId; readonly displayName: string }
  | { readonly seatId: SeatId; readonly occupancy: 'AI'; readonly profileId: LobbyAiProfileId }

export interface GameSessionDependencies {
  readonly aiAgent?: AiAgent
  readonly aiSafetyLimits?: AiSafetyLimits
  readonly maxAiCommandsPerAdvance?: number
  readonly commandCacheSize?: number
  readonly maxQueuedOperations?: number
  /** Internal composition boundary, including invariant-valid fixtures in Node tests. */
  readonly createState?: (config: GameConfig, seed: string) => GameState
  readonly afterTransition?: (state: GameState, command: GameCommand) => void
  /** Commit the enclosing Room aggregate before acknowledging or publishing new state. */
  readonly commit?: () => Promise<void>
  readonly executionQueue?: GameExecutionQueue
}

export interface GamePublication {
  readonly sessionId: SessionId
  readonly update: GameUpdate
}

interface CachedCommandResult {
  readonly fingerprint: string
  readonly result: GameCommandResult
}

interface HumanExecution {
  readonly acknowledgement: GameCommandAcknowledgement
  readonly changed: boolean
}

export function nextGameDecisionActor(state: GameState): PlayerId {
  const pending = state.pendingDecision
  if (pending?.type === 'DISCARD_RESOURCES') {
    const actor = state.playerOrder.find((id) => pending.requiredCountByPlayer[id] !== undefined
      && !pending.completedPlayerIds.includes(id))
    if (actor === undefined) throw new Error('Discard invariant failed.')
    return actor
  }
  if (pending?.type === 'RESPOND_TO_TRADE') return pending.responderId
  if (pending !== null && 'actingPlayerId' in pending) return pending.actingPlayerId
  return state.turn.currentPlayerId
}

function turnIdentity(state: GameState): string {
  return state.turn.setup === null
    ? `turn:${state.turn.turnNumber}:${state.turn.currentPlayerId}`
    : `setup:${state.turn.setup.round}:${state.turn.setup.placementIndex}:${state.turn.currentPlayerId}`
}

function positiveInteger(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Game limit must be a positive integer.')
  return value
}

export class GameSession {
  public readonly roomCode: RoomCode
  public readonly gameId: GameId
  readonly #humanPlayers = new Map<SessionId, PlayerId>()
  readonly #seatPlayers = new Map<SeatId, PlayerId>()
  readonly #cache = new Map<SessionId, Map<CommandId, CachedCommandResult>>()
  readonly #queue: GameExecutionQueue
  readonly #listeners = new Set<(publication: GamePublication) => void>()
  readonly #aiAgent: AiAgent
  readonly #aiLimits: AiSafetyLimits
  readonly #advanceLimit: number
  readonly #cacheLimit: number
  readonly #afterTransition: GameSessionDependencies['afterTransition']
  readonly #commit: () => Promise<void>
  readonly #committedViews = new Map<SessionId, GameUpdate>()
  #committedState: GameState | null = null
  #committedPresence: GamePresence | null = null
  #committedRevision = 0
  #committedHumans = new Map<SessionId, PlayerId>()
  #transportPaused = false
  readonly #originalSeats: readonly GameSeat[]
  #state: GameState
  #publicationRevision = 0
  #pendingEvents: readonly GameEvent[] = []
  #aiTask: Promise<void> | null = null
  #failed = false
  #aiCommandCount = 0
  #turnIdentity = ''
  #ownCommandKeys = new Map<PlayerId, string[]>()
  readonly #replacementProfiles = new Map<SeatId, LobbyAiProfileId>()
  #disconnectedSeats: readonly DisconnectedSeatPresence[] = []
  #abandonedDeadlineMs: number | null = null
  #presenceEpoch = 0
  #closed = false
  #stopping = false
  #stopChoice: (() => void) | null = null

  public constructor(
    roomCode: RoomCode,
    gameId: GameId,
    seats: readonly GameSeat[],
    seed: string,
    dependencies: GameSessionDependencies = {},
  ) {
    this.roomCode = roomCode
    this.gameId = gameId
    this.#aiAgent = dependencies.aiAgent ?? new PersonalityAiAgent()
    this.#aiLimits = dependencies.aiSafetyLimits ?? DEFAULT_AI_SAFETY_LIMITS
    for (const limit of Object.values(this.#aiLimits)) positiveInteger(limit)
    this.#advanceLimit = positiveInteger(dependencies.maxAiCommandsPerAdvance ?? 256)
    this.#cacheLimit = positiveInteger(dependencies.commandCacheSize ?? 128)
    if (this.#cacheLimit > 1024) throw new Error('Command cache capacity must not exceed 1024.')
    this.#queue = dependencies.executionQueue ?? new GameExecutionQueue(dependencies.maxQueuedOperations ?? 64)
    this.#afterTransition = dependencies.afterTransition
    this.#commit = dependencies.commit ?? (() => Promise.resolve())
    this.#originalSeats = seats.map((seat): GameSeat => seat.occupancy === 'HUMAN'
      ? { occupancy: 'HUMAN', seatId: seat.seatId, sessionId: seat.sessionId, displayName: seat.displayName }
      : { occupancy: 'AI', seatId: seat.seatId, profileId: seat.profileId })
    const colors = ['RED', 'BLUE', 'ORANGE', 'WHITE'] as const
    const players = CANONICAL_SEAT_IDS.map((seatId, index): PlayerConfig => {
      const seat = seats[index]
      const color = colors[index]
      if (seat?.seatId !== seatId || color === undefined) throw new Error('Game seats must be canonical.')
      const id = `player:${roomCode}:${seatId}` as PlayerId
      this.#seatPlayers.set(seatId, id)
      if (seat.occupancy === 'HUMAN') {
        if (this.#humanPlayers.has(seat.sessionId)) throw new Error('Duplicate Human session.')
        this.#humanPlayers.set(seat.sessionId, id)
        return { id, name: seat.displayName, color, controller: { type: 'HUMAN' } }
      }
      return { id, name: `${seat.profileId} AI`, color,
        controller: { type: 'AI', profileId: seat.profileId as AiProfileId } }
    })
    const [north, east, south, west] = players
    if (seats.length !== 4 || north === undefined || east === undefined || south === undefined || west === undefined
      || this.#humanPlayers.size < 2) throw new Error('Online game requires four seats and at least two Humans.')
    const tuple: FourPlayerTuple<PlayerConfig> = [north, east, south, west]
    this.#state = (dependencies.createState ?? createOnlineGame)({ gameId, rulesetId: RULESET_ID, players: tuple }, seed)
    assertTradingState(this.#state)
    if (this.#state.gameId !== gameId || tuple.some((player) => {
      const actual = this.#state.players[player.id]
      return actual === undefined || actual.controller.type !== player.controller.type
        || (actual.controller.type === 'AI' && player.controller.type === 'AI'
          && actual.controller.profileId !== player.controller.profileId)
    })) throw new Error('Game state must match authoritative seat configuration.')
    this.#turnIdentity = turnIdentity(this.#state)
    this.acceptCommit()
  }

  /** Only validated server repository records may enter this composition boundary. */
  public static restore(roomCode: RoomCode, saved: PersistedGame, dependencies: GameSessionDependencies = {}): GameSession {
    const game = new GameSession(roomCode, saved.state.gameId, saved.originalSeats, saved.state.random.seed,
      { ...dependencies, commandCacheSize: saved.cacheLimit, createState: () => structuredClone(saved.state) })
    game.#publicationRevision = saved.publicationRevision
    game.#failed = saved.failed
    game.#aiCommandCount = saved.aiCommandCount
    game.#turnIdentity = saved.turnIdentity
    game.#disconnectedSeats = structuredClone(saved.presence.disconnectedSeats)
    game.#abandonedDeadlineMs = saved.presence.abandonedDeadlineMs
    for (const replacement of saved.presence.replacements) {
      game.#replacementProfiles.set(replacement.seatId, replacement.profileId)
      const original = saved.originalSeats.find((seat) => seat.seatId === replacement.seatId)
      if (original?.occupancy !== 'HUMAN') throw new Error('Replacement requires an original Human seat.')
      game.#humanPlayers.delete(original.sessionId)
    }
    for (const cache of saved.commandCache) game.#cache.set(cache.sessionId,
      new Map(cache.entries.map((entry) => [entry.result.commandId, structuredClone(entry)])))
    game.#ownCommandKeys = new Map(saved.ownCommandKeys.map((entry) => [entry.playerId, [...entry.keys]]))
    game.acceptCommit()
    return game
  }

  public exportPersistence(): PersistedGame {
    return structuredClone({ originalSeats: this.#originalSeats, state: this.#state,
      publicationRevision: this.#publicationRevision, presence: this.presenceSnapshot,
      cacheLimit: this.#cacheLimit,
      commandCache: [...this.#cache].map(([sessionId, entries]) => ({ sessionId, entries: [...entries.values()] })),
      aiCommandCount: this.#aiCommandCount, turnIdentity: this.#turnIdentity,
      ownCommandKeys: [...this.#ownCommandKeys].map(([playerId, keys]) => ({ playerId, keys })), failed: this.#failed })
  }

  /** Shutdown preserves the durable lifecycle; it does not close a recoverable game. */
  public stop(): void { this.#stopping = true; this.#presenceEpoch += 1; this.#stopChoice?.() }
  public drain(): Promise<void> { return this.#queue.idle() }
  /** Node-only aggregate counts for bounded resource verification; never a network contract. */
  public resources(): Readonly<Record<'queue' | 'cache' | 'views' | 'listeners' | 'aiTasks' | 'aiWaiters', number>> {
    return { queue: this.#queue.size, cache: [...this.#cache.values()].reduce((sum, entries) => sum + entries.size, 0),
      views: this.#committedViews.size, listeners: this.#listeners.size, aiTasks: this.#aiTask === null ? 0 : 1,
      aiWaiters: this.#stopChoice === null ? 0 : 1 }
  }

  public get lifecycleStatus(): GameUpdate['lifecycleStatus'] {
    return this.#closed ? 'CLOSED' : this.#state.winnerId !== null ? 'FINISHED' : this.#failed ? 'ERROR'
      : this.#disconnectedSeats.some((seat) => seat.replacementRequired) ? 'PAUSED_REPLACEMENT_REQUIRED'
        : this.#disconnectedSeats.length > 0 ? 'PAUSED_RECONNECTING' : 'ACTIVE'
  }

  public get presenceSnapshot(): GamePresence {
    return gamePresenceSchema.parse({ lifecycleStatus: this.lifecycleStatus,
      disconnectedSeats: this.#disconnectedSeats, abandonedDeadlineMs: this.#abandonedDeadlineMs,
      replacements: CANONICAL_SEAT_IDS.flatMap((seatId) => {
        const profileId = this.#replacementProfiles.get(seatId)
        return profileId === undefined ? [] : [{ seatId, profileId }]
      }) })
  }

  /** Immediate transport safety latch; this never changes core state or RNG. */
  public async setPresence(disconnectedSeats: readonly DisconnectedSeatPresence[], abandonedDeadlineMs: number | null, publish = true): Promise<void> {
    if (this.#closed) return
    this.#transportPaused = false
    if (JSON.stringify(disconnectedSeats) === JSON.stringify(this.#disconnectedSeats)
      && abandonedDeadlineMs === this.#abandonedDeadlineMs) return
    this.#disconnectedSeats = structuredClone(disconnectedSeats)
    this.#abandonedDeadlineMs = abandonedDeadlineMs
    this.#presenceEpoch += 1
    if (publish) await this.#publish()
  }

  public async replaceHuman(
    sessionId: SessionId,
    profileId: LobbyAiProfileId,
    isAuthorized: () => boolean,
    applyRoomReplacement: () => Promise<void>,
  ): Promise<'REPLACED' | 'NOT_AUTHORIZED' | 'NOT_REPLACEABLE' | 'BUSY'> {
    try {
      return await this.#queue.run(async () => {
        if (!isAuthorized()) return 'NOT_AUTHORIZED'
        const actorId = this.#humanPlayers.get(sessionId)
        const seatId = CANONICAL_SEAT_IDS.find((seat) => this.#seatPlayers.get(seat) === actorId)
        if (actorId === undefined || seatId === undefined || this.lifecycleStatus !== 'PAUSED_REPLACEMENT_REQUIRED'
          || !this.#disconnectedSeats.some((seat) => seat.seatId === seatId && seat.replacementRequired)) return 'NOT_REPLACEABLE'
        this.#replacementProfiles.set(seatId, profileId)
        this.#humanPlayers.delete(sessionId)
        this.#cache.delete(sessionId)
        this.#presenceEpoch += 1
        await applyRoomReplacement()
        await this.#runAi()
        return 'REPLACED'
      })
    } catch (error: unknown) {
      if (error instanceof GameQueueFullError) return 'BUSY'
      throw error
    }
  }

  public close(): void {
    this.stop()
    this.#closed = true
    this.#presenceEpoch += 1
    this.#listeners.clear()
    this.#cache.clear()
    this.#committedViews.clear()
    this.#committedHumans.clear()
    this.#committedState = null
    this.#committedPresence = null
  }

  #controller(playerId: PlayerId): PlayerController {
    const seatId = CANONICAL_SEAT_IDS.find((seat) => this.#seatPlayers.get(seat) === playerId)
    const replacement = seatId === undefined ? undefined : this.#replacementProfiles.get(seatId)
    if (replacement !== undefined) return { type: 'AI', profileId: replacement as AiProfileId }
    const controller = this.#state.players[playerId]?.controller
    if (controller === undefined) throw new Error('Online controller requires a game player.')
    return controller
  }

  #playerView(playerId: PlayerId): PlayerView {
    // AI needs a fresh candidate view. Only committed Human snapshots are cached (at most four).
    const view = gameEngine.createPlayerView(this.#state, playerId)
    return { ...view, self: { ...view.self, controller: this.#controller(view.self.id) },
      opponents: view.opponents.map((player) => ({ ...player, controller: this.#controller(player.id) })) }
  }

  public playerForSeat(seatId: SeatId): PlayerId | undefined { return this.#seatPlayers.get(seatId) }
  public playerForSession(sessionId: SessionId): PlayerId | undefined { return this.#humanPlayers.get(sessionId) }

  public subscribe(listener: (publication: GamePublication) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  /** Immediate cancellation latch is separate from the durable presence candidate. */
  public pauseTransport(): void { this.#transportPaused = true; this.#presenceEpoch += 1; this.#stopChoice?.() }

  /** Called only after the enclosing aggregate commits. No candidate view escapes during I/O. */
  public acceptCommit(): void {
    this.#committedViews.clear()
    this.#committedState = this.#state
    this.#committedPresence = this.presenceSnapshot
    this.#committedRevision = this.#publicationRevision
    this.#committedHumans = new Map(this.#humanPlayers)
  }

  public snapshot(sessionId: SessionId): GameUpdate {
    let snapshot = this.#committedViews.get(sessionId)
    if (snapshot === undefined) {
      const viewer = this.#committedHumans.get(sessionId)
      const state = this.#committedState
      const presence = this.#committedPresence
      if (viewer === undefined || state === null || presence === null) throw new Error('Snapshot requires a committed Human session.')
      const controller = (playerId: PlayerId): PlayerController => {
        const replacement = presence.replacements.find((entry) => this.#seatPlayers.get(entry.seatId) === playerId)
        const original = state.players[playerId]?.controller
        if (original === undefined) throw new Error('Committed player invariant failed.')
        return replacement === undefined ? original : { type: 'AI', profileId: replacement.profileId as AiProfileId }
      }
      const view = gameEngine.createPlayerView(state, viewer)
      snapshot = gameUpdateSchema.parse({ protocolVersion: REALTIME_PROTOCOL_VERSION,
        roomCode: this.roomCode, gameId: this.gameId, publicationRevision: this.#committedRevision,
        lifecycleStatus: presence.lifecycleStatus, presence,
        aiThinking: presence.lifecycleStatus === 'ACTIVE' && controller(nextGameDecisionActor(state)).type === 'AI',
        view: { ...view, self: { ...view.self, controller: controller(view.self.id) },
          opponents: view.opponents.map((player) => ({ ...player, controller: controller(player.id) })) }, events: [] })
      this.#committedViews.set(sessionId, snapshot)
    }
    return structuredClone(snapshot)
  }

  /** Focused command boundary; explicit AI advances also use this same execution queue. */
  public submitHuman(sessionId: SessionId, request: GameCommandRequest): Promise<GameCommandAcknowledgement> {
    const detached = structuredClone(request)
    return this.#enqueueHuman(async () => (await this.#executeHuman(sessionId, detached)).acknowledgement)
  }

  /** Complete transport pipeline. Revalidate the live attachment after admission and before cache lookup. */
  public dispatchHuman(
    sessionId: SessionId,
    request: GameCommandRequest,
    isAuthorized: () => boolean,
  ): Promise<GameCommandAcknowledgement> {
    const detached = structuredClone(request)
    return this.#enqueueHuman(async () => {
      if (!isAuthorized()) return createSafeErrorAcknowledgement('NOT_ROOM_MEMBER', 'Resume your Human seat before playing.')
      // This Room queue remains held across the durable transaction and publication.
      const execution = await this.#executeHuman(sessionId, detached, false)
      if (execution.changed) {
        await this.#publish()
        await this.#runAi()
      }
      return execution.acknowledgement
    })
  }

  async #enqueueHuman(operation: () => GameCommandAcknowledgement | Promise<GameCommandAcknowledgement>): Promise<GameCommandAcknowledgement> {
    try { return await this.#queue.run(operation) } catch (error: unknown) {
      if (error instanceof GameQueueFullError) return createSafeErrorAcknowledgement('GAME_BUSY', 'The game is busy. Retry this action shortly.')
      throw error
    }
  }

  async #executeHuman(sessionId: SessionId, request: GameCommandRequest, commitAccepted = true): Promise<HumanExecution> {
    const unchanged = (acknowledgement: GameCommandAcknowledgement): HumanExecution => ({ acknowledgement, changed: false })
    if (this.#stopping) return unchanged(createSafeErrorAcknowledgement('GAME_UNAVAILABLE', 'The multiplayer server is stopping. Resume shortly.'))
    const actorId = this.#humanPlayers.get(sessionId)
    if (actorId === undefined) return unchanged(createSafeErrorAcknowledgement('NOT_ROOM_MEMBER', 'Resume your Human seat first.'))
    if (request.roomCode !== this.roomCode || request.gameId !== this.gameId) {
      return unchanged(createSafeErrorAcknowledgement('GAME_NOT_FOUND', 'This game is unavailable for your session.'))
    }
    const fingerprint = commandRequestFingerprint(request)
    const cache = this.#cache.get(sessionId) ?? new Map<CommandId, CachedCommandResult>()
    const cached = cache.get(request.commandId)
    if (cached !== undefined) return unchanged(cached.fingerprint === fingerprint
      ? { ok: true, data: structuredClone(cached.result) }
      : createSafeErrorAcknowledgement('COMMAND_ID_CONFLICT', 'This command ID was already used for a different request. Resynchronize before a new action.'))
    if (this.#closed) return unchanged(createSafeErrorAcknowledgement('ROOM_CLOSED', 'This online game has closed.'))
    if (this.#transportPaused || this.lifecycleStatus === 'PAUSED_RECONNECTING' || this.lifecycleStatus === 'PAUSED_REPLACEMENT_REQUIRED') {
      return unchanged(createSafeErrorAcknowledgement('GAME_PAUSED', 'The game is paused until every Human reconnects or an expired seat is replaced.'))
    }
    if (this.#failed) return unchanged(createSafeErrorAcknowledgement('GAME_UNAVAILABLE', 'The game could not continue. Request a fresh snapshot.'))
    const result = gameEngine.execute(this.#state, {
      commandId: request.commandId, expectedStateVersion: request.expectedStateVersion,
      actorId, command: request.command,
    })
    if (result.ok) this.#accept(result.state, result.events, actorId, request.command)
    const data: GameCommandResult = result.ok
      ? { accepted: true, commandId: request.commandId, stateVersion: this.#state.stateVersion }
      : { accepted: false, commandId: request.commandId, stateVersion: this.#state.stateVersion,
          violation: { code: result.violation.code } }
    cache.set(request.commandId, { fingerprint, result: data })
    if (cache.size > this.#cacheLimit) {
      const oldest = cache.keys().next().value
      if (oldest !== undefined) cache.delete(oldest)
    }
    this.#cache.set(sessionId, cache)
    if (!result.ok || commitAccepted) { await this.#commit(); this.acceptCommit() }
    return { acknowledgement: { ok: true, data: structuredClone(data) }, changed: result.ok }
  }

  /** Publish a committed transition or lifecycle change; every emission is viewer-specific. */
  public publish(): Promise<void> { return this.#queue.run(async () => { if (!this.#stopping) await this.#publish() }) }

  async #publish(): Promise<void> {
    this.#publicationRevision += 1
    await this.#commit()
    this.acceptCommit()
    const events = this.#pendingEvents
    this.#pendingEvents = []
    for (const [sessionId, viewer] of this.#committedHumans) {
      const publication = { sessionId, update: { ...this.snapshot(sessionId), events: [...createPlayerEventViews(events, viewer)] } }
      for (const listener of this.#listeners) listener(publication)
    }
  }

  public advanceAi(): Promise<void> {
    if (this.#stopping || this.lifecycleStatus !== 'ACTIVE') return Promise.resolve()
    if (this.#aiTask !== null) return this.#aiTask
    this.#aiTask = this.#queue.run(() => this.#runAi()).finally(() => { this.#aiTask = null })
    return this.#aiTask
  }

  #accept(state: GameState, events: readonly GameEvent[], actorId: PlayerId, command: GameCommand): void {
    if (state.stateVersion !== this.#state.stateVersion + 1) throw new Error('Game command made no version progress.')
    assertTradingState(state)
    this.#afterTransition?.(state, command)
    const identity = turnIdentity(state)
    if (identity !== this.#turnIdentity) {
      this.#ownCommandKeys.clear()
      this.#turnIdentity = identity
    } else if (this.#controller(actorId).type === 'AI') {
      const keys = this.#ownCommandKeys.get(actorId) ?? []
      // An AI never receives another actor's private discard, card or trade command history.
      keys.push(createAiCommandKey(command))
      this.#ownCommandKeys.set(actorId, keys)
    }
    this.#state = state
    this.#pendingEvents = [...this.#pendingEvents, ...events]
  }

  async #runAi(): Promise<void> {
    try {
      for (let count = 0; !this.#stopping && !this.#transportPaused && this.lifecycleStatus === 'ACTIVE'; count += 1) {
        const actorId = nextGameDecisionActor(this.#state)
        const controller = this.#controller(actorId)
        if (controller.type !== 'AI') return
        if (count >= this.#advanceLimit || this.#aiCommandCount >= this.#aiLimits.maxCommandsPerGame) {
          throw new Error('AI command bound reached.')
        }
        const version = this.#state.stateVersion
        const presenceEpoch = this.#presenceEpoch
        const keys = this.#ownCommandKeys.get(actorId) ?? []
        if (keys.length >= this.#aiLimits.maxCommandsPerTurn) throw new Error('AI turn command bound reached.')
        const choice = this.#aiAgent.chooseNextCommand(this.#playerView(actorId), {
          profileId: controller.profileId, commandNumberThisTurn: keys.length,
          commandNumberThisGame: this.#aiCommandCount, previousCommandKeysThisTurn: [...keys], limits: this.#aiLimits,
        })
        const stopped = new Promise<{ readonly kind: 'STOPPED' }>((resolve) => {
          this.#stopChoice = () => resolve({ kind: 'STOPPED' })
        })
        const selected = await Promise.race([choice.then((command) => ({ kind: 'COMMAND' as const, command })), stopped])
          .finally(() => { this.#stopChoice = null })
        if (selected.kind === 'STOPPED' || this.#transportPaused || this.#stopping || this.lifecycleStatus !== 'ACTIVE') return
        const command = selected.command
        if (presenceEpoch !== this.#presenceEpoch) continue
        if (version !== this.#state.stateVersion) throw new Error('Game mutation escaped the execution queue.')
        const key = createAiCommandKey(command)
        if (keys.filter((previous) => previous === key).length >= this.#aiLimits.maxRepeatedCommandPerTurn) {
          throw new Error('AI repeated-command guard reached.')
        }
        const result = gameEngine.execute(this.#state, {
          commandId: `server-ai:${this.gameId}:${this.#aiCommandCount}` as CommandId,
          actorId, expectedStateVersion: version, command,
        })
        if (!result.ok) throw new Error('AI submitted an illegal command.')
        this.#aiCommandCount += 1
        this.#accept(result.state, result.events, actorId, command)
        await this.#publish()
      }
    } catch (error: unknown) {
      if (error instanceof PersistenceError) throw error
      if (this.#stopping || this.lifecycleStatus !== 'ACTIVE') return
      this.#failed = true
      await this.#publish()
    }
  }
}
