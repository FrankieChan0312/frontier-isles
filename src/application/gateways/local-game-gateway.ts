import type { CommandEnvelope, GameCommand } from '../../game/contracts/commands.ts'
import type { EngineResult } from '../../game/contracts/engine-result.ts'
import type { PlayerEventView } from '../../game/contracts/player-events.ts'
import type { PlayerView } from '../../game/contracts/views.ts'
import type { GameConfig } from '../../game/model/game-config.ts'
import type { GameState } from '../../game/model/game-state.ts'
import type { AiProfileId, CommandId, GameId, PlayerId } from '../../game/model/ids.ts'
import { gameEngine, type GameEngine } from '../../game/engine/game-engine.ts'
import { createPlayerEventViews } from '../../game/selectors/player-event-view.ts'
import {
  DEFAULT_AI_SAFETY_LIMITS,
  type AiAgent,
  type AiSafetyLimits,
} from '../../ai/ai-agent.ts'
import { createAiCommandKey } from '../../ai/core-ai-agent.ts'
import { PersonalityAiAgent } from '../../ai/personality-ai-agent.ts'
import type { GameSaveRepository } from '../../infrastructure/persistence/game-save-repository.ts'
import {
  GAME_SAVE_SCHEMA_VERSION,
  parseGameSave,
  serializeGameSave,
  type GameSaveEnvelope,
} from '../../infrastructure/persistence/game-save-format.ts'
import type {
  CommandResponse,
  GameGateway,
  GameUpdate,
  GatewayConnectionStatus,
  GatewaySaveStatus,
} from './game-gateway.ts'

export interface LocalGameGatewayDependencies {
  readonly saveRepository: GameSaveRepository
  readonly engine?: GameEngine
  readonly aiAgent?: AiAgent
  readonly aiSafetyLimits?: AiSafetyLimits
  readonly now?: () => string
}

function nextDecisionActor(state: GameState): PlayerId {
  const pending = state.pendingDecision
  if (pending?.type === 'DISCARD_RESOURCES') {
    const actorId = state.playerOrder.find(
      (playerId) => pending.requiredCountByPlayer[playerId] !== undefined
        && !pending.completedPlayerIds.includes(playerId),
    )
    if (actorId === undefined) throw new Error('Discard decision has no remaining actor.')
    return actorId
  }
  if (pending?.type === 'RESPOND_TO_TRADE') return pending.responderId
  if (pending !== null && pending !== undefined && 'actingPlayerId' in pending) {
    return pending.actingPlayerId
  }
  return state.turn.currentPlayerId
}

function turnIdentity(state: GameState): string {
  if (state.turn.setup !== null) {
    return `setup:${state.turn.setup.round}:${state.turn.setup.placementIndex}:${state.turn.currentPlayerId}`
  }
  return `turn:${state.turn.turnNumber}:${state.turn.currentPlayerId}`
}

function defaultNow(): string {
  return new Date().toISOString()
}

export class LocalGameGateway implements GameGateway {
  readonly #saveRepository: GameSaveRepository
  readonly #engine: GameEngine
  readonly #aiAgent: AiAgent
  readonly #aiSafetyLimits: AiSafetyLimits
  readonly #now: () => string
  readonly #listeners = new Set<(update: GameUpdate) => void>()
  #state: GameState | null = null
  #humanPlayerId: PlayerId | null = null
  #displaySeed = ''
  #aiProfileAssignments: Readonly<Record<PlayerId, AiProfileId>> = {}
  #commandCounter = 0
  #commandCountThisGame = 0
  #currentTurnIdentity = ''
  #commandKeysThisTurn: string[] = []
  #recentEvents: PlayerEventView[] = []
  #connectionStatus: GatewayConnectionStatus = 'IDLE'
  #saveStatus: GatewaySaveStatus = 'IDLE'
  #aiThinking = false
  #error: string | null = null

  constructor(dependencies: LocalGameGatewayDependencies) {
    this.#saveRepository = dependencies.saveRepository
    this.#engine = dependencies.engine ?? gameEngine
    this.#aiAgent = dependencies.aiAgent ?? new PersonalityAiAgent()
    this.#aiSafetyLimits = dependencies.aiSafetyLimits ?? DEFAULT_AI_SAFETY_LIMITS
    this.#now = dependencies.now ?? defaultNow
  }

