import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import type { PlayerId, TradeId } from '@frontier-isles/game-core/model/ids'
import { RESOURCE_TYPES } from '@frontier-isles/game-core/model/resource'
import type { ResourceBag, ResourceType } from '@frontier-isles/game-core/model/resource'
import type { TradeOffer } from '@frontier-isles/game-core/model/trade'
import { deriveControlledPortIds } from '@frontier-isles/game-core/rules/player-ports'
import { deriveVisibleIncome, evaluateStrategicPosition } from '../evaluation/core-evaluation.ts'
import type { AiPersonalityProfile } from '../personalities/ai-profiles.ts'

const BUILD_COSTS: readonly ResourceBag[] = Object.freeze([
  Object.freeze({ LUMBER: 1, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 }),
  Object.freeze({ LUMBER: 1, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 0 }),
  Object.freeze({ LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 2, ORE: 3 }),
  Object.freeze({ LUMBER: 0, BRICK: 0, WOOL: 1, GRAIN: 1, ORE: 1 }),
])

export type TradeReasonCode =
  | 'ACCEPTABLE_VALUE'
  | 'NOT_ENOUGH_VALUE'
  | 'NEED_OFFERED_RESOURCE'
  | 'HELPS_LEADER_TOO_MUCH'
  | 'PREFER_MARITIME_TRADE'
  | 'COUNTER_AVAILABLE'
  | 'CANNOT_AFFORD'

export type TradeEvaluation =
  | { readonly type: 'ACCEPT'; readonly score: number; readonly reasonCode: 'ACCEPTABLE_VALUE' }
  | { readonly type: 'REJECT'; readonly score: number; readonly reasonCode: TradeReasonCode }
  | { readonly type: 'COUNTER'; readonly score: number; readonly reasonCode: 'COUNTER_AVAILABLE' }

function countCards(resources: ResourceBag): number {
  return RESOURCE_TYPES.reduce((total, resource) => total + resources[resource], 0)
}

function addTrade(resources: ResourceBag, incoming: ResourceBag, outgoing: ResourceBag): ResourceBag {
  return {
    LUMBER: resources.LUMBER + incoming.LUMBER - outgoing.LUMBER,
    BRICK: resources.BRICK + incoming.BRICK - outgoing.BRICK,
    WOOL: resources.WOOL + incoming.WOOL - outgoing.WOOL,
    GRAIN: resources.GRAIN + incoming.GRAIN - outgoing.GRAIN,
    ORE: resources.ORE + incoming.ORE - outgoing.ORE,
  }
}

function canProvide(resources: ResourceBag, outgoing: ResourceBag): boolean {
  return RESOURCE_TYPES.every((resource) => resources[resource] >= outgoing[resource])
}

function countAffordableBuilds(resources: ResourceBag): number {
  return BUILD_COSTS.filter((cost) => RESOURCE_TYPES.every(
    (resource) => resources[resource] >= cost[resource],
  )).length
}

function controlledPortAdjustment(
  view: PlayerView,
  resource: ResourceType,
  profile: AiPersonalityProfile,
): number {
  const ports = deriveControlledPortIds(view.publicGame.board, view.self.id)
    .map((portId) => view.publicGame.board.topology.ports[portId])
  const hasMatching = ports.some(
    (port) => port?.kind.type === 'RESOURCE' && port.kind.resource === resource,
  )
  const hasGeneric = ports.some((port) => port?.kind.type === 'GENERIC')
  return (hasMatching ? 7 : hasGeneric ? 3 : 0) * profile.portWeight
}

export function deriveMarginalResourceValues(
  view: PlayerView,
  profile: AiPersonalityProfile,
): Readonly<Record<ResourceType, number>> {
  const income = deriveVisibleIncome(view.publicGame.board, view.self.id)
  const strategic = evaluateStrategicPosition(view)
  const values = {} as Record<ResourceType, number>
  for (const resource of RESOURCE_TYPES) {
    const scarcity = Math.max(0, 14 - income[resource]) * profile.productionWeight
    const goalNeed = BUILD_COSTS.reduce((total, cost) => {
      const missing = Math.max(0, cost[resource] - view.self.resources[resource])
      return total + missing * 5
    }, 0)
    const surplus = Math.max(0, view.self.resources[resource] - 3) * 3
    values[resource] = 12
      + scarcity
      + goalNeed * profile.expansionWeight
      + controlledPortAdjustment(view, resource, profile)
      + strategic.currentVictoryPoints * profile.cityWeight / 4
      - surplus
  }
  return values
}

