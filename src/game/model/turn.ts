import type { DiceRoll } from './dice.ts'
import type { PlayerId, VertexId } from './ids.ts'

export type GamePhase =
  | 'SETUP_SETTLEMENT'
  | 'SETUP_ROAD'
  | 'ROLL_REQUIRED'
  | 'DISCARD_REQUIRED'
  | 'ROBBER_MOVE_REQUIRED'
  | 'ROBBER_TARGET_REQUIRED'
  | 'ACTION'
  | 'FREE_ROAD_PLACEMENT'
  | 'GAME_OVER'

export interface SetupTurnState {
  readonly round: 1 | 2
  readonly placementIndex: number
  readonly pendingSettlementVertexId: VertexId | null
}

export interface TurnState {
  readonly turnNumber: number
  readonly currentPlayerId: PlayerId
  readonly phase: GamePhase
  readonly setup: SetupTurnState | null
  readonly lastRoll: DiceRoll | null
  readonly developmentCardPlayedThisTurn: boolean
}

