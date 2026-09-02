import type { GameEvent } from '../contracts/events.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerId } from '../model/ids.ts'
import {
  LARGEST_ARMY_MINIMUM_KNIGHTS,
  LONGEST_ROAD_MINIMUM_LENGTH,
  STANDARD_VICTORY_POINT_TARGET,
} from '../model/standard-scoring.ts'
import { deriveLongestRoadLength } from '../rules/longest-road.ts'
import { deriveActualVictoryPoints } from '../rules/scoring.ts'
import {
  assertScoringReconciliationInputState,
  assertScoringState,
} from './scoring-invariants.ts'

export interface ScoringReconciliationResult {
  readonly state: GameState
  readonly events: readonly GameEvent[]
}

function deriveHolder(
  playerOrder: readonly PlayerId[],
  values: ReadonlyMap<PlayerId, number>,
  currentHolderId: PlayerId | null,
  minimum: number,
): PlayerId | null {
  const maximum = Math.max(...playerOrder.map((playerId) => values.get(playerId) ?? 0))
  if (
    currentHolderId !== null
    && (values.get(currentHolderId) ?? 0) >= minimum
    && (values.get(currentHolderId) ?? 0) === maximum
  ) return currentHolderId
  const leaders = playerOrder.filter(
    (playerId) => (values.get(playerId) ?? 0) >= minimum && values.get(playerId) === maximum,
  )
  return leaders.length === 1 ? leaders[0] ?? null : null
}

export function reconcileAwards(state: GameState): ScoringReconciliationResult {
  assertScoringReconciliationInputState(state)
  const roadLengths = new Map(
    state.playerOrder.map((playerId) => [playerId, deriveLongestRoadLength(state.board, playerId)]),
  )
  const knightCounts = new Map(
    state.playerOrder.map((playerId) => [playerId, state.players[playerId]?.playedKnights ?? 0]),
  )
  const longestRoadHolderId = deriveHolder(
    state.playerOrder,
    roadLengths,
    state.awards.longestRoadHolderId,
    LONGEST_ROAD_MINIMUM_LENGTH,
  )
  const largestArmyHolderId = deriveHolder(
    state.playerOrder,
    knightCounts,
    state.awards.largestArmyHolderId,
    LARGEST_ARMY_MINIMUM_KNIGHTS,
  )
  const events: GameEvent[] = []
  if (longestRoadHolderId !== state.awards.longestRoadHolderId) {
    events.push({
      type: 'LONGEST_ROAD_CHANGED',
      previousHolderId: state.awards.longestRoadHolderId,
      newHolderId: longestRoadHolderId,
    })
  }
  if (largestArmyHolderId !== state.awards.largestArmyHolderId) {
    events.push({
      type: 'LARGEST_ARMY_CHANGED',
      previousHolderId: state.awards.largestArmyHolderId,
      newHolderId: largestArmyHolderId,
    })
  }
  const nextState = events.length === 0
    ? state
    : { ...state, awards: { longestRoadHolderId, largestArmyHolderId } }
  assertScoringState(nextState)
  return { state: nextState, events }
}

export function resolveCurrentPlayerVictory(state: GameState): ScoringReconciliationResult {
  assertScoringState(state)
  if (state.winnerId !== null || state.turn.phase === 'GAME_OVER' || state.pendingDecision !== null) {
    return { state, events: [] }
  }
  const winnerId = state.turn.currentPlayerId
  const actualVictoryPoints = deriveActualVictoryPoints(state, winnerId)
  if (actualVictoryPoints < STANDARD_VICTORY_POINT_TARGET) return { state, events: [] }
  const winner = state.players[winnerId]
  if (winner === undefined) throw new Error(`Cannot resolve victory for unknown current player ${winnerId}.`)
  const nextState: GameState = {
    ...state,
    players: {
      ...state.players,
      [winnerId]: {
        ...winner,
        developmentCards: winner.developmentCards.map((card) =>
          card.type === 'VICTORY_POINT' && card.status === 'IN_HAND'
            ? { ...card, status: 'REVEALED' as const }
            : card,
        ),
      },
    },
    turn: { ...state.turn, phase: 'GAME_OVER' },
    pendingDecision: null,
    winnerId,
  }
  assertScoringState(nextState)
  return {
    state: nextState,
    events: [{ type: 'GAME_WON', winnerId, actualVictoryPoints }],
  }
}

export function reconcileAwardsAndCurrentPlayerVictory(
  state: GameState,
): ScoringReconciliationResult {
  const awards = reconcileAwards(state)
  const victory = resolveCurrentPlayerVictory(awards.state)
  return { state: victory.state, events: [...awards.events, ...victory.events] }
}
