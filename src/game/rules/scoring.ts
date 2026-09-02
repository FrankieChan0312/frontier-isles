import type { GameState } from '../model/game-state.ts'
import type { PlayerId } from '../model/ids.ts'
import {
  CITY_VICTORY_POINTS,
  LARGEST_ARMY_VICTORY_POINTS,
  LONGEST_ROAD_VICTORY_POINTS,
  SETTLEMENT_VICTORY_POINTS,
  VICTORY_POINT_CARD_POINTS,
} from '../model/standard-scoring.ts'
import { derivePlayerPieceCounts } from './player-piece-counts.ts'

export interface PlayerScoreBreakdown {
  readonly playerId: PlayerId
  readonly settlementVictoryPoints: number
  readonly cityVictoryPoints: number
  readonly longestRoadVictoryPoints: number
  readonly largestArmyVictoryPoints: number
  readonly revealedVictoryPointCardPoints: number
  readonly hiddenVictoryPointCardPoints: number
  readonly publicVictoryPoints: number
  readonly actualVictoryPoints: number
}

export function derivePlayerScore(state: GameState, playerId: PlayerId): PlayerScoreBreakdown {
  const player = state.players[playerId]
  if (player === undefined) throw new Error(`Cannot derive score for unknown player ${playerId}.`)
  const pieces = derivePlayerPieceCounts(state.board, playerId)
  const settlementVictoryPoints = pieces.settlements * SETTLEMENT_VICTORY_POINTS
  const cityVictoryPoints = pieces.cities * CITY_VICTORY_POINTS
  const longestRoadVictoryPoints = state.awards.longestRoadHolderId === playerId
    ? LONGEST_ROAD_VICTORY_POINTS
    : 0
  const largestArmyVictoryPoints = state.awards.largestArmyHolderId === playerId
    ? LARGEST_ARMY_VICTORY_POINTS
    : 0
  let revealedVictoryPointCardPoints = 0
  let hiddenVictoryPointCardPoints = 0
  for (const card of player.developmentCards) {
    if (card.type !== 'VICTORY_POINT') continue
    if (card.status === 'PLAYED') {
      throw new Error(`Victory Point card ${card.id} cannot have PLAYED status.`)
    }
    if (card.status === 'REVEALED') revealedVictoryPointCardPoints += VICTORY_POINT_CARD_POINTS
    if (card.status === 'IN_HAND') hiddenVictoryPointCardPoints += VICTORY_POINT_CARD_POINTS
  }
  const publicVictoryPoints = settlementVictoryPoints
    + cityVictoryPoints
    + longestRoadVictoryPoints
    + largestArmyVictoryPoints
    + revealedVictoryPointCardPoints
  return {
    playerId,
    settlementVictoryPoints,
    cityVictoryPoints,
    longestRoadVictoryPoints,
    largestArmyVictoryPoints,
    revealedVictoryPointCardPoints,
    hiddenVictoryPointCardPoints,
    publicVictoryPoints,
    actualVictoryPoints: publicVictoryPoints + hiddenVictoryPointCardPoints,
  }
}

export function derivePublicVictoryPoints(state: GameState, playerId: PlayerId): number {
  return derivePlayerScore(state, playerId).publicVictoryPoints
}

export function deriveActualVictoryPoints(state: GameState, playerId: PlayerId): number {
  return derivePlayerScore(state, playerId).actualVictoryPoints
}
