import type { DevelopmentCardType } from '../model/development-card.ts'
import type { DiceRoll } from '../model/dice.ts'
import type {
  DevelopmentCardId,
  EdgeId,
  PlayerId,
  TileId,
  TradeId,
  VertexId,
} from '../model/ids.ts'
import type { RobberCause } from '../model/pending-decision.ts'
import type { ResourceBag, ResourceType } from '../model/resource.ts'
import type { MaritimeTradeRatio, TradeOffer } from '../model/trade.ts'
import type { RoadBuildSource, SettlementBuildSource } from './events.ts'

export type PlayerEventView =
  | {
      readonly type: 'DICE_ROLLED'
      readonly playerId: PlayerId
      readonly roll: DiceRoll
    }
  | {
      readonly type: 'RESOURCE_PRODUCED'
      readonly playerId: PlayerId
      readonly tileId: TileId
      readonly resource: ResourceType
      readonly quantity: number
    }
  | {
      readonly type: 'RESOURCE_PRODUCTION_BLOCKED'
      readonly resource: ResourceType
      readonly affectedPlayerIds: readonly PlayerId[]
      readonly reason: 'BANK_SHORTAGE'
    }
  | {
      readonly type: 'RESOURCES_DISCARDED'
      readonly playerId: PlayerId
      readonly quantity: number
      readonly resources: ResourceBag | null
    }
  | {
      readonly type: 'ROBBER_MOVED'
      readonly playerId: PlayerId
      readonly fromTileId: TileId
      readonly toTileId: TileId
      readonly cause: RobberCause
    }
  | {
      readonly type: 'RESOURCE_STOLEN'
      readonly fromPlayerId: PlayerId
      readonly toPlayerId: PlayerId
      readonly resource: ResourceType | null
    }
  | {
      readonly type: 'ROAD_BUILT'
      readonly ownerId: PlayerId
      readonly edgeId: EdgeId
      readonly source: RoadBuildSource
    }
  | {
      readonly type: 'SETTLEMENT_BUILT'
      readonly ownerId: PlayerId
      readonly vertexId: VertexId
      readonly source: SettlementBuildSource
    }
  | {
      readonly type: 'CITY_BUILT'
      readonly ownerId: PlayerId
      readonly vertexId: VertexId
    }
  | {
      readonly type: 'DEVELOPMENT_CARD_BOUGHT'
      readonly ownerId: PlayerId
      readonly cardId: DevelopmentCardId | null
      readonly cardType: DevelopmentCardType | null
      readonly acquiredTurnNumber: number
    }
  | {
      readonly type: 'DEVELOPMENT_CARD_PLAYED'
      readonly ownerId: PlayerId
      readonly cardId: DevelopmentCardId
      readonly cardType: DevelopmentCardType
    }
  | {
      readonly type: 'TRADE_PROPOSED'
      readonly tradeId: TradeId
      readonly initiatorId: PlayerId
      readonly counterpartyId: PlayerId
      readonly offer: TradeOffer | null
    }
  | {
      readonly type: 'TRADE_REJECTED'
      readonly tradeId: TradeId
      readonly rejectedById: PlayerId
    }
  | {
      readonly type: 'TRADE_COUNTERED'
      readonly previousTradeId: TradeId
      readonly tradeId: TradeId
      readonly initiatorId: PlayerId
      readonly counterpartyId: PlayerId
      readonly offer: TradeOffer | null
    }
  | { readonly type: 'TRADE_COMPLETED'; readonly offer: TradeOffer }
  | {
      readonly type: 'MARITIME_TRADE_COMPLETED'
      readonly playerId: PlayerId
      readonly giveResource: ResourceType
      readonly receiveResource: ResourceType
      readonly ratio: MaritimeTradeRatio
    }
  | {
      readonly type: 'LONGEST_ROAD_CHANGED'
      readonly previousHolderId: PlayerId | null
      readonly newHolderId: PlayerId | null
    }
  | {
      readonly type: 'LARGEST_ARMY_CHANGED'
      readonly previousHolderId: PlayerId | null
      readonly newHolderId: PlayerId | null
    }
  | {
      readonly type: 'TURN_STARTED'
      readonly playerId: PlayerId
      readonly turnNumber: number
    }
  | {
      readonly type: 'TURN_ENDED'
      readonly playerId: PlayerId
      readonly turnNumber: number
    }
  | {
      readonly type: 'GAME_WON'
      readonly winnerId: PlayerId
      readonly actualVictoryPoints: number
    }
