import type { CommandEnvelope } from '../contracts/commands.ts'
import type { EngineResult } from '../contracts/engine-result.ts'
import type { PlayerView } from '../contracts/views.ts'
import type { GameConfig } from '../model/game-config.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerId } from '../model/ids.ts'
import { assertNever } from '../model/assert-never.ts'
import { createPlayerView } from '../selectors/player-view.ts'
import { createGame as createAuthoritativeGame } from './create-game.ts'
import { executeDevelopmentCardLifecycleCommand } from './development-card-lifecycle-engine.ts'
import { executeInitialSetupCommand } from './initial-setup-engine.ts'
import { executeNormalTurnLifecycleCommand } from './normal-turn-lifecycle-engine.ts'
import { executePaidBuildingCommand } from './paid-building-engine.ts'
import { executeRobberWorkflowCommand } from './robber-workflow-engine.ts'
import { executeTradingCommand } from './trading-engine.ts'
import { assertTradingState } from './trading-invariants.ts'

export interface GameEngine {
  createGame(config: GameConfig, seed: string): GameState
  execute(state: GameState, envelope: CommandEnvelope): EngineResult
  createPlayerView(state: GameState, viewerId: PlayerId): PlayerView
}

export function executeGameCommand(
  state: GameState,
  envelope: CommandEnvelope,
): EngineResult {
  assertTradingState(state)
  switch (envelope.command.type) {
    case 'PLACE_INITIAL_SETTLEMENT':
    case 'PLACE_INITIAL_ROAD':
      return executeInitialSetupCommand(state, {
        ...envelope,
        command: envelope.command,
      })
    case 'ROLL_DICE':
    case 'END_TURN':
      return executeNormalTurnLifecycleCommand(state, {
        ...envelope,
        command: envelope.command,
      })
    case 'DISCARD_RESOURCES':
    case 'MOVE_ROBBER':
    case 'STEAL_FROM_PLAYER':
      return executeRobberWorkflowCommand(state, {
        ...envelope,
        command: envelope.command,
      })
    case 'BUILD_SETTLEMENT':
    case 'UPGRADE_CITY':
      return executePaidBuildingCommand(state, {
        ...envelope,
        command: envelope.command,
      })
    case 'BUILD_ROAD':
      return state.turn.phase === 'FREE_ROAD_PLACEMENT'
        || state.pendingDecision?.type === 'PLACE_FREE_ROADS'
        ? executeDevelopmentCardLifecycleCommand(state, {
            ...envelope,
            command: envelope.command,
          })
        : executePaidBuildingCommand(state, {
            ...envelope,
            command: envelope.command,
          })
    case 'BUY_DEVELOPMENT_CARD':
    case 'PLAY_DEVELOPMENT_CARD':
    case 'CHOOSE_INVENTION_RESOURCES':
    case 'CHOOSE_MONOPOLY_RESOURCE':
    case 'FINISH_FREE_ROAD_PLACEMENT':
      return executeDevelopmentCardLifecycleCommand(state, {
        ...envelope,
        command: envelope.command,
      })
    case 'PROPOSE_TRADE':
    case 'ACCEPT_TRADE':
    case 'REJECT_TRADE':
    case 'COUNTER_TRADE':
    case 'MARITIME_TRADE':
      return executeTradingCommand(state, {
        ...envelope,
        command: envelope.command,
      })
    default:
      return assertNever(envelope.command)
  }
}

export const gameEngine: GameEngine = {
  createGame: createAuthoritativeGame,
  execute: executeGameCommand,
  createPlayerView,
}