  subscribe(listener: (update: GameUpdate) => void): () => void {
    this.#listeners.add(listener)
    listener(this.#createUpdate([]))
    return () => this.#listeners.delete(listener)
  }

  async createGame(config: GameConfig, seed: string): Promise<PlayerView> {
    const state = this.#engine.createGame(config, seed)
    const human = Object.values(state.players).find((player) => player.controller.type === 'HUMAN')
    if (human === undefined) throw new Error('Local game requires one Human player.')
    this.#state = state
    this.#humanPlayerId = human.id
    this.#displaySeed = seed
    this.#aiProfileAssignments = this.#deriveProfileAssignments(state, human.id)
    this.#commandCounter = 0
    this.#commandCountThisGame = 0
    this.#currentTurnIdentity = turnIdentity(state)
    this.#commandKeysThisTurn = []
    this.#recentEvents = []
    this.#connectionStatus = 'READY'
    this.#error = null
    this.#publish([])
    await this.#persist()
    await this.#runAiUntilHumanBoundary()
    return this.#humanView()
  }

  async submit(envelope: CommandEnvelope): Promise<CommandResponse> {
    const state = this.#requireState()
    const humanPlayerId = this.#requireHumanPlayerId()
    if (envelope.actorId !== humanPlayerId) {
      return {
        ok: false,
        violation: { code: 'NOT_YOUR_TURN' },
        view: this.#humanView(),
      }
    }
    const result = this.#engine.execute(state, envelope)
    if (!result.ok) {
      return { ok: false, violation: result.violation, view: this.#humanView() }
    }
    const events = await this.#acceptTransition(result, envelope.command)
    const aiEvents = await this.#runAiUntilHumanBoundary()
    return {
      ok: true,
      view: this.#humanView(),
      events: [...events, ...aiEvents],
    }
  }

  async saveGame(): Promise<void> {
    this.#requireState()
    await this.#persist()
  }

  async loadGame(gameId: GameId): Promise<PlayerView> {
    const view = await this.loadLatestGame()
    const state = this.#requireState()
    if (state.gameId !== gameId) {
      const message = `Saved game ${state.gameId} does not match requested game ${gameId}.`
      this.#setError(message)
      throw new Error(message)
    }
    return view
  }

  async loadLatestGame(): Promise<PlayerView> {
    const serialized = await this.#saveRepository.read()
    if (serialized === null) {
      const message = 'No saved game is available.'
      this.#setError(message)
      throw new Error(message)
    }
    const parsed = parseGameSave(serialized)
    if (!parsed.ok) {
      this.#setError(parsed.error)
      throw new Error(parsed.error)
    }
    const save = parsed.save
    this.#state = save.state
    this.#humanPlayerId = save.humanPlayerId
    this.#displaySeed = save.displaySeed
    this.#aiProfileAssignments = save.aiProfileAssignments
    this.#commandCounter = save.orchestration.commandCounter
    this.#commandCountThisGame = save.orchestration.commandCountThisGame
    this.#currentTurnIdentity = save.orchestration.turnIdentity
    this.#commandKeysThisTurn = [...save.orchestration.commandKeysThisTurn]
    this.#recentEvents = []
    this.#connectionStatus = 'READY'
    this.#saveStatus = 'SAVED'
    this.#error = null
    this.#publish([])
    await this.#runAiUntilHumanBoundary()
    return this.#humanView()
  }

  async hasSavedGame(): Promise<boolean> {
    const serialized = await this.#saveRepository.read()
    return serialized !== null && parseGameSave(serialized).ok
  }

  async deleteSavedGame(): Promise<void> {
    await this.#saveRepository.delete()
    this.#saveStatus = 'IDLE'
    this.#publish([])
  }

  #requireState(): GameState {
    if (this.#state === null) throw new Error('LocalGameGateway has no active game.')
    return this.#state
  }

  #requireHumanPlayerId(): PlayerId {
    if (this.#humanPlayerId === null) throw new Error('LocalGameGateway has no Human viewer.')
    return this.#humanPlayerId
  }

  #humanView(): PlayerView {
    return this.#engine.createPlayerView(this.#requireState(), this.#requireHumanPlayerId())
  }

  #createUpdate(events: readonly PlayerEventView[]): GameUpdate {
    return {
      view: this.#state === null || this.#humanPlayerId === null ? null : this.#humanView(),
      events: [...events],
      connectionStatus: this.#connectionStatus,
      aiThinking: this.#aiThinking,
      saveStatus: this.#saveStatus,
      error: this.#error,
    }
  }

  #publish(events: readonly PlayerEventView[]): void {
    const update = this.#createUpdate(events)
    for (const listener of this.#listeners) listener(update)
  }

