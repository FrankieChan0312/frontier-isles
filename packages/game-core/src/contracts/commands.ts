import type {
  CommandId,
  DevelopmentCardId,
  EdgeId,
  PlayerId,
  TileId,
  TradeId,
  VertexId,
} from '../model/ids.ts'
import type { ResourceBag, ResourceType } from '../model/resource.ts'
import type { TradeOffer } from '../model/trade.ts'

export type GameCommand =
  | { readonly type: 'PLACE_INITIAL_SETTLEMENT'; readonly vertexId: VertexId }
  | { readonly type: 'PLACE_INITIAL_ROAD'; readonly edgeId: EdgeId }
  | { readonly type: 'ROLL_DICE' }
  | { readonly type: 'DISCARD_RESOURCES'; readonly resources: ResourceBag }
  | { readonly type: 'MOVE_ROBBER'; readonly tileId: TileId }
  | { readonly type: 'STEAL_FROM_PLAYER'; readonly targetPlayerId: PlayerId }
  | { readonly type: 'BUILD_ROAD'; readonly edgeId: EdgeId }
  | { readonly type: 'BUILD_SETTLEMENT'; readonly vertexId: VertexId }
  | { readonly type: 'UPGRADE_CITY'; readonly vertexId: VertexId }
  | { readonly type: 'BUY_DEVELOPMENT_CARD' }
  | { readonly type: 'PLAY_DEVELOPMENT_CARD'; readonly cardId: DevelopmentCardId }
  | { readonly type: 'CHOOSE_INVENTION_RESOURCES'; readonly resources: ResourceBag }
  | { readonly type: 'CHOOSE_MONOPOLY_RESOURCE'; readonly resource: ResourceType }
  | { readonly type: 'FINISH_FREE_ROAD_PLACEMENT' }
  | { readonly type: 'PROPOSE_TRADE'; readonly offer: TradeOffer }
  | { readonly type: 'ACCEPT_TRADE'; readonly tradeId: TradeId }
  | { readonly type: 'REJECT_TRADE'; readonly tradeId: TradeId }
  | {
      readonly type: 'COUNTER_TRADE'
      readonly previousTradeId: TradeId
      readonly offer: TradeOffer
    }
  | {
      readonly type: 'MARITIME_TRADE'
      readonly giveResource: ResourceType
      readonly receiveResource: ResourceType
    }
  | { readonly type: 'END_TURN' }

export interface CommandEnvelope {
  readonly commandId: CommandId
  readonly actorId: PlayerId
  readonly expectedStateVersion: number
  readonly command: GameCommand
}