function bundleValue(
  bundle: ResourceBag,
  values: Readonly<Record<ResourceType, number>>,
): number {
  return RESOURCE_TYPES.reduce(
    (total, resource) => total + bundle[resource] * values[resource],
    0,
  )
}

function offerForViewer(
  view: PlayerView,
  offer: TradeOffer,
): { readonly incoming: ResourceBag; readonly outgoing: ResourceBag; readonly opponentId: PlayerId } {
  if (view.self.id === offer.initiatorId) {
    return {
      incoming: offer.counterpartyGives,
      outgoing: offer.initiatorGives,
      opponentId: offer.counterpartyId,
    }
  }
  if (view.self.id === offer.counterpartyId) {
    return {
      incoming: offer.initiatorGives,
      outgoing: offer.counterpartyGives,
      opponentId: offer.initiatorId,
    }
  }
  throw new Error(`Trade evaluator ${view.self.id} is not a party to ${offer.tradeId}.`)
}

export interface TradeScoreBreakdown {
  readonly incomingValue: number
  readonly outgoingValue: number
  readonly buildUnlock: number
  readonly portAndScarcityAdjustment: number
  readonly sevenRiskAdjustment: number
  readonly estimatedOpponentGain: number
  readonly threatPenalty: number
  readonly personalityAdjustment: number
  readonly total: number
}

export function scoreTradeOffer(
  view: PlayerView,
  offer: TradeOffer,
  profile: AiPersonalityProfile,
): TradeScoreBreakdown {
  const { incoming, outgoing, opponentId } = offerForViewer(view, offer)
  const values = deriveMarginalResourceValues(view, profile)
  const after = addTrade(view.self.resources, incoming, outgoing)
  const incomingValue = bundleValue(incoming, values)
  const outgoingValue = bundleValue(outgoing, values)
  const buildUnlock = (
    countAffordableBuilds(after) - countAffordableBuilds(view.self.resources)
  ) * 50 * profile.expansionWeight
  const portAndScarcityAdjustment = RESOURCE_TYPES.reduce(
    (total, resource) => total
      + incoming[resource] * controlledPortAdjustment(view, resource, profile)
      - outgoing[resource] * controlledPortAdjustment(view, resource, profile) / 2,
    0,
  )
  const beforeCards = countCards(view.self.resources)
  const afterCards = countCards(after)
  const sevenRiskAdjustment = beforeCards > 7
    ? (beforeCards - afterCards) * 5 * profile.sevenRiskWeight
    : 0
  const opponent = view.opponents.find((candidate) => candidate.id === opponentId)
  const opponentIncome = deriveVisibleIncome(view.publicGame.board, opponentId)
  const estimatedOpponentGain = RESOURCE_TYPES.reduce(
    (total, resource) => total + outgoing[resource] * Math.max(8, 18 - opponentIncome[resource]),
    0,
  )
  const publicThreat = opponent === undefined
    ? 0
    : opponent.publicVictoryPoints * 2
      + Number(view.publicGame.awards.longestRoadHolderId === opponentId) * 3
      + Number(view.publicGame.awards.largestArmyHolderId === opponentId) * 3
  const threatPenalty = estimatedOpponentGain * profile.threatWeight * publicThreat / 18
  const personalityAdjustment = profile.tradeFrequencyWeight * 4
  return {
    incomingValue,
    outgoingValue,
    buildUnlock,
    portAndScarcityAdjustment,
    sevenRiskAdjustment,
    estimatedOpponentGain,
    threatPenalty,
    personalityAdjustment,
    total: incomingValue
      - outgoingValue
      + buildUnlock
      + portAndScarcityAdjustment
      + sevenRiskAdjustment
      - threatPenalty
      + personalityAdjustment,
  }
}

