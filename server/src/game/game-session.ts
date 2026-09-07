import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { GameEvent } from '@frontier-isles/game-core/contracts/events'
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
  CANONICAL_SEAT_IDS, REALTIME_PROTOCOL_VERSION, gameUpdateSchema,
  createSafeErrorAcknowledgement, type AiProfileId as LobbyAiProfileId,
  type GameCommandAcknowledgement, type GameCommandRequest, type GameCommandResult,
  type GameUpdate, type RoomCode, type SeatId, type SessionId,
} from '@frontier-isles/realtime-contracts'
import { commandRequestFingerprint } from './command-request-fingerprint.js'
import { GameExecutionQueue, GameQueueFullError } from './game-execution-queue.js'

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
  #state: GameState
  #publicationRevision = 0
  #pendingEvents: readonly GameEvent[] = []
  #aiTask: Promise<void> | null = null
  #failed = false
  #aiCommandCount = 0
  #turnIdentity = ''
  #ownCommandKeys = new Map<PlayerId, string[]>()

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
    this.#queue = new GameExecutionQueue(dependencies.maxQueuedOperations ?? 64)
    this.#afterTransition = dependencies.afterTransition
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
  }

  public get lifecycleStatus(): GameUpdate['lifecycleStatus'] {
    return this.#state.winnerId !== null ? 'FINISHED' : this.#failed ? 'ERROR' : 'ACTIVE'
  }

  public playerForSeat(seatId: SeatId): PlayerId | undefined { return this.#seatPlayers.get(seatId) }
  public playerForSession(sessionId: SessionId): PlayerId | undefined { return this.#humanPlayers.get(sessionId) }

  public subscribe(listener: (publication: GamePublication) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  public snapshot(sessionId: SessionId, events: readonly GameEvent[] = []): GameUpdate {
    const viewer = this.#humanPlayers.get(sessionId)
    if (viewer === undefined) throw new Error('Snapshot requires an authoritative Human session.')
    return gameUpdateSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: this.roomCode, gameId: this.gameId,
      publicationRevision: this.#publicationRevision, lifecycleStatus: this.lifecycleStatus,
      aiThinking: this.lifecycleStatus === 'ACTIVE'
        && this.#state.players[nextGameDecisionActor(this.#state)]?.controller.type === 'AI',
      view: gameEngine.createPlayerView(this.#state, viewer),
      events: createPlayerEventViews(events, viewer),
    })
  }

  /** Focused command boundary; explicit AI advances also use this same execution queue. */
  public submitHuman(sessionId: SessionId, request: GameCommandRequest): Promise<GameCommandAcknowledgement> {
    const detached = structuredClone(request)
    return this.#enqueueHuman(() => this.#executeHuman(sessionId, detached).acknowledgement)
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
      const execution = this.#executeHuman(sessionId, detached)
      if (execution.changed) {
        this.publish()
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

  #executeHuman(sessionId: SessionId, request: GameCommandRequest): HumanExecution {
    const unchanged = (acknowledgement: GameCommandAcknowledgement): HumanExecution => ({ acknowledgement, changed: false })
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
    return { acknowledgement: { ok: true, data: structuredClone(data) }, changed: result.ok }
  }

  /** Publish a committed transition or lifecycle change; every emission is viewer-specific. */
  public publish(): void {
    this.#publicationRevision += 1
    const events = this.#pendingEvents
    this.#pendingEvents = []
    for (const sessionId of this.#humanPlayers.keys()) {
      const publication = { sessionId, update: this.snapshot(sessionId, events) }
      for (const listener of this.#listeners) listener(publication)
    }
  }

  public advanceAi(): Promise<void> {
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
    } else if (state.players[actorId]?.controller.type === 'AI') {
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
      for (let count = 0; this.lifecycleStatus === 'ACTIVE'; count += 1) {
        const actorId = nextGameDecisionActor(this.#state)
        const player = this.#state.players[actorId]
        if (player?.controller.type !== 'AI') return
        if (count >= this.#advanceLimit || this.#aiCommandCount >= this.#aiLimits.maxCommandsPerGame) {
          throw new Error('AI command bound reached.')
        }
        const version = this.#state.stateVersion
        const keys = this.#ownCommandKeys.get(actorId) ?? []
        if (keys.length >= this.#aiLimits.maxCommandsPerTurn) throw new Error('AI turn command bound reached.')
        const command = await this.#aiAgent.chooseNextCommand(gameEngine.createPlayerView(this.#state, actorId), {
          profileId: player.controller.profileId, commandNumberThisTurn: keys.length,
          commandNumberThisGame: this.#aiCommandCount, previousCommandKeysThisTurn: [...keys], limits: this.#aiLimits,
        })
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
        this.publish()
      }
    } catch {
      this.#failed = true
      this.publish()
    }
  }
}
