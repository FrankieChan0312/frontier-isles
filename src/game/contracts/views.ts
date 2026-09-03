import type { AwardState } from '../model/awards.ts'
import type { BoardState } from '../model/board-state.ts'
import type { GameCommand } from './commands.ts'
import type { OwnedDevelopmentCard } from '../model/development-card.ts'
import type {
  DevelopmentCardId,
  EdgeId,
  GameId,
  PlayerId,
  TileId,
  VertexId,
} from '../model/ids.ts'
import type { RobberCause } from '../model/pending-decision.ts'
import type { PlayerColor, PlayerController } from '../model/player.ts'
import type { ResourceBag, ResourceType } from '../model/resource.ts'
import { RULESET_ID } from '../model/ruleset.ts'
import type { MaritimeTradeRatio, TradeOffer } from '../model/trade.ts'
import type { TurnState } from '../model/turn.ts'

export interface PublicPlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly color: PlayerColor
  readonly controller: PlayerController
  readonly resourceCardCount: number
  readonly developmentCardCount: number
  readonly playedKnights: number
  readonly publicVictoryPoints: number
}

export interface PrivatePlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly color: PlayerColor
  readonly controller: PlayerController
  readonly resources: ResourceBag
  readonly developmentCards: readonly OwnedDevelopmentCard[]
  readonly playedKnights: number
  readonly publicVictoryPoints: number
  readonly actualVictoryPoints: number
}

export interface PublicBankState {
  readonly resources: ResourceBag
  readonly developmentDeckCount: number
}

export interface LegalMaritimeTradeOption {
  readonly giveResource: ResourceType
  readonly receiveResource: ResourceType
  readonly ratio: MaritimeTradeRatio
}

export type LegalInventionSelection = ResourceBag

export interface LegalTradeResponseView {
  readonly canAccept: boolean
  readonly canReject: boolean
  readonly canCounter: boolean
}

export type DevelopmentCardPlayabilityReason =
  | 'PLAYABLE'
  | 'BOUGHT_THIS_TURN'
  | 'ALREADY_PLAYED'
  | 'VICTORY_POINT'
  | 'NOT_YOUR_TURN'
  | 'PENDING_DECISION'
  | 'WRONG_PHASE'
  | 'CARD_LIMIT_REACHED'
  | 'EFFECT_UNAVAILABLE'
  | 'GAME_OVER'

export interface DevelopmentCardPlayabilityView {
  readonly cardId: DevelopmentCardId
  readonly canPlay: boolean
  readonly reason: DevelopmentCardPlayabilityReason
}

export interface LegalActionView {
  readonly permittedCommandTypes?: readonly GameCommand['type'][]
  readonly canRollDice: boolean
  readonly canEndTurn: boolean
  readonly canBuyDevelopmentCard: boolean
  readonly canProposeTrade: boolean
  readonly canFinishFreeRoadPlacement?: boolean
  readonly legalInitialSettlementVertexIds?: readonly VertexId[]
  readonly legalInitialRoadEdgeIds?: readonly EdgeId[]
  readonly legalRoadEdgeIds: readonly EdgeId[]
  readonly legalSettlementVertexIds: readonly VertexId[]
  readonly legalCityUpgradeVertexIds: readonly VertexId[]
  readonly legalRobberTileIds: readonly TileId[]
  readonly eligibleRobberTargetPlayerIds: readonly PlayerId[]
  readonly requiredDiscardCount: number | null
  readonly discardableResources?: ResourceBag | null
  readonly playableDevelopmentCardIds: readonly DevelopmentCardId[]
  readonly developmentCardPlayability?: readonly DevelopmentCardPlayabilityView[]
  readonly legalInventionSelections?: readonly ResourceBag[]
  readonly legalMonopolyResourceTypes?: readonly ResourceType[]
  readonly legalMaritimeTradeOptions: readonly LegalMaritimeTradeOption[]
  readonly legalDomesticTradeCounterpartyIds?: readonly PlayerId[]
  readonly tradeResponse?: LegalTradeResponseView | null
}

export type PendingDecisionView =
  | {
      readonly type: 'DISCARD_RESOURCES'
      readonly requiredCount: number
    }
  | {
      readonly type: 'AWAITING_DISCARDS'
      readonly remainingPlayerIds: readonly PlayerId[]
    }
  | {
      readonly type: 'MOVE_ROBBER'
      readonly actingPlayerId: PlayerId
      readonly cause: RobberCause
      readonly legalTileIds: readonly TileId[]
    }
  | {
      readonly type: 'CHOOSE_ROBBER_TARGET'
      readonly actingPlayerId: PlayerId
      readonly selectedTileId: TileId
      readonly eligibleTargetPlayerIds: readonly PlayerId[]
      readonly cause: RobberCause
    }
  | {
      readonly type: 'PLACE_FREE_ROADS'
      readonly actingPlayerId: PlayerId
      readonly cardId: DevelopmentCardId
      readonly remainingRoadCount: 1 | 2
      readonly legalEdgeIds: readonly EdgeId[]
    }
  | {
      readonly type: 'CHOOSE_INVENTION_RESOURCES'
      readonly actingPlayerId: PlayerId
      readonly cardId: DevelopmentCardId
      readonly availableResources: ResourceBag
    }
  | {
      readonly type: 'CHOOSE_MONOPOLY_RESOURCE'
      readonly actingPlayerId: PlayerId
      readonly cardId: DevelopmentCardId
      readonly legalResourceTypes: readonly ResourceType[]
    }
  | {
      readonly type: 'RESPOND_TO_TRADE'
      readonly responderId: PlayerId
      readonly offer: TradeOffer
      readonly counterDepth: 0 | 1
    }
  | {
      readonly type: 'TRADE_IN_PROGRESS'
      readonly initiatorId: PlayerId
      readonly counterpartyId: PlayerId
      readonly responderId: PlayerId
      readonly counterDepth: 0 | 1
    }

export interface PublicGameState {
  readonly gameId: GameId
  readonly stateVersion: number
  readonly rulesetId: typeof RULESET_ID
  readonly board: BoardState
  readonly bank: PublicBankState
  readonly turn: TurnState
  readonly awards: AwardState
  readonly winnerId: PlayerId | null
}

export interface PlayerView {
  readonly stateVersion: number
  readonly publicGame: PublicGameState
  readonly self: PrivatePlayerState
  readonly opponents: readonly PublicPlayerState[]
  readonly pendingDecision: PendingDecisionView | null
  readonly legalActions: LegalActionView
}