export function evaluateTradeOffer(
  view: PlayerView,
  offer: TradeOffer,
  profile: AiPersonalityProfile,
  counterDepth: 0 | 1,
): TradeEvaluation {
  const { outgoing, opponentId } = offerForViewer(view, offer)
  if (!canProvide(view.self.resources, outgoing)) {
    return { type: 'REJECT', score: Number.NEGATIVE_INFINITY, reasonCode: 'CANNOT_AFFORD' }
  }
  const score = scoreTradeOffer(view, offer, profile).total
  const opponent = view.opponents.find((candidate) => candidate.id === opponentId)
  if (opponent !== undefined && opponent.publicVictoryPoints >= 9 && score < 80) {
    return { type: 'REJECT', score, reasonCode: 'HELPS_LEADER_TOO_MUCH' }
  }
  if (score >= profile.acceptanceThreshold) {
    return { type: 'ACCEPT', score, reasonCode: 'ACCEPTABLE_VALUE' }
  }
  if (counterDepth === 0 && score >= profile.counterThreshold) {
    return { type: 'COUNTER', score, reasonCode: 'COUNTER_AVAILABLE' }
  }
  return {
    type: 'REJECT',
    score,
    reasonCode: countCards(view.self.resources) > 7
      ? 'PREFER_MARITIME_TRADE'
      : 'NOT_ENOUGH_VALUE',
  }
}

function resourceBundle(resource: ResourceType, quantity: number): ResourceBag {
  return {
    LUMBER: resource === 'LUMBER' ? quantity : 0,
    BRICK: resource === 'BRICK' ? quantity : 0,
    WOOL: resource === 'WOOL' ? quantity : 0,
    GRAIN: resource === 'GRAIN' ? quantity : 0,
    ORE: resource === 'ORE' ? quantity : 0,
  }
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

export function createDeterministicCounterOffer(
  view: PlayerView,
  offer: TradeOffer,
  profile: AiPersonalityProfile,
  tradeId: TradeId,
): TradeOffer | null {
  if (view.self.id !== offer.counterpartyId) return null
  if (!canProvide(view.self.resources, offer.counterpartyGives)) return null
  const values = deriveMarginalResourceValues(view, profile)
  const outgoingTypes = RESOURCE_TYPES.filter((resource) => offer.counterpartyGives[resource] > 0)
  const candidateResources = [...RESOURCE_TYPES]
    .filter((resource) => !outgoingTypes.includes(resource))
    .sort((left, right) => {
      const difference = values[right] - values[left]
      return difference !== 0 ? difference : compareCodeUnits(left, right)
    })
  const requested = candidateResources[0]
  if (requested === undefined) return null
  return {
    ...offer,
    tradeId,
    proposedById: view.self.id,
    initiatorGives: {
      ...offer.initiatorGives,
      [requested]: offer.initiatorGives[requested] + 1,
    },
    counterpartyGives: { ...offer.counterpartyGives },
    parentTradeId: offer.tradeId,
  }
}

export interface InitiatedTradeCandidate {
  readonly offer: TradeOffer
  readonly score: number
}

export function createInitiatedTradeCandidate(
  view: PlayerView,
  profile: AiPersonalityProfile,
  tradeId: TradeId,
): InitiatedTradeCandidate | null {
  const counterparties = view.legalActions.legalDomesticTradeCounterpartyIds ?? []
  if (counterparties.length === 0) return null
  const values = deriveMarginalResourceValues(view, profile)
  const desired = [...RESOURCE_TYPES].sort((left, right) => {
    const difference = values[right] - values[left]
    return difference !== 0 ? difference : compareCodeUnits(left, right)
  })[0]
  const expendable = [...RESOURCE_TYPES]
    .filter((resource) => resource !== desired && view.self.resources[resource] > 0)
    .sort((left, right) => {
      const difference = values[left] - values[right]
      return difference !== 0 ? difference : compareCodeUnits(left, right)
    })[0]
  if (desired === undefined || expendable === undefined) return null
  const orderedCounterparties = [...counterparties]
    .filter((playerId) => {
      const opponent = view.opponents.find((candidate) => candidate.id === playerId)
      return opponent === undefined || opponent.publicVictoryPoints < 9
    })
    .sort((left, right) => {
      const leftOpponent = view.opponents.find((candidate) => candidate.id === left)
      const rightOpponent = view.opponents.find((candidate) => candidate.id === right)
      const threatDifference = (leftOpponent?.publicVictoryPoints ?? 0)
        - (rightOpponent?.publicVictoryPoints ?? 0)
      return threatDifference !== 0 ? threatDifference : compareCodeUnits(left, right)
    })
  const counterpartyId = orderedCounterparties[0]
  if (counterpartyId === undefined) return null
  const offer: TradeOffer = {
    tradeId,
    initiatorId: view.self.id,
    counterpartyId,
    proposedById: view.self.id,
    initiatorGives: resourceBundle(expendable, 1),
    counterpartyGives: resourceBundle(desired, 1),
    parentTradeId: null,
  }
  const ownScore = scoreTradeOffer(view, offer, profile).total
  return { offer, score: ownScore }
}
