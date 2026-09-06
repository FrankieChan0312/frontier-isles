import type { PlayerId, TradeId } from './ids.ts'
import type { ResourceBag } from './resource.ts'

export interface TradeOffer {
  readonly tradeId: TradeId
  readonly initiatorId: PlayerId
  readonly counterpartyId: PlayerId
  readonly proposedById: PlayerId
  readonly initiatorGives: ResourceBag
  readonly counterpartyGives: ResourceBag
  readonly parentTradeId: TradeId | null
}

export type MaritimeTradeRatio = 2 | 3 | 4

