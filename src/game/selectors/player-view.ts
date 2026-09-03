import type {
  DevelopmentCardPlayabilityReason,
  DevelopmentCardPlayabilityView,
  LegalActionView,
  LegalInventionSelection,
  PendingDecisionView,
  PlayerView,
  PrivatePlayerState,
  PublicPlayerState,
} from '../contracts/views.ts'
import type {
  BoardState,
  EdgeDefinition,
  PortDefinition,
  TileContent,
  TileDefinition,
  VertexDefinition,
} from '../model/board-state.ts'
import type { GameState } from '../model/game-state.ts'
import type { EdgeId, PlayerId, PortId, TileId, VertexId } from '../model/ids.ts'
import type { PlayerController } from '../model/player.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import type { ResourceBag, ResourceType } from '../model/resource.ts'
import type { TradeOffer } from '../model/trade.ts'
import { STANDARD_DEVELOPMENT_CARD_COST } from '../model/standard-development-card-cost.ts'
import { validateCityUpgrade } from '../rules/city-upgrade-rules.ts'
import {
  deriveLegalFreeRoadEdgeIds,
  remainingFreeRoadCount,
  validateActionCardPlayability,
} from '../rules/development-card-rules.ts'
import { canProvideTradeBundle } from '../rules/domestic-trade-rules.ts'
import { validateInitialRoad } from '../rules/initial-road-rules.ts'
import { validateInitialSettlement } from '../rules/initial-settlement-rules.ts'
import { deriveBestMaritimeTradeRatio } from '../rules/maritime-trade-rules.ts'
import { validatePaidRoadPlacement } from '../rules/paid-road-rules.ts'
import { validatePaidSettlementPlacement } from '../rules/paid-settlement-rules.ts'
import { canAffordResourceCost } from '../rules/resource-payment.ts'
import { deriveActualVictoryPoints, derivePublicVictoryPoints } from '../rules/scoring.ts'
import { assertTradingState } from '../engine/trading-invariants.ts'

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function developmentCardPlayabilityReason(
  state: GameState,
  viewerId: PlayerId,
  card: GameState['players'][PlayerId]['developmentCards'][number],
): DevelopmentCardPlayabilityReason {
  if (card.type === 'VICTORY_POINT') return 'VICTORY_POINT'
  if (card.status !== 'IN_HAND') return 'ALREADY_PLAYED'
  if (state.winnerId !== null || state.turn.phase === 'GAME_OVER') return 'GAME_OVER'
  if (state.turn.currentPlayerId !== viewerId) return 'NOT_YOUR_TURN'
  if (state.pendingDecision !== null) return 'PENDING_DECISION'
  if (state.turn.phase !== 'ROLL_REQUIRED' && state.turn.phase !== 'ACTION') return 'WRONG_PHASE'
  if (card.acquiredTurnNumber >= state.turn.turnNumber) return 'BOUGHT_THIS_TURN'
  if (state.turn.developmentCardPlayedThisTurn) return 'CARD_LIMIT_REACHED'
  if (validateActionCardPlayability(state, viewerId, card.id) !== null) return 'EFFECT_UNAVAILABLE'
  if (card.type === 'ROAD_BUILDING' && remainingFreeRoadCount(state, viewerId) === null) {
    return 'EFFECT_UNAVAILABLE'
  }
  if (
    card.type === 'INVENTION'
    && RESOURCE_TYPES.reduce((total, resource) => total + state.bank.resources[resource], 0) < 2
  ) return 'EFFECT_UNAVAILABLE'
  return 'PLAYABLE'
}

function cloneResourceBag(resources: ResourceBag): ResourceBag {
  return {
    LUMBER: resources.LUMBER,
    BRICK: resources.BRICK,
    WOOL: resources.WOOL,
    GRAIN: resources.GRAIN,
    ORE: resources.ORE,
  }
}

