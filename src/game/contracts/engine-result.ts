import type { GameState } from '../model/game-state.ts'
import type { RuleViolation } from './errors.ts'
import type { GameEvent } from './events.ts'

export type EngineResult =
  | {
      readonly ok: true
      readonly state: GameState
      readonly events: readonly GameEvent[]
    }
  | {
      readonly ok: false
      readonly violation: RuleViolation
    }

