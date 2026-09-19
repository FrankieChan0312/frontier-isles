import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { GameConfig } from '@frontier-isles/game-core/model/game-config'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import type { AiProfileId, CommandId, GameId, PlayerId } from '@frontier-isles/game-core/model/ids'
import { RULESET_ID } from '@frontier-isles/game-core/model/ruleset'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { assertTradingState } from '@frontier-isles/game-core/engine/trading-invariants'
import {
  DEFAULT_AI_SAFETY_LIMITS,
  type AiAgent,
  type AiSafetyLimits,
} from '../ai-agent.ts'
import { createAiCommandKey, DeterministicCoreAiAgent } from '../core-ai-agent.ts'

const SIMULATION_PLAYER_IDS = [
  'player:simulation:north',
  'player:simulation:east',
  'player:simulation:south',
  'player:simulation:west',
] as const satisfies readonly string[]

export interface CoreAiSimulationOptions {
  readonly limits?: AiSafetyLimits
  readonly maxTurns?: number
  readonly agent?: AiAgent
  readonly profileIds?: readonly [AiProfileId, AiProfileId, AiProfileId, AiProfileId]
}

export interface CoreAiSimulationSummary {
  readonly seed: string
  readonly winnerId: PlayerId
  readonly commands: number
  readonly turns: number
  readonly finalStateVersion: number
  readonly finalRandomDrawCount: number
  readonly profileIds: readonly [AiProfileId, AiProfileId, AiProfileId, AiProfileId]
}

const DEFAULT_PROFILE_IDS = [
  'CORE' as AiProfileId,
  'CORE' as AiProfileId,
  'CORE' as AiProfileId,
  'CORE' as AiProfileId,
] as const

function simulationConfig(
  seed: string,
  profileIds: readonly [AiProfileId, AiProfileId, AiProfileId, AiProfileId],
): GameConfig {
  const [north, east, south, west] = SIMULATION_PLAYER_IDS as unknown as readonly [
    PlayerId,
    PlayerId,
    PlayerId,
    PlayerId,
  ]
  return {
    gameId: `game:simulation:${seed}` as GameId,
    rulesetId: RULESET_ID,
    players: [
      { id: north, name: 'North', color: 'RED', controller: { type: 'HUMAN' } },
      {
        id: east,
        name: 'East',
        color: 'BLUE',
        controller: { type: 'AI', profileId: profileIds[1] },
      },
      {
        id: south,
        name: 'South',
        color: 'ORANGE',
        controller: { type: 'AI', profileId: profileIds[2] },
      },
      {
        id: west,
        name: 'West',
        color: 'WHITE',
        controller: { type: 'AI', profileId: profileIds[3] },
      },
    ],
  }
}