function cloneController(controller: PlayerController): PlayerController {
  return controller.type === 'HUMAN'
    ? { type: 'HUMAN' }
    : { type: 'AI', profileId: controller.profileId }
}

function cloneTradeOffer(offer: TradeOffer): TradeOffer {
  return {
    ...offer,
    initiatorGives: cloneResourceBag(offer.initiatorGives),
    counterpartyGives: cloneResourceBag(offer.counterpartyGives),
  }
}

function cloneBoard(board: BoardState): BoardState {
  const tiles = {} as Record<TileId, TileDefinition>
  for (const [id, tile] of Object.entries(board.topology.tiles) as [TileId, TileDefinition][]) {
    tiles[id] = {
      ...tile,
      coordinate: { ...tile.coordinate },
      vertexIds: [...tile.vertexIds],
      edgeIds: [...tile.edgeIds],
    }
  }
  const vertices = {} as Record<VertexId, VertexDefinition>
  for (const [id, vertex] of Object.entries(board.topology.vertices) as [VertexId, VertexDefinition][]) {
    vertices[id] = {
      ...vertex,
      adjacentVertexIds: [...vertex.adjacentVertexIds],
      edgeIds: [...vertex.edgeIds],
      tileIds: [...vertex.tileIds],
    }
  }
  const edges = {} as Record<EdgeId, EdgeDefinition>
  for (const [id, edge] of Object.entries(board.topology.edges) as [EdgeId, EdgeDefinition][]) {
    edges[id] = { ...edge, vertexIds: [...edge.vertexIds], tileIds: [...edge.tileIds] }
  }
  const ports = {} as Record<PortId, PortDefinition>
  for (const [id, port] of Object.entries(board.topology.ports) as [PortId, PortDefinition][]) {
    ports[id] = {
      ...port,
      vertexIds: [...port.vertexIds],
      kind: port.kind.type === 'GENERIC'
        ? { type: 'GENERIC' }
        : { type: 'RESOURCE', resource: port.kind.resource },
    }
  }
  const tileContents = {} as Record<TileId, TileContent>
  for (const [id, content] of Object.entries(board.tileContents) as [TileId, TileContent][]) {
    tileContents[id] = { ...content }
  }
  const vertexOccupancy = {} as Record<VertexId, BoardState['vertexOccupancy'][VertexId]>
  for (const [id, building] of Object.entries(board.vertexOccupancy) as [
    VertexId,
    BoardState['vertexOccupancy'][VertexId],
  ][]) {
    vertexOccupancy[id] = building === null || building === undefined ? null : { ...building }
  }
  const edgeOccupancy = {} as Record<EdgeId, BoardState['edgeOccupancy'][EdgeId]>
  for (const [id, road] of Object.entries(board.edgeOccupancy) as [
    EdgeId,
    BoardState['edgeOccupancy'][EdgeId],
  ][]) {
    edgeOccupancy[id] = road === null || road === undefined ? null : { ...road }
  }
  return {
    generatorVersion: board.generatorVersion,
    topology: { tiles, vertices, edges, ports },
    tileContents,
    vertexOccupancy,
    edgeOccupancy,
    robberTileId: board.robberTileId,
  }
}

function createInventionSelections(bank: ResourceBag): readonly LegalInventionSelection[] {
  const selections: LegalInventionSelection[] = []
  for (let firstIndex = 0; firstIndex < RESOURCE_TYPES.length; firstIndex += 1) {
    const first = RESOURCE_TYPES[firstIndex]
    if (first === undefined || bank[first] < 1) continue
    for (let secondIndex = firstIndex; secondIndex < RESOURCE_TYPES.length; secondIndex += 1) {
      const second = RESOURCE_TYPES[secondIndex]
      if (second === undefined || bank[second] < (second === first ? 2 : 1)) continue
      selections.push({
        LUMBER: Number(first === 'LUMBER') + Number(second === 'LUMBER'),
        BRICK: Number(first === 'BRICK') + Number(second === 'BRICK'),
        WOOL: Number(first === 'WOOL') + Number(second === 'WOOL'),
        GRAIN: Number(first === 'GRAIN') + Number(second === 'GRAIN'),
        ORE: Number(first === 'ORE') + Number(second === 'ORE'),
      })
    }
  }
  return selections
}

