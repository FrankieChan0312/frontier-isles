import type { GameCommand } from '../game/contracts/commands.ts'
import type { PlayerView } from '../game/contracts/views.ts'

export interface AiSafetyLimits {
  readonly maxCommandsPerTurn: number
  readonly maxCommandsPerGame: number
  readonly maxRepeatedCommandPerTurn: number
}

export interface AiDecisionContext {
  readonly commandNumberThisTurn: number
  readonly commandNumberThisGame: number
  readonly previousCommandKeysThisTurn: readonly string[]
  readonly limits: AiSafetyLimits
}

export interface AiAgent {
  chooseNextCommand(
    view: PlayerView,
    context: AiDecisionContext,
  ): Promise<GameCommand>
}

export const DEFAULT_AI_SAFETY_LIMITS: AiSafetyLimits = Object.freeze({
  maxCommandsPerTurn: 100,
  maxCommandsPerGame: 20_000,
  maxRepeatedCommandPerTurn: 12,
})
