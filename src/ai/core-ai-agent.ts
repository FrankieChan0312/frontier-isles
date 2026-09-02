import type { GameCommand } from '../game/contracts/commands.ts'
import type { PlayerView } from '../game/contracts/views.ts'
import type { DevelopmentCardId, PlayerId, TileId } from '../game/model/ids.ts'
import { createEmptyResourceBag, RESOURCE_TYPES } from '../game/model/resource.ts'
import type { ResourceBag, ResourceType } from '../game/model/resource.ts'
import type { TradeOffer } from '../game/model/trade.ts'
import type { AiAgent, AiDecisionContext } from './ai-agent.ts'
import {
  deriveVisibleIncome,
  evaluateStrategicPosition,
  numberTokenWeight,
  scoreRoadForExpansion,
  scoreVertexForProduction,
} from './evaluation/core-evaluation.ts'

const ROAD_COST: ResourceBag = Object.freeze({
  LUMBER: 1, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0,
})
const SETTLEMENT_COST: ResourceBag = Object.freeze({
  LUMBER: 1, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 0,
})
const CITY_COST: ResourceBag = Object.freeze({
  LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 2, ORE: 3,
})
const DEVELOPMENT_COST: ResourceBag = Object.freeze({
  LUMBER: 0, BRICK: 0, WOOL: 1, GRAIN: 1, ORE: 1,
})

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function chooseHighestScored<Id extends string>(
  ids: readonly Id[],
  score: (id: Id) => number,
): Id {
  const ordered = [...ids].sort((left, right) => {
    const scoreDifference = score(right) - score(left)
    return scoreDifference !== 0 ? scoreDifference : compareCodeUnits(left, right)
  })
  const selected = ordered[0]
  if (selected === undefined) throw new Error('AI cannot choose from an empty candidate list.')
  return selected
}

function countSelfPieces(view: PlayerView): {
  readonly roads: number
  readonly settlements: number
  readonly cities: number
} {
  let roads = 0
  let settlements = 0
  let cities = 0
  for (const road of Object.values(view.publicGame.board.edgeOccupancy)) {
    if (road?.ownerId === view.self.id) roads += 1
  }
  for (const building of Object.values(view.publicGame.board.vertexOccupancy)) {
    if (building?.ownerId !== view.self.id) continue
    if (building.type === 'CITY') cities += 1
    else settlements += 1
  }
  return { roads, settlements, cities }
}

function chooseBuildGoal(view: PlayerView): ResourceBag {
  const pieces = countSelfPieces(view)
  if (pieces.settlements < 3) return SETTLEMENT_COST
  if (pieces.cities < Math.min(pieces.settlements, 3)) return CITY_COST
  if (pieces.settlements < 5) return SETTLEMENT_COST
  if (pieces.cities < 4) return CITY_COST
  if (pieces.roads < 15) return ROAD_COST
  return DEVELOPMENT_COST
}

function resourceMarginalValues(view: PlayerView): Readonly<Record<ResourceType, number>> {
  const goal = chooseBuildGoal(view)
  const income = deriveVisibleIncome(view.publicGame.board, view.self.id)
  const strategic = evaluateStrategicPosition(view)
  const values = {} as Record<ResourceType, number>
  for (const resource of RESOURCE_TYPES) {
    const deficit = Math.max(0, goal[resource] - view.self.resources[resource])
    const surplus = Math.max(0, view.self.resources[resource] - goal[resource] - 1)
    values[resource] = 10
      + deficit * 24
      - surplus * 4
      + Math.max(0, 12 - income[resource])
      + strategic.resourceScarcity / 20
  }
  return values
}

function chooseDiscard(view: PlayerView, requiredCount: number): ResourceBag {
  const values = resourceMarginalValues(view)
  const resources = [...RESOURCE_TYPES].sort((left, right) => {
    const difference = values[left] - values[right]
    return difference !== 0 ? difference : compareCodeUnits(left, right)
  })
  const discard = { ...createEmptyResourceBag() } as Record<ResourceType, number>
  let remaining = requiredCount
  for (const resource of resources) {
    const quantity = Math.min(remaining, view.self.resources[resource])
    discard[resource] = quantity
    remaining -= quantity
    if (remaining === 0) break
  }
  if (remaining !== 0) throw new Error(`AI cannot satisfy required discard count ${requiredCount}.`)
  return discard
}

