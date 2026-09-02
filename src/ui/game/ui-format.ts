import type { PlayerEventView } from '../../game/contracts/player-events.ts'
import type { PlayerView } from '../../game/contracts/views.ts'
import type { PlayerId } from '../../game/model/ids.ts'
import { RESOURCE_TYPES, type ResourceBag, type ResourceType } from '../../game/model/resource.ts'

export const RESOURCE_LABELS: Readonly<Record<ResourceType, string>> = {
  LUMBER: 'Lumber',
  BRICK: 'Brick',
  WOOL: 'Wool',
  GRAIN: 'Grain',
  ORE: 'Ore',
}

export const RESOURCE_SYMBOLS: Readonly<Record<ResourceType, string>> = {
  LUMBER: '🌲',
  BRICK: '🧱',
  WOOL: '🐑',
  GRAIN: '🌾',
  ORE: '⛰',
}

export function emptyResourceBag(): ResourceBag {
  return { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 }
}

export function resourceBagTotal(resources: ResourceBag): number {
  return RESOURCE_TYPES.reduce((total, resource) => total + resources[resource], 0)
}

export function formatResourceBag(resources: ResourceBag): string {
  const entries = RESOURCE_TYPES
    .filter((resource) => resources[resource] > 0)
    .map((resource) => `${resources[resource]} ${RESOURCE_LABELS[resource]}`)
  return entries.length === 0 ? 'nothing' : entries.join(', ')
}

function playerName(view: PlayerView, playerId: PlayerId | null): string {
  if (playerId === null) return 'nobody'
  if (playerId === view.self.id) return view.self.name
  return view.opponents.find((player) => player.id === playerId)?.name ?? 'Unknown player'
}

export function formatEvent(event: PlayerEventView, view: PlayerView): string {
  switch (event.type) {
    case 'DICE_ROLLED':
      return `${playerName(view, event.playerId)} rolled ${event.roll.total}.`
    case 'RESOURCE_PRODUCED':
      return `${playerName(view, event.playerId)} received ${event.quantity} ${RESOURCE_LABELS[event.resource]}.`
    case 'RESOURCE_PRODUCTION_BLOCKED':
      return `${RESOURCE_LABELS[event.resource]} production was blocked by a bank shortage.`
    case 'RESOURCES_DISCARDED':
      return `${playerName(view, event.playerId)} discarded ${event.quantity} resource card${event.quantity === 1 ? '' : 's'}.`
    case 'ROBBER_MOVED':
      return `${playerName(view, event.playerId)} moved the robber.`
    case 'RESOURCE_STOLEN':
      return `${playerName(view, event.toPlayerId)} stole a resource from ${playerName(view, event.fromPlayerId)}.`
    case 'ROAD_BUILT':
      return `${playerName(view, event.ownerId)} built a road.`
    case 'SETTLEMENT_BUILT':
      return `${playerName(view, event.ownerId)} built a settlement.`
    case 'CITY_BUILT':
      return `${playerName(view, event.ownerId)} upgraded a city.`
    case 'DEVELOPMENT_CARD_BOUGHT':
      return `${playerName(view, event.ownerId)} bought a development card.`
    case 'DEVELOPMENT_CARD_PLAYED':
      return `${playerName(view, event.ownerId)} played ${event.cardType.replaceAll('_', ' ').toLowerCase()}.`
    case 'TRADE_PROPOSED':
      return `${playerName(view, event.initiatorId)} proposed a domestic trade.`
    case 'TRADE_REJECTED':
      return `${playerName(view, event.rejectedById)} rejected a trade.`
    case 'TRADE_COUNTERED':
      return `${playerName(view, event.offer?.proposedById ?? null)} countered a trade.`
    case 'TRADE_COMPLETED':
      return `${playerName(view, event.offer.initiatorId)} and ${playerName(view, event.offer.counterpartyId)} completed a trade.`
    case 'MARITIME_TRADE_COMPLETED':
      return `${playerName(view, event.playerId)} traded ${event.ratio} ${RESOURCE_LABELS[event.giveResource]} for 1 ${RESOURCE_LABELS[event.receiveResource]}.`
    case 'LONGEST_ROAD_CHANGED':
      return `Longest route now belongs to ${playerName(view, event.newHolderId)}.`
    case 'LARGEST_ARMY_CHANGED':
      return `Largest guard now belongs to ${playerName(view, event.newHolderId)}.`
    case 'TURN_STARTED':
      return `Turn ${event.turnNumber}: ${playerName(view, event.playerId)} begins.`
    case 'TURN_ENDED':
      return `${playerName(view, event.playerId)} ended turn ${event.turnNumber}.`
    case 'GAME_WON':
      return `${playerName(view, event.winnerId)} won with ${event.actualVictoryPoints} points!`
  }
}

export function formatPhase(phase: PlayerView['publicGame']['turn']['phase']): string {
  return phase.replaceAll('_', ' ').toLowerCase().replace(/^./, (letter) => letter.toUpperCase())
}