function nextDecisionActor(state: GameState): PlayerId {
  const pending = state.pendingDecision
  if (pending?.type === 'DISCARD_RESOURCES') {
    const actorId = state.playerOrder.find(
      (playerId) => pending.requiredCountByPlayer[playerId] !== undefined
        && !pending.completedPlayerIds.includes(playerId),
    )
    if (actorId === undefined) throw new Error('Discard pending state has no remaining actor.')
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

function trace(
  seed: string,
  state: GameState,
  actorId: PlayerId,
  command: GameCommand | null,
  message: string,
): Error {
  return new Error([
    `Core AI simulation failed: ${message}`,
    `seed=${seed}`,
    `stateVersion=${state.stateVersion}`,
    `turn=${state.turn.turnNumber}`,
    `phase=${state.turn.phase}`,
    `actor=${actorId}`,
    `command=${command === null ? 'NONE' : createAiCommandKey(command)}`,
  ].join(' | '))
}

function assertSimulationState(
  seed: string,
  state: GameState,
  actorId: PlayerId,
  command: GameCommand | null,
): void {
  try {
    assertTradingState(state)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw trace(seed, state, actorId, command, `invariant=${message}`)
  }
}

function progressFingerprint(state: GameState): string {
  return JSON.stringify({
    turn: state.turn,
    pendingDecision: state.pendingDecision,
    winnerId: state.winnerId,
    awards: state.awards,
    bank: state.bank,
    players: state.players,
    vertexOccupancy: state.board.vertexOccupancy,
    edgeOccupancy: state.board.edgeOccupancy,
    robberTileId: state.board.robberTileId,
    random: state.random,
  })
}

export async function simulateCoreAiGame(
  seed: string,
  options: CoreAiSimulationOptions = {},
): Promise<CoreAiSimulationSummary> {
  const limits = options.limits ?? DEFAULT_AI_SAFETY_LIMITS
  const maxTurns = options.maxTurns ?? 2_000
  const agent = options.agent ?? new DeterministicCoreAiAgent()
  const profileIds = options.profileIds ?? DEFAULT_PROFILE_IDS
  let state = gameEngine.createGame(simulationConfig(seed, profileIds), seed)
  const profileByPlayerId = new Map<PlayerId, AiProfileId>()
  for (let seatIndex = 0; seatIndex < SIMULATION_PLAYER_IDS.length; seatIndex += 1) {
    const playerId = SIMULATION_PLAYER_IDS[seatIndex]
    const profileId = profileIds[seatIndex]
    if (playerId === undefined || profileId === undefined) {
      throw new Error(`Missing simulation seat or profile at index ${seatIndex}.`)
    }
    profileByPlayerId.set(playerId as PlayerId, profileId)
  }
  let commands = 0
  let currentTurnIdentity = turnIdentity(state)
  let commandKeysThisTurn: string[] = []
  const seenProgressStates = new Map<string, number>()
  assertSimulationState(seed, state, state.turn.currentPlayerId, null)
  seenProgressStates.set(progressFingerprint(state), 1)

  while (state.winnerId === null) {
    if (state.turn.turnNumber > maxTurns) {
      throw trace(seed, state, state.turn.currentPlayerId, null, `turn bound ${maxTurns} exceeded`)
    }
    if (commands >= limits.maxCommandsPerGame) {
      throw trace(
        seed,
        state,
        state.turn.currentPlayerId,
        null,
        `game command bound ${limits.maxCommandsPerGame} exceeded`,
      )
    }
    const nextTurnIdentity = turnIdentity(state)
    if (nextTurnIdentity !== currentTurnIdentity) {
      currentTurnIdentity = nextTurnIdentity
      commandKeysThisTurn = []
    }
    const actorId = nextDecisionActor(state)
    const view = gameEngine.createPlayerView(state, actorId)
    const profileId = profileByPlayerId.get(actorId)
    if (profileId === undefined) throw trace(seed, state, actorId, null, 'missing AI profile')
    let command: GameCommand
    try {
      command = await agent.chooseNextCommand(view, {
        profileId,
        commandNumberThisTurn: commandKeysThisTurn.length,
        commandNumberThisGame: commands,
        previousCommandKeysThisTurn: commandKeysThisTurn,
        limits,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw trace(seed, state, actorId, null, message)
    }
    const beforeVersion = state.stateVersion
    const result = gameEngine.execute(state, {
      commandId: `command:simulation:${commands}` as CommandId,
      actorId,
      expectedStateVersion: beforeVersion,
      command,
    })
    if (!result.ok) {
      throw trace(seed, state, actorId, command, `violation=${result.violation.code}`)
    }
    if (result.state.stateVersion !== beforeVersion + 1) {
      throw trace(seed, state, actorId, command, 'successful command made invalid version progress')
    }
    assertSimulationState(seed, result.state, actorId, command)
    const progressKey = progressFingerprint(result.state)
    const progressOccurrences = (seenProgressStates.get(progressKey) ?? 0) + 1
    if (progressOccurrences > 4) {
      throw trace(seed, result.state, actorId, command, 'repeated progress state detected')
    }
    seenProgressStates.set(progressKey, progressOccurrences)
    commandKeysThisTurn.push(createAiCommandKey(command))
    state = result.state
    commands += 1
  }

  return {
    seed,
    winnerId: state.winnerId,
    commands,
    turns: state.turn.turnNumber,
    finalStateVersion: state.stateVersion,
    finalRandomDrawCount: state.random.drawCount,
    profileIds: [...profileIds],
  }
}

export async function simulateCoreAiGames(
  seeds: readonly string[],
  options: CoreAiSimulationOptions = {},
): Promise<readonly CoreAiSimulationSummary[]> {
  const summaries: CoreAiSimulationSummary[] = []
  for (const seed of seeds) summaries.push(await simulateCoreAiGame(seed, options))
  return summaries
}
