import type { GameCommand } from '../../game/contracts/commands.ts'
import type { GameConfig } from '../../game/model/game-config.ts'
import type { GameState } from '../../game/model/game-state.ts'
import type { AiProfileId, CommandId, GameId, PlayerId } from '../../game/model/ids.ts'
import { RULESET_ID } from '../../game/model/ruleset.ts'
import { gameEngine } from '../../game/engine/game-engine.ts'
import { assertTradingState } from '../../game/engine/trading-invariants.ts'
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
}

export interface CoreAiSimulationSummary {
  readonly seed: string
  readonly winnerId: PlayerId
  readonly commands: number
  readonly turns: number
  readonly finalStateVersion: number
  readonly finalRandomDrawCount: number
}

function simulationConfig(seed: string): GameConfig {
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
        controller: { type: 'AI', profileId: 'CORE' as AiProfileId },
      },
      {
        id: south,
        name: 'South',
        color: 'ORANGE',
        controller: { type: 'AI', profileId: 'CORE' as AiProfileId },
      },
      {
        id: west,
        name: 'West',
        color: 'WHITE',
        controller: { type: 'AI', profileId: 'CORE' as AiProfileId },
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
  let state = gameEngine.createGame(simulationConfig(seed), seed)
  let commands = 0
  let currentTurnIdentity = turnIdentity(state)
  let commandKeysThisTurn: string[] = []
  const seenProgressStates = new Set<string>()
  assertTradingState(state)
  seenProgressStates.add(progressFingerprint(state))

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
    let command: GameCommand
    try {
      command = await agent.chooseNextCommand(view, {
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
    assertTradingState(result.state)
    const progressKey = progressFingerprint(result.state)
    if (seenProgressStates.has(progressKey)) {
      throw trace(seed, result.state, actorId, command, 'repeated progress state detected')
    }
    seenProgressStates.add(progressKey)
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