function scoreRobberTile(view: PlayerView, tileId: TileId): number {
  const board = view.publicGame.board
  const tile = board.topology.tiles[tileId]
  const content = board.tileContents[tileId]
  if (tile === undefined || content === undefined) return Number.NEGATIVE_INFINITY
  const weight = numberTokenWeight(content.numberToken)
  let score = 0
  for (const vertexId of tile.vertexIds) {
    const building = board.vertexOccupancy[vertexId]
    if (building === null || building === undefined) continue
    const multiplier = building.type === 'CITY' ? 2 : 1
    if (building.ownerId === view.self.id) {
      score -= weight * multiplier * 20
      continue
    }
    const opponent = view.opponents.find((candidate) => candidate.id === building.ownerId)
    const threat = opponent?.publicVictoryPoints ?? 0
    score += weight * multiplier * (10 + threat * 2)
  }
  return score
}

function scoreRobberTarget(view: PlayerView, playerId: PlayerId): number {
  const opponent = view.opponents.find((candidate) => candidate.id === playerId)
  return opponent === undefined
    ? 0
    : opponent.publicVictoryPoints * 20 + opponent.resourceCardCount * 2 + opponent.playedKnights
}

function choosePlayableCard(view: PlayerView): DevelopmentCardId | null {
  const legalIds = view.legalActions.playableDevelopmentCardIds
  if (legalIds.length === 0) return null
  const priority: Readonly<Record<string, number>> = {
    KNIGHT: 5,
    ROAD_BUILDING: 4,
    INVENTION: 3,
    MONOPOLY: 2,
    VICTORY_POINT: 0,
  }
  return chooseHighestScored(legalIds, (cardId) => {
    const card = view.self.developmentCards.find((candidate) => candidate.id === cardId)
    return card === undefined ? 0 : priority[card.type] ?? 0
  })
}

function chooseInvention(view: PlayerView): ResourceBag {
  const candidates = view.legalActions.legalInventionSelections ?? []
  const values = resourceMarginalValues(view)
  const selected = [...candidates].sort((left, right) => {
    const score = (bag: ResourceBag): number => RESOURCE_TYPES.reduce(
      (total, resource) => total + bag[resource] * values[resource],
      0,
    )
    const difference = score(right) - score(left)
    if (difference !== 0) return difference
    return compareCodeUnits(JSON.stringify(left), JSON.stringify(right))
  })[0]
  if (selected === undefined) throw new Error('AI has no legal Invention selection.')
  return selected
}

function chooseMonopoly(view: PlayerView): ResourceType {
  const candidates = view.legalActions.legalMonopolyResourceTypes ?? []
  return chooseHighestScored(candidates, (resource) => view.opponents.reduce((total, opponent) => {
    const income = deriveVisibleIncome(view.publicGame.board, opponent.id)
    return total + income[resource] + opponent.resourceCardCount
  }, 0))
}

function deficit(resources: ResourceBag, cost: ResourceBag): number {
  return RESOURCE_TYPES.reduce(
    (total, resource) => total + Math.max(0, cost[resource] - resources[resource]),
    0,
  )
}

function chooseUsefulMaritimeTrade(view: PlayerView): GameCommand | null {
  const options = view.legalActions.legalMaritimeTradeOptions
  if (options.length === 0) return null
  const goal = chooseBuildGoal(view)
  const beforeDeficit = deficit(view.self.resources, goal)
  const values = resourceMarginalValues(view)
  const scored = options.map((option) => {
    const after = {
      ...view.self.resources,
      [option.giveResource]: view.self.resources[option.giveResource] - option.ratio,
      [option.receiveResource]: view.self.resources[option.receiveResource] + 1,
    }
    const deficitImprovement = beforeDeficit - deficit(after, goal)
    const utility = deficitImprovement * 100
      + values[option.receiveResource]
      - values[option.giveResource] * option.ratio / 4
    return { option, utility }
  }).sort((left, right) => {
    const difference = right.utility - left.utility
    if (difference !== 0) return difference
    const leftKey = `${left.option.giveResource}:${left.option.receiveResource}`
    const rightKey = `${right.option.giveResource}:${right.option.receiveResource}`
    return compareCodeUnits(leftKey, rightKey)
  })
  const selected = scored[0]
  if (selected === undefined || selected.utility <= 0) return null
  return {
    type: 'MARITIME_TRADE',
    giveResource: selected.option.giveResource,
    receiveResource: selected.option.receiveResource,
  }
}

