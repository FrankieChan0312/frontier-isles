import type { GameCommand } from '../game/contracts/commands.ts'
import type { PlayerView } from '../game/contracts/views.ts'
import type { AiProfileId, EdgeId, TradeId, VertexId } from '../game/model/ids.ts'
import type { AiAgent, AiDecisionContext } from './ai-agent.ts'
import { createAiCommandKey, DeterministicCoreAiAgent } from './core-ai-agent.ts'
import { scoreRoadForExpansion, scoreVertexForProduction } from './evaluation/core-evaluation.ts'
import {
  resolveAiPersonality,
  type AiPersonalityProfile,
} from './personalities/ai-profiles.ts'
import {
  createDeterministicCounterOffer,
  createInitiatedTradeCandidate,
  evaluateTradeOffer,
} from './trade/trade-evaluation.ts'

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function chooseHighest<Id extends string>(
  ids: readonly Id[],
  score: (id: Id) => number,
): Id | null {
  return [...ids].sort((left, right) => {
    const difference = score(right) - score(left)
    return difference !== 0 ? difference : compareCodeUnits(left, right)
  })[0] ?? null
}

function profileFrom(view: PlayerView, context: AiDecisionContext): AiPersonalityProfile {
  const controllerProfile = view.self.controller.type === 'AI'
    ? view.self.controller.profileId
    : undefined
  return resolveAiPersonality(context.profileId ?? controllerProfile)
}

function deterministicTradeId(
  view: PlayerView,
  attempt: number,
  suffix: string,
): TradeId {
  return `trade:ai:${view.publicGame.turn.turnNumber}:${view.self.id}:${attempt}:${suffix}` as TradeId
}

function tradeAttempts(context: AiDecisionContext): number {
  return context.previousCommandKeysThisTurn.filter((key) => key.startsWith('PROPOSE_TRADE:')).length
}

function pendingTradeResponse(
  view: PlayerView,
  context: AiDecisionContext,
  profile: AiPersonalityProfile,
): GameCommand | null {
  const pending = view.pendingDecision
  if (pending?.type !== 'RESPOND_TO_TRADE' || pending.responderId !== view.self.id) return null
  const evaluation = evaluateTradeOffer(view, pending.offer, profile, pending.counterDepth)
  if (evaluation.type === 'ACCEPT') {
    return { type: 'ACCEPT_TRADE', tradeId: pending.offer.tradeId }
  }
  if (evaluation.type === 'COUNTER' && pending.counterDepth === 0) {
    const counter = createDeterministicCounterOffer(
      view,
      pending.offer,
      profile,
      deterministicTradeId(view, tradeAttempts(context) + 1, 'counter'),
    )
    if (counter !== null) {
      return {
        type: 'COUNTER_TRADE',
        previousTradeId: pending.offer.tradeId,
        offer: counter,
      }
    }
  }
  return { type: 'REJECT_TRADE', tradeId: pending.offer.tradeId }
}

function initiatedTrade(
  view: PlayerView,
  context: AiDecisionContext,
  profile: AiPersonalityProfile,
): GameCommand | null {
  if (view.publicGame.turn.phase !== 'ACTION' || view.pendingDecision !== null) return null
  const attempts = tradeAttempts(context)
  if (attempts >= profile.maximumTradeAttempts) return null
  const candidate = createInitiatedTradeCandidate(
    view,
    profile,
    deterministicTradeId(view, attempts + 1, 'offer'),
  )
  if (candidate === null || candidate.score < profile.initiationThreshold) return null
  const command: GameCommand = { type: 'PROPOSE_TRADE', offer: candidate.offer }
  const key = createAiCommandKey(command)
  if (context.previousCommandKeysThisTurn.includes(key)) return null
  return command
}

function portScore(view: PlayerView, vertexId: VertexId): number {
  return Object.values(view.publicGame.board.topology.ports).reduce(
    (total, port) => port.vertexIds.includes(vertexId)
      ? total + (port.kind.type === 'RESOURCE' ? 2 : 1)
      : total,
    0,
  )
}

function personalizeCoreCommand(
  view: PlayerView,
  profile: AiPersonalityProfile,
  command: GameCommand,
): GameCommand {
  if (command.type === 'PLACE_INITIAL_SETTLEMENT') {
    const candidates = view.legalActions.legalInitialSettlementVertexIds ?? []
    const vertexId = chooseHighest(candidates, (candidate) =>
      scoreVertexForProduction(view, candidate) * profile.productionWeight
        + portScore(view, candidate) * profile.portWeight * 20,
    )
    return vertexId === null ? command : { type: 'PLACE_INITIAL_SETTLEMENT', vertexId }
  }
  if (command.type === 'PLACE_INITIAL_ROAD') {
    const candidates = view.legalActions.legalInitialRoadEdgeIds ?? []
    const edgeId = chooseHighest(candidates, (candidate) =>
      scoreRoadForExpansion(view, candidate) * profile.expansionWeight,
    )
    return edgeId === null ? command : { type: 'PLACE_INITIAL_ROAD', edgeId }
  }
  if (command.type === 'BUILD_SETTLEMENT' && profile.id === 'BUILDER') {
    const candidates = view.legalActions.legalSettlementVertexIds
    const vertexId = chooseHighest(candidates, (candidate) =>
      scoreVertexForProduction(view, candidate) * profile.expansionWeight,
    )
    return vertexId === null ? command : { type: 'BUILD_SETTLEMENT', vertexId }
  }
  if (command.type === 'UPGRADE_CITY' && profile.id === 'BUILDER') {
    const candidates = view.legalActions.legalCityUpgradeVertexIds
    const vertexId = chooseHighest(candidates, (candidate) =>
      scoreVertexForProduction(view, candidate) * profile.cityWeight,
    )
    return vertexId === null ? command : { type: 'UPGRADE_CITY', vertexId }
  }
  if (command.type === 'BUILD_ROAD') {
    const candidates: readonly EdgeId[] = view.legalActions.legalRoadEdgeIds
    const edgeId = chooseHighest(candidates, (candidate) =>
      scoreRoadForExpansion(view, candidate) * profile.expansionWeight,
    )
    return edgeId === null ? command : { type: 'BUILD_ROAD', edgeId }
  }
  if (command.type === 'STEAL_FROM_PLAYER' && profile.id === 'SENTINEL') {
    const candidates = view.legalActions.eligibleRobberTargetPlayerIds
    const target = chooseHighest(candidates, (playerId) => {
      const opponent = view.opponents.find((candidate) => candidate.id === playerId)
      return (opponent?.publicVictoryPoints ?? 0) * profile.threatWeight * 20
        + (opponent?.resourceCardCount ?? 0)
    })
    return target === null ? command : { type: 'STEAL_FROM_PLAYER', targetPlayerId: target }
  }
  return command
}

export class PersonalityAiAgent implements AiAgent {
  readonly #core: AiAgent

  constructor(core: AiAgent = new DeterministicCoreAiAgent()) {
    this.#core = core
  }

  async chooseNextCommand(
    view: PlayerView,
    context: AiDecisionContext,
  ): Promise<GameCommand> {
    const profile = profileFrom(view, context)
    const response = pendingTradeResponse(view, context, profile)
    if (response !== null) return response
    const proposal = initiatedTrade(view, context, profile)
    if (proposal !== null) return proposal
    const coreCommand = await this.#core.chooseNextCommand(view, context)
    return personalizeCoreCommand(view, profile, coreCommand)
  }
}

export function profileIdForAgent(view: PlayerView, context: AiDecisionContext): AiProfileId {
  const profile = profileFrom(view, context)
  return profile.id as AiProfileId
}