  #setError(message: string): void {
    this.#connectionStatus = 'ERROR'
    this.#error = message
    this.#aiThinking = false
    this.#publish([])
  }

  #deriveProfileAssignments(
    state: GameState,
    humanPlayerId: PlayerId,
  ): Readonly<Record<PlayerId, AiProfileId>> {
    const assignments = {} as Record<PlayerId, AiProfileId>
    for (const playerId of state.playerOrder) {
      if (playerId === humanPlayerId) continue
      const player = state.players[playerId]
      if (player?.controller.type !== 'AI') {
        throw new Error(`Non-Human player ${playerId} must have an AI controller.`)
      }
      assignments[playerId] = player.controller.profileId
    }
    return assignments
  }

  #saveEnvelope(): GameSaveEnvelope {
    const state = this.#requireState()
    return {
      schemaVersion: GAME_SAVE_SCHEMA_VERSION,
      savedAt: this.#now(),
      gameId: state.gameId,
      displaySeed: this.#displaySeed,
      humanPlayerId: this.#requireHumanPlayerId(),
      aiProfileAssignments: this.#aiProfileAssignments,
      orchestration: {
        commandCounter: this.#commandCounter,
        commandCountThisGame: this.#commandCountThisGame,
        turnIdentity: this.#currentTurnIdentity,
        commandKeysThisTurn: [...this.#commandKeysThisTurn],
      },
      state,
    }
  }

  async #persist(): Promise<void> {
    this.#saveStatus = 'SAVING'
    this.#publish([])
    try {
      await this.#saveRepository.write(serializeGameSave(this.#saveEnvelope()))
      this.#saveStatus = 'SAVED'
      this.#publish([])
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.#saveStatus = 'ERROR'
      this.#error = `Could not save game: ${message}`
      this.#publish([])
      throw error
    }
  }

  async #acceptTransition(
    result: Extract<EngineResult, { readonly ok: true }>,
    command: GameCommand,
  ): Promise<readonly PlayerEventView[]> {
    const previousState = this.#requireState()
    if (result.state.stateVersion !== previousState.stateVersion + 1) {
      throw new Error('Gateway accepted transition did not advance exactly one state version.')
    }
    this.#commandCountThisGame += 1
    this.#commandKeysThisTurn.push(createAiCommandKey(command))
    this.#state = result.state
    this.#refreshTurnTracking(result.state)
    const events = createPlayerEventViews(result.events, this.#requireHumanPlayerId())
    this.#recentEvents = [...this.#recentEvents, ...events].slice(-100)
    this.#publish(events)
    await this.#persist()
    return events
  }

  #refreshTurnTracking(state: GameState): void {
    const identity = turnIdentity(state)
    if (identity === this.#currentTurnIdentity) return
    this.#currentTurnIdentity = identity
    this.#commandKeysThisTurn = []
  }

  async #runAiUntilHumanBoundary(): Promise<readonly PlayerEventView[]> {
    const allEvents: PlayerEventView[] = []
    const humanPlayerId = this.#requireHumanPlayerId()
    while (this.#requireState().winnerId === null) {
      const state = this.#requireState()
      const actorId = nextDecisionActor(state)
      if (actorId === humanPlayerId) break
      this.#refreshTurnTracking(state)
      this.#aiThinking = true
      this.#publish([])
      const view = this.#engine.createPlayerView(state, actorId)
      let command: GameCommand
      try {
        if (this.#commandCountThisGame >= this.#aiSafetyLimits.maxCommandsPerGame) {
          throw new Error(`AI game command budget ${this.#aiSafetyLimits.maxCommandsPerGame} exhausted.`)
        }
        if (this.#commandKeysThisTurn.length >= this.#aiSafetyLimits.maxCommandsPerTurn) {
          if (view.legalActions.canEndTurn) command = { type: 'END_TURN' }
          else throw new Error(`AI turn command budget ${this.#aiSafetyLimits.maxCommandsPerTurn} exhausted.`)
        } else {
          const profileId = this.#aiProfileAssignments[actorId]
          if (profileId === undefined) throw new Error(`Missing AI profile assignment for ${actorId}.`)
          command = await this.#aiAgent.chooseNextCommand(view, {
            profileId,
            commandNumberThisTurn: this.#commandKeysThisTurn.length,
            commandNumberThisGame: this.#commandCountThisGame,
            previousCommandKeysThisTurn: this.#commandKeysThisTurn,
            limits: this.#aiSafetyLimits,
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        this.#setError(`AI decision failed for ${actorId} at state ${state.stateVersion}: ${message}`)
        throw error
      }
      const result = this.#engine.execute(state, {
        commandId: `command:gateway:ai:${this.#commandCounter}` as CommandId,
        actorId,
        expectedStateVersion: state.stateVersion,
        command,
      })
      this.#commandCounter += 1
      if (!result.ok) {
        const message = `AI command ${createAiCommandKey(command)} failed with ${result.violation.code}.`
        this.#setError(message)
        throw new Error(message)
      }
      const events = await this.#acceptTransition(result, command)
      allEvents.push(...events)
    }
    this.#aiThinking = false
    this.#publish([])
    return allEvents
  }
}
