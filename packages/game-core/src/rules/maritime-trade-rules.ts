import type { BoardState } from '../model/board-state.ts'
import type { PlayerId } from '../model/ids.ts'
import type { ResourceBag, ResourceType } from '../model/resource.ts'
import {
  DEFAULT_MARITIME_TRADE_RATIO,
  GENERIC_PORT_TRADE_RATIO,
  RESOURCE_PORT_TRADE_RATIO,
} from '../model/standard-maritime-trade.ts'
import type { MaritimeTradeRatio } from '../model/trade.ts'
import { isCompleteResourceBag } from './resource-bag-validation.ts'
import { deriveControlledPortIds } from './player-ports.ts'

export interface MaritimeTradeExchangeResult {
  readonly playerResources: ResourceBag
  readonly bankResources: ResourceBag
}

export function deriveBestMaritimeTradeRatio(
  board: BoardState,
  playerId: PlayerId,
  giveResource: ResourceType,
): MaritimeTradeRatio {
  const ports = deriveControlledPortIds(board, playerId).map(
    (portId) => board.topology.ports[portId],
  )
  if (ports.some(
    (port) => port?.kind.type === 'RESOURCE' && port.kind.resource === giveResource,
  )) return RESOURCE_PORT_TRADE_RATIO
  if (ports.some((port) => port?.kind.type === 'GENERIC')) return GENERIC_PORT_TRADE_RATIO
  return DEFAULT_MARITIME_TRADE_RATIO
}

export function exchangeMaritimeResources(
  playerResources: ResourceBag,
  bankResources: ResourceBag,
  giveResource: ResourceType,
  receiveResource: ResourceType,
  ratio: MaritimeTradeRatio,
): MaritimeTradeExchangeResult {
  if (!isCompleteResourceBag(playerResources) || !isCompleteResourceBag(bankResources)) {
    throw new Error('Cannot execute maritime trade with invalid resources.')
  }
  if (giveResource === receiveResource) throw new Error('Maritime trade resources must differ.')
  if (playerResources[giveResource] < ratio || bankResources[receiveResource] < 1) {
    throw new Error('Cannot execute an unavailable maritime trade.')
  }
  return {
    playerResources: {
      ...playerResources,
      [giveResource]: playerResources[giveResource] - ratio,
      [receiveResource]: playerResources[receiveResource] + 1,
    },
    bankResources: {
      ...bankResources,
      [giveResource]: bankResources[giveResource] + ratio,
      [receiveResource]: bankResources[receiveResource] - 1,
    },
  }
}
