import type { RuleViolation } from '../contracts/errors.ts'
import type {
  DevelopmentCardDefinition,
  DevelopmentCardType,
  OwnedDevelopmentCard,
} from '../model/development-card.ts'
import type { GameState } from '../model/game-state.ts'
import type { DevelopmentCardId, EdgeId, PlayerId } from '../model/ids.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import type { ResourceBag, ResourceType } from '../model/resource.ts'
import { STANDARD_ROAD_PIECE_LIMIT } from '../model/standard-piece-limits.ts'
import type { GamePhase } from '../model/turn.ts'
import { validateFreeRoadPlacement } from './paid-road-rules.ts'
import { derivePlayerPieceCounts } from './player-piece-counts.ts'

export function findOwnedDevelopmentCard(
  state: GameState,
  playerId: PlayerId,
  cardId: DevelopmentCardId,
): OwnedDevelopmentCard | null {
  return state.players[playerId]?.developmentCards.find((card) => card.id === cardId) ?? null
}

export function createOwnedDevelopmentCard(
  definition: DevelopmentCardDefinition,
  acquiredTurnNumber: number,
): OwnedDevelopmentCard {
  return {
    id: definition.id,
    type: definition.type,
    acquiredTurnNumber,
    status: 'IN_HAND',
  }
}

export function replaceOwnedDevelopmentCardStatus(
  cards: readonly OwnedDevelopmentCard[],
  cardId: DevelopmentCardId,
  status: OwnedDevelopmentCard['status'],
): readonly OwnedDevelopmentCard[] {
  return cards.map((card) => card.id === cardId ? { ...card, status } : card)
}

export function resumePhaseAfterCardEffect(state: GameState): 'ROLL_REQUIRED' | 'ACTION' {
  return state.turn.lastRoll === null ? 'ROLL_REQUIRED' : 'ACTION'
}

export function validateActionCardPlayability(
  state: GameState,
  playerId: PlayerId,
  cardId: DevelopmentCardId,
): RuleViolation | null {
  const card = findOwnedDevelopmentCard(state, playerId, cardId)
  if (card === null) return { code: 'DEVELOPMENT_CARD_NOT_OWNED', details: { cardId } }
  if (card.status !== 'IN_HAND' || card.type === 'VICTORY_POINT') {
    return { code: 'DEVELOPMENT_CARD_NOT_PLAYABLE', details: { cardId } }
  }
  if (card.acquiredTurnNumber >= state.turn.turnNumber) {
    return { code: 'DEVELOPMENT_CARD_NOT_PLAYABLE', details: { cardId } }
  }
  if (state.turn.developmentCardPlayedThisTurn) {
    return { code: 'DEVELOPMENT_CARD_LIMIT_REACHED' }
  }
  return null
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function deriveLegalFreeRoadEdgeIds(
  state: GameState,
  playerId: PlayerId,
): readonly EdgeId[] {
  return (Object.keys(state.board.topology.edges) as EdgeId[])
    .sort(compareCodeUnits)
    .filter((edgeId) => validateFreeRoadPlacement(state, playerId, edgeId) === null)
}

export function remainingFreeRoadCount(state: GameState, playerId: PlayerId): 1 | 2 | null {
  const remainingPieces = STANDARD_ROAD_PIECE_LIMIT
    - derivePlayerPieceCounts(state.board, playerId).roads
  if (remainingPieces <= 0 || deriveLegalFreeRoadEdgeIds(state, playerId).length === 0) return null
  return remainingPieces >= 2 ? 2 : 1
}

export interface InventionTransferResult {
  readonly playerResources: ResourceBag
  readonly bankResources: ResourceBag
}

export function validateInventionSelection(
  selection: unknown,
  bankResources: ResourceBag,
): RuleViolation | null {
  if (typeof selection !== 'object' || selection === null || Array.isArray(selection)) {
    return { code: 'DEVELOPMENT_CARD_NOT_PLAYABLE' }
  }
  const record = selection as Readonly<Record<string, unknown>>
  const keys = Object.keys(record)
  if (
    keys.length !== RESOURCE_TYPES.length
    || !keys.every((key) => RESOURCE_TYPES.includes(key as ResourceType))
  ) return { code: 'DEVELOPMENT_CARD_NOT_PLAYABLE' }
  let total = 0
  for (const resource of RESOURCE_TYPES) {
    const count = record[resource]
    if (!Number.isSafeInteger(count) || Number(count) < 0) {
      return { code: 'DEVELOPMENT_CARD_NOT_PLAYABLE' }
    }
    total += Number(count)
  }
  if (total !== 2) return { code: 'DEVELOPMENT_CARD_NOT_PLAYABLE' }
  for (const resource of RESOURCE_TYPES) {
    if (Number(record[resource]) > bankResources[resource]) {
      return { code: 'BANK_RESOURCE_UNAVAILABLE', details: { resource } }
    }
  }
  return null
}

export function transferInventionResources(
  playerResources: ResourceBag,
  bankResources: ResourceBag,
  selection: ResourceBag,
): InventionTransferResult {
  const nextPlayer = { ...playerResources } as Record<ResourceType, number>
  const nextBank = { ...bankResources } as Record<ResourceType, number>
  for (const resource of RESOURCE_TYPES) {
    nextPlayer[resource] += selection[resource]
    nextBank[resource] -= selection[resource]
  }
  return { playerResources: nextPlayer, bankResources: nextBank }
}

export interface MonopolyTransferResult {
  readonly players: GameState['players']
  readonly transferredCount: number
}

export function transferMonopolyResource(
  state: GameState,
  actingPlayerId: PlayerId,
  resource: ResourceType,
): MonopolyTransferResult {
  const actor = state.players[actingPlayerId]
  if (actor === undefined) throw new Error(`Cannot resolve Monopoly for unknown player ${actingPlayerId}.`)
  let transferredCount = 0
  const players = { ...state.players }
  for (const playerId of state.playerOrder) {
    if (playerId === actingPlayerId) continue
    const player = state.players[playerId]
    if (player === undefined) throw new Error(`Cannot resolve Monopoly for missing player ${playerId}.`)
    const count = player.resources[resource]
    transferredCount += count
    players[playerId] = {
      ...player,
      resources: { ...player.resources, [resource]: 0 },
    }
  }
  players[actingPlayerId] = {
    ...actor,
    resources: {
      ...actor.resources,
      [resource]: actor.resources[resource] + transferredCount,
    },
  }
  return { players, transferredCount }
}

export function isDevelopmentCardEffectPhase(phase: GamePhase): boolean {
  return phase === 'ROLL_REQUIRED' || phase === 'ACTION'
}

export function isActionCardType(type: DevelopmentCardType): boolean {
  return type !== 'VICTORY_POINT'
}