function chooseActionCommand(view: PlayerView): GameCommand {
  const playableCardId = choosePlayableCard(view)
  if (playableCardId !== null) return { type: 'PLAY_DEVELOPMENT_CARD', cardId: playableCardId }

  const cityIds = view.legalActions.legalCityUpgradeVertexIds
  const settlementIds = view.legalActions.legalSettlementVertexIds
  const roadIds = view.legalActions.legalRoadEdgeIds
  const pieces = countSelfPieces(view)
  if (cityIds.length > 0 && (pieces.settlements >= 3 || settlementIds.length === 0)) {
    return {
      type: 'UPGRADE_CITY',
      vertexId: chooseHighestScored(cityIds, (vertexId) => scoreVertexForProduction(view, vertexId)),
    }
  }
  if (settlementIds.length > 0) {
    return {
      type: 'BUILD_SETTLEMENT',
      vertexId: chooseHighestScored(
        settlementIds,
        (vertexId) => scoreVertexForProduction(view, vertexId),
      ),
    }
  }
  if (cityIds.length > 0) {
    return {
      type: 'UPGRADE_CITY',
      vertexId: chooseHighestScored(cityIds, (vertexId) => scoreVertexForProduction(view, vertexId)),
    }
  }
  if (roadIds.length > 0) {
    return {
      type: 'BUILD_ROAD',
      edgeId: chooseHighestScored(roadIds, (edgeId) => scoreRoadForExpansion(view, edgeId)),
    }
  }
  if (view.legalActions.canBuyDevelopmentCard) return { type: 'BUY_DEVELOPMENT_CARD' }
  const maritime = chooseUsefulMaritimeTrade(view)
  if (maritime !== null) return maritime
  if (view.legalActions.canEndTurn) return { type: 'END_TURN' }
  throw new Error(
    `AI has no legal Action command at state ${view.stateVersion} for ${view.self.id}.`,
  )
}

function chooseMandatoryOrStrategicCommand(view: PlayerView): GameCommand {
  const pending = view.pendingDecision
  if (pending?.type === 'DISCARD_RESOURCES') {
    return { type: 'DISCARD_RESOURCES', resources: chooseDiscard(view, pending.requiredCount) }
  }
  if (pending?.type === 'MOVE_ROBBER' && pending.actingPlayerId === view.self.id) {
    return {
      type: 'MOVE_ROBBER',
      tileId: chooseHighestScored(
        pending.legalTileIds,
        (tileId) => scoreRobberTile(view, tileId),
      ),
    }
  }
  if (pending?.type === 'CHOOSE_ROBBER_TARGET' && pending.actingPlayerId === view.self.id) {
    return {
      type: 'STEAL_FROM_PLAYER',
      targetPlayerId: chooseHighestScored(
        pending.eligibleTargetPlayerIds,
        (playerId) => scoreRobberTarget(view, playerId),
      ),
    }
  }
  if (pending?.type === 'PLACE_FREE_ROADS' && pending.actingPlayerId === view.self.id) {
    if (pending.legalEdgeIds.length === 0 && view.legalActions.canFinishFreeRoadPlacement === true) {
      return { type: 'FINISH_FREE_ROAD_PLACEMENT' }
    }
    return {
      type: 'BUILD_ROAD',
      edgeId: chooseHighestScored(
        pending.legalEdgeIds,
        (edgeId) => scoreRoadForExpansion(view, edgeId),
      ),
    }
  }
  if (pending?.type === 'CHOOSE_INVENTION_RESOURCES' && pending.actingPlayerId === view.self.id) {
    return { type: 'CHOOSE_INVENTION_RESOURCES', resources: chooseInvention(view) }
  }
  if (pending?.type === 'CHOOSE_MONOPOLY_RESOURCE' && pending.actingPlayerId === view.self.id) {
    return { type: 'CHOOSE_MONOPOLY_RESOURCE', resource: chooseMonopoly(view) }
  }
  if (pending?.type === 'RESPOND_TO_TRADE' && pending.responderId === view.self.id) {
    return { type: 'REJECT_TRADE', tradeId: pending.offer.tradeId }
  }

  const phase = view.publicGame.turn.phase
  if (phase === 'SETUP_SETTLEMENT') {
    const vertexIds = view.legalActions.legalInitialSettlementVertexIds ?? []
    return {
      type: 'PLACE_INITIAL_SETTLEMENT',
      vertexId: chooseHighestScored(
        vertexIds,
        (vertexId) => scoreVertexForProduction(view, vertexId),
      ),
    }
  }
  if (phase === 'SETUP_ROAD') {
    const edgeIds = view.legalActions.legalInitialRoadEdgeIds ?? []
    return {
      type: 'PLACE_INITIAL_ROAD',
      edgeId: chooseHighestScored(edgeIds, (edgeId) => scoreRoadForExpansion(view, edgeId)),
    }
  }
  if (phase === 'ROLL_REQUIRED') {
    const playableCardId = choosePlayableCard(view)
    return playableCardId === null
      ? { type: 'ROLL_DICE' }
      : { type: 'PLAY_DEVELOPMENT_CARD', cardId: playableCardId }
  }
  if (phase === 'ACTION') return chooseActionCommand(view)
  throw new Error(
    `AI cannot act in phase ${phase} at state ${view.stateVersion} for ${view.self.id}.`,
  )
}