function createPendingDecisionView(
  state: GameState,
  viewerId: PlayerId,
): PendingDecisionView | null {
  const pending = state.pendingDecision
  if (pending === null) return null
  switch (pending.type) {
    case 'DISCARD_RESOURCES': {
      const requiredCount = pending.requiredCountByPlayer[viewerId]
      if (requiredCount !== undefined && !pending.completedPlayerIds.includes(viewerId)) {
        return { type: 'DISCARD_RESOURCES', requiredCount }
      }
      return {
        type: 'AWAITING_DISCARDS',
        remainingPlayerIds: state.playerOrder.filter(
          (playerId) => pending.requiredCountByPlayer[playerId] !== undefined
            && !pending.completedPlayerIds.includes(playerId),
        ),
      }
    }
    case 'MOVE_ROBBER':
      return {
        ...pending,
        cause: { ...pending.cause },
        legalTileIds: (Object.keys(state.board.topology.tiles) as TileId[])
          .filter((tileId) => tileId !== state.board.robberTileId)
          .sort(compareCodeUnits),
      }
    case 'CHOOSE_ROBBER_TARGET':
      return {
        ...pending,
        eligibleTargetPlayerIds: [...pending.eligibleTargetPlayerIds],
        cause: { ...pending.cause },
      }
    case 'PLACE_FREE_ROADS':
      return {
        ...pending,
        legalEdgeIds: deriveLegalFreeRoadEdgeIds(state, pending.actingPlayerId),
      }
    case 'CHOOSE_INVENTION_RESOURCES':
      return pending.actingPlayerId === viewerId
        ? { ...pending, availableResources: cloneResourceBag(state.bank.resources) }
        : null
    case 'CHOOSE_MONOPOLY_RESOURCE':
      return pending.actingPlayerId === viewerId
        ? { ...pending, legalResourceTypes: [...RESOURCE_TYPES] }
        : null
    case 'RESPOND_TO_TRADE':
      return pending.offer.initiatorId === viewerId || pending.offer.counterpartyId === viewerId
        ? { ...pending, offer: cloneTradeOffer(pending.offer) }
        : {
            type: 'TRADE_IN_PROGRESS',
            initiatorId: pending.offer.initiatorId,
            counterpartyId: pending.offer.counterpartyId,
            responderId: pending.responderId,
            counterDepth: pending.counterDepth,
          }
  }
}

