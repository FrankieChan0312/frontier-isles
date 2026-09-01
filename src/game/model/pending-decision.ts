import type { DevelopmentCardId, PlayerId, TileId } from './ids.ts'
import type { TradeOffer } from './trade.ts'

export type RobberCause =
  | { readonly type: 'DICE_SEVEN' }
  | { readonly type: 'KNIGHT'; readonly cardId: DevelopmentCardId }

export type PendingDecision =
  | {
      readonly type: 'DISCARD_RESOURCES'
      readonly triggeringPlayerId: PlayerId
      readonly requiredCountByPlayer: Readonly<Record<PlayerId, number>>
      readonly completedPlayerIds: readonly PlayerId[]
    }
  | {
      readonly type: 'MOVE_ROBBER'
      readonly actingPlayerId: PlayerId
      readonly cause: RobberCause
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
    }
  | {
      readonly type: 'CHOOSE_INVENTION_RESOURCES'
      readonly actingPlayerId: PlayerId
      readonly cardId: DevelopmentCardId
    }
  | {
      readonly type: 'CHOOSE_MONOPOLY_RESOURCE'
      readonly actingPlayerId: PlayerId
      readonly cardId: DevelopmentCardId
    }
  | {
      readonly type: 'RESPOND_TO_TRADE'
      readonly responderId: PlayerId
      readonly offer: TradeOffer
      readonly counterDepth: 0 | 1
    }