function resourceBagKey(resources: ResourceBag): string {
  return RESOURCE_TYPES.map((resource) => `${resource}:${resources[resource]}`).join(',')
}

export function createAiCommandKey(command: GameCommand): string {
  switch (command.type) {
    case 'PLACE_INITIAL_SETTLEMENT':
    case 'BUILD_SETTLEMENT':
    case 'UPGRADE_CITY':
      return `${command.type}:${command.vertexId}`
    case 'PLACE_INITIAL_ROAD':
    case 'BUILD_ROAD':
      return `${command.type}:${command.edgeId}`
    case 'DISCARD_RESOURCES':
    case 'CHOOSE_INVENTION_RESOURCES':
      return `${command.type}:${resourceBagKey(command.resources)}`
    case 'MOVE_ROBBER':
      return `${command.type}:${command.tileId}`
    case 'STEAL_FROM_PLAYER':
      return `${command.type}:${command.targetPlayerId}`
    case 'PLAY_DEVELOPMENT_CARD':
      return `${command.type}:${command.cardId}`
    case 'CHOOSE_MONOPOLY_RESOURCE':
      return `${command.type}:${command.resource}`
    case 'PROPOSE_TRADE':
      return `${command.type}:${tradeOfferTermsKey(command.offer)}`
    case 'ACCEPT_TRADE':
    case 'REJECT_TRADE':
      return `${command.type}:${command.tradeId}`
    case 'COUNTER_TRADE':
      return `${command.type}:${command.previousTradeId}:${tradeOfferKey(command.offer)}`
    case 'MARITIME_TRADE':
      return `${command.type}:${command.giveResource}:${command.receiveResource}`
    case 'ROLL_DICE':
    case 'BUY_DEVELOPMENT_CARD':
    case 'FINISH_FREE_ROAD_PLACEMENT':
    case 'END_TURN':
      return command.type
  }
}

function tradeOfferKey(offer: TradeOffer): string {
  return [
    offer.tradeId,
    offer.initiatorId,
    offer.counterpartyId,
    offer.proposedById,
    resourceBagKey(offer.initiatorGives),
    resourceBagKey(offer.counterpartyGives),
    offer.parentTradeId ?? '',
  ].join(':')
}

function tradeOfferTermsKey(offer: TradeOffer): string {
  return [
    offer.initiatorId,
    offer.counterpartyId,
    offer.proposedById,
    resourceBagKey(offer.initiatorGives),
    resourceBagKey(offer.counterpartyGives),
  ].join(':')
}

function assertSafetyBudget(view: PlayerView, context: AiDecisionContext): void {
  if (context.commandNumberThisTurn >= context.limits.maxCommandsPerTurn) {
    throw new Error(
      `AI turn command budget exhausted for ${view.self.id} at state ${view.stateVersion}.`,
    )
  }
  if (context.commandNumberThisGame >= context.limits.maxCommandsPerGame) {
    throw new Error(
      `AI game command budget exhausted for ${view.self.id} at state ${view.stateVersion}.`,
    )
  }
}

export class DeterministicCoreAiAgent implements AiAgent {
  chooseNextCommand(
    view: PlayerView,
    context: AiDecisionContext,
  ): Promise<GameCommand> {
    try {
      assertSafetyBudget(view, context)
      const command = chooseMandatoryOrStrategicCommand(view)
      const commandKey = createAiCommandKey(command)
      const repeated = context.previousCommandKeysThisTurn.filter((key) => key === commandKey).length
      if (repeated >= context.limits.maxRepeatedCommandPerTurn) {
        if (view.legalActions.canEndTurn) return Promise.resolve({ type: 'END_TURN' })
        return Promise.reject(new Error(
          `AI repeated-command safety limit reached for ${view.self.id} at state ${view.stateVersion}: ${commandKey}.`,
        ))
      }
      return Promise.resolve(command)
    } catch (error) {
      return Promise.reject(error)
    }
  }
}