function createLegalActions(state: GameState, viewerId: PlayerId): LegalActionView {
  const player = state.players[viewerId]
  if (player === undefined) throw new Error(`Cannot derive legal actions for unknown viewer ${viewerId}.`)
  const isCurrent = state.turn.currentPlayerId === viewerId
  const isGameOver = state.winnerId !== null || state.turn.phase === 'GAME_OVER'
  const noPending = state.pendingDecision === null
  const vertexIds = (Object.keys(state.board.topology.vertices) as VertexId[]).sort(compareCodeUnits)
  const edgeIds = (Object.keys(state.board.topology.edges) as EdgeId[]).sort(compareCodeUnits)

  const legalInitialSettlementVertexIds = !isGameOver
    && isCurrent
    && noPending
    && state.turn.phase === 'SETUP_SETTLEMENT'
    ? vertexIds.filter((vertexId) => validateInitialSettlement(state, viewerId, vertexId) === null)
    : []
  const pendingSetupVertexId = state.turn.setup?.pendingSettlementVertexId
  const legalInitialRoadEdgeIds = !isGameOver
    && isCurrent
    && noPending
    && state.turn.phase === 'SETUP_ROAD'
    && pendingSetupVertexId !== null
    && pendingSetupVertexId !== undefined
    ? edgeIds.filter(
        (edgeId) => validateInitialRoad(state, viewerId, edgeId, pendingSetupVertexId) === null,
      )
    : []

  const freeRoadPending = state.pendingDecision?.type === 'PLACE_FREE_ROADS'
    && state.pendingDecision.actingPlayerId === viewerId
    && state.turn.phase === 'FREE_ROAD_PLACEMENT'
  const legalRoadEdgeIds = freeRoadPending
    ? deriveLegalFreeRoadEdgeIds(state, viewerId)
    : !isGameOver && isCurrent && noPending && state.turn.phase === 'ACTION'
      ? edgeIds.filter((edgeId) => validatePaidRoadPlacement(state, viewerId, edgeId) === null)
      : []
  const legalSettlementVertexIds = !isGameOver && isCurrent && noPending && state.turn.phase === 'ACTION'
    ? vertexIds.filter(
        (vertexId) => validatePaidSettlementPlacement(state, viewerId, vertexId) === null,
      )
    : []
  const legalCityUpgradeVertexIds = !isGameOver && isCurrent && noPending && state.turn.phase === 'ACTION'
    ? vertexIds.filter((vertexId) => validateCityUpgrade(state, viewerId, vertexId) === null)
    : []

  const canRollDice = !isGameOver && isCurrent && noPending && state.turn.phase === 'ROLL_REQUIRED'
  const canEndTurn = !isGameOver && isCurrent && noPending && state.turn.phase === 'ACTION'
  const canBuyDevelopmentCard = !isGameOver
    && isCurrent
    && noPending
    && state.turn.phase === 'ACTION'
    && state.bank.developmentDeck.length > 0
    && canAffordResourceCost(player.resources, STANDARD_DEVELOPMENT_CARD_COST)
  const developmentCardPlayability: readonly DevelopmentCardPlayabilityView[] =
    player.developmentCards.map((card) => {
      const reason = developmentCardPlayabilityReason(state, viewerId, card)
      return { cardId: card.id, canPlay: reason === 'PLAYABLE', reason }
    })
  const playableDevelopmentCardIds = developmentCardPlayability
    .filter((card) => card.canPlay)
    .map((card) => card.cardId)
    .sort(compareCodeUnits)

  const discardPending = state.pendingDecision?.type === 'DISCARD_RESOURCES'
    ? state.pendingDecision
    : null
  const requiredDiscardCount = discardPending?.requiredCountByPlayer[viewerId] !== undefined
    && !discardPending.completedPlayerIds.includes(viewerId)
    ? discardPending.requiredCountByPlayer[viewerId] ?? null
    : null
  const robberMovePending = state.pendingDecision?.type === 'MOVE_ROBBER'
    && state.pendingDecision.actingPlayerId === viewerId
    ? state.pendingDecision
    : null
  const legalRobberTileIds = robberMovePending !== null
    ? (Object.keys(state.board.topology.tiles) as TileId[])
        .filter((tileId) => tileId !== state.board.robberTileId)
        .sort(compareCodeUnits)
    : []
  const robberTargetPending = state.pendingDecision?.type === 'CHOOSE_ROBBER_TARGET'
    && state.pendingDecision.actingPlayerId === viewerId
    ? state.pendingDecision
    : null
  const eligibleRobberTargetPlayerIds = robberTargetPending === null
    ? []
    : [...robberTargetPending.eligibleTargetPlayerIds]

  const inventionPending = state.pendingDecision?.type === 'CHOOSE_INVENTION_RESOURCES'
    && state.pendingDecision.actingPlayerId === viewerId
  const monopolyPending = state.pendingDecision?.type === 'CHOOSE_MONOPOLY_RESOURCE'
    && state.pendingDecision.actingPlayerId === viewerId
  const legalInventionSelections = inventionPending
    ? createInventionSelections(state.bank.resources)
    : []
  const legalMonopolyResourceTypes: readonly ResourceType[] = monopolyPending
    ? [...RESOURCE_TYPES]
    : []

  const legalMaritimeTradeOptions = !isGameOver && isCurrent && noPending && state.turn.phase === 'ACTION'
    ? RESOURCE_TYPES.flatMap((giveResource) => {
        const ratio = deriveBestMaritimeTradeRatio(state.board, viewerId, giveResource)
        if (player.resources[giveResource] < ratio) return []
        return RESOURCE_TYPES
          .filter(
            (receiveResource) => receiveResource !== giveResource
              && state.bank.resources[receiveResource] > 0,
          )
          .map((receiveResource) => ({ giveResource, receiveResource, ratio }))
      })
    : []
  const legalDomesticTradeCounterpartyIds = !isGameOver
    && isCurrent
    && noPending
    && state.turn.phase === 'ACTION'
    ? state.playerOrder.filter((playerId) => playerId !== viewerId)
    : []
  const hasResourceToOffer = RESOURCE_TYPES.some((resource) => player.resources[resource] > 0)
  const canProposeTrade = hasResourceToOffer && legalDomesticTradeCounterpartyIds.length > 0

  const tradePending = state.pendingDecision?.type === 'RESPOND_TO_TRADE'
    && state.pendingDecision.responderId === viewerId
    ? state.pendingDecision
    : null
  const viewerOutgoing = tradePending === null
    ? null
    : tradePending.offer.initiatorId === viewerId
      ? tradePending.offer.initiatorGives
      : tradePending.offer.counterpartyGives
  const tradeResponse = tradePending === null || viewerOutgoing === null
    ? null
    : {
        canAccept: canProvideTradeBundle(player, viewerOutgoing),
        canReject: true,
        canCounter: tradePending.counterDepth === 0 && hasResourceToOffer,
      }
  const canFinishFreeRoadPlacement = freeRoadPending
    && state.pendingDecision?.type === 'PLACE_FREE_ROADS'
    && state.pendingDecision.remainingRoadCount === 1
    && legalRoadEdgeIds.length === 0

  const permittedCommandTypes: NonNullable<LegalActionView['permittedCommandTypes']>[number][] = []
  if (legalInitialSettlementVertexIds.length > 0) permittedCommandTypes.push('PLACE_INITIAL_SETTLEMENT')
  if (legalInitialRoadEdgeIds.length > 0) permittedCommandTypes.push('PLACE_INITIAL_ROAD')
  if (canRollDice) permittedCommandTypes.push('ROLL_DICE')
  if (requiredDiscardCount !== null) permittedCommandTypes.push('DISCARD_RESOURCES')
  if (legalRobberTileIds.length > 0) permittedCommandTypes.push('MOVE_ROBBER')
  if (eligibleRobberTargetPlayerIds.length > 0) permittedCommandTypes.push('STEAL_FROM_PLAYER')
  if (legalRoadEdgeIds.length > 0) permittedCommandTypes.push('BUILD_ROAD')
  if (legalSettlementVertexIds.length > 0) permittedCommandTypes.push('BUILD_SETTLEMENT')
  if (legalCityUpgradeVertexIds.length > 0) permittedCommandTypes.push('UPGRADE_CITY')
  if (canBuyDevelopmentCard) permittedCommandTypes.push('BUY_DEVELOPMENT_CARD')
  if (playableDevelopmentCardIds.length > 0) permittedCommandTypes.push('PLAY_DEVELOPMENT_CARD')
  if (legalInventionSelections.length > 0) permittedCommandTypes.push('CHOOSE_INVENTION_RESOURCES')
  if (legalMonopolyResourceTypes.length > 0) permittedCommandTypes.push('CHOOSE_MONOPOLY_RESOURCE')
  if (canFinishFreeRoadPlacement) permittedCommandTypes.push('FINISH_FREE_ROAD_PLACEMENT')
  if (canProposeTrade) permittedCommandTypes.push('PROPOSE_TRADE')
  if (tradeResponse?.canAccept === true) permittedCommandTypes.push('ACCEPT_TRADE')
  if (tradeResponse?.canReject === true) permittedCommandTypes.push('REJECT_TRADE')
  if (tradeResponse?.canCounter === true) permittedCommandTypes.push('COUNTER_TRADE')
  if (legalMaritimeTradeOptions.length > 0) permittedCommandTypes.push('MARITIME_TRADE')
  if (canEndTurn) permittedCommandTypes.push('END_TURN')

  return {
    permittedCommandTypes,
    canRollDice,
    canEndTurn,
    canBuyDevelopmentCard,
    canProposeTrade,
    canFinishFreeRoadPlacement,
    legalInitialSettlementVertexIds,
    legalInitialRoadEdgeIds,
    legalRoadEdgeIds,
    legalSettlementVertexIds,
    legalCityUpgradeVertexIds,
    legalRobberTileIds,
    eligibleRobberTargetPlayerIds,
    requiredDiscardCount,
    discardableResources: requiredDiscardCount === null ? null : cloneResourceBag(player.resources),
    playableDevelopmentCardIds,
    developmentCardPlayability,
    legalInventionSelections,
    legalMonopolyResourceTypes,
    legalMaritimeTradeOptions,
    legalDomesticTradeCounterpartyIds,
    tradeResponse,
  }
}

