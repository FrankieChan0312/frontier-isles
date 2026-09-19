import type { AwardState } from './awards.ts'
import type { BankState } from './bank.ts'
import type { BoardState } from './board-state.ts'
import type { FourPlayerTuple } from './game-config.ts'
import type { GameId, PlayerId } from './ids.ts'
import type { PendingDecision } from './pending-decision.ts'
import type { PlayerState } from './player.ts'
import {
  GAME_STATE_SCHEMA_VERSION,
  RANDOM_ALGORITHM_ID,
  RULESET_ID,
} from './ruleset.ts'
import type { TurnState } from './turn.ts'

export interface RandomState {
  readonly algorithm: typeof RANDOM_ALGORITHM_ID
  readonly seed: string
  readonly state: number
  readonly drawCount: number
}

export interface GameState {
  readonly schemaVersion: typeof GAME_STATE_SCHEMA_VERSION
  readonly gameId: GameId
  readonly stateVersion: number
  readonly rulesetId: typeof RULESET_ID
  readonly board: BoardState
  readonly players: Readonly<Record<PlayerId, PlayerState>>
  readonly playerOrder: FourPlayerTuple<PlayerId>
  readonly bank: BankState
  readonly turn: TurnState
  readonly awards: AwardState
  readonly pendingDecision: PendingDecision | null
  readonly random: RandomState
  readonly winnerId: PlayerId | null
}