export function createPlayerView(state: GameState, viewerId: PlayerId): PlayerView {
  assertTradingState(state)
  const viewer = state.players[viewerId]
  if (viewer === undefined) throw new Error(`Cannot create PlayerView for unknown player ${viewerId}.`)
  const self: PrivatePlayerState = {
    id: viewer.id,
    name: viewer.name,
    color: viewer.color,
    controller: cloneController(viewer.controller),
    resources: cloneResourceBag(viewer.resources),
    developmentCards: viewer.developmentCards.map((card) => ({ ...card })),
    playedKnights: viewer.playedKnights,
    publicVictoryPoints: derivePublicVictoryPoints(state, viewerId),
    actualVictoryPoints: deriveActualVictoryPoints(state, viewerId),
  }
  const opponents: PublicPlayerState[] = state.playerOrder
    .filter((playerId) => playerId !== viewerId)
    .map((playerId) => {
      const player = state.players[playerId]
      if (player === undefined) throw new Error(`Cannot project missing opponent ${playerId}.`)
      return {
        id: player.id,
        name: player.name,
        color: player.color,
        controller: cloneController(player.controller),
        resourceCardCount: RESOURCE_TYPES.reduce(
          (total, resource) => total + player.resources[resource],
          0,
        ),
        developmentCardCount: player.developmentCards.filter(
          (card) => card.status === 'IN_HAND',
        ).length,
        playedKnights: player.playedKnights,
        publicVictoryPoints: derivePublicVictoryPoints(state, playerId),
      }
    })

  return {
    stateVersion: state.stateVersion,
    publicGame: {
      gameId: state.gameId,
      stateVersion: state.stateVersion,
      rulesetId: state.rulesetId,
      board: cloneBoard(state.board),
      bank: {
        resources: cloneResourceBag(state.bank.resources),
        developmentDeckCount: state.bank.developmentDeck.length,
      },
      turn: {
        ...state.turn,
        setup: state.turn.setup === null ? null : { ...state.turn.setup },
        lastRoll: state.turn.lastRoll === null ? null : { ...state.turn.lastRoll },
      },
      awards: { ...state.awards },
      winnerId: state.winnerId,
    },
    self,
    opponents,
    pendingDecision: createPendingDecisionView(state, viewerId),
    legalActions: createLegalActions(state, viewerId),
  }
}
