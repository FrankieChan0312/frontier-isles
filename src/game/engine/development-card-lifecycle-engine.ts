import type { CommandEnvelope, GameCommand } from '../contracts/commands.ts'
import type { EngineResult } from '../contracts/engine-result.ts'
import type { RuleViolation, RuleViolationCode } from '../contracts/errors.ts'
import type { GameEvent } from '../contracts/events.ts'
import type { OwnedDevelopmentCard } from '../model/development-card.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerState } from '../model/player.ts'
import type { ResourceType } from '../model/resource.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import { STANDARD_DEVELOPMENT_CARD_COST } from '../model/standard-development-card-cost.ts'
import {
  createOwnedDevelopmentCard,
  deriveLegalFreeRoadEdgeIds,
  findOwnedDevelopmentCard,
  isDevelopmentCardEffectPhase,
  remainingFreeRoadCount,
  replaceOwnedDevelopmentCardStatus,
  resumePhaseAfterCardEffect,
  transferInventionResources,
  transferMonopolyResource,
  validateActionCardPlayability,
  validateInventionSelection,
} from '../rules/development-card-rules.ts'
import { validateFreeRoadPlacement } from '../rules/paid-road-rules.ts'
import { canAffordResourceCost, payResourceCostToBank } from '../rules/resource-payment.ts'
import { deriveActualVictoryPoints } from '../rules/scoring.ts'
import { assertDevelopmentCardState } from './development-card-invariants.ts'
import {
  reconcileAwards,
  reconcileAwardsAndCurrentPlayerVictory,
  resolveCurrentPlayerVictory,
} from './scoring-reconciliation.ts'

export type DevelopmentCardLifecycleCommand = Extract<
  GameCommand,
  | { readonly type: 'BUY_DEVELOPMENT_CARD' }
  | { readonly type: 'PLAY_DEVELOPMENT_CARD' }
  | { readonly type: 'CHOOSE_INVENTION_RESOURCES' }
  | { readonly type: 'CHOOSE_MONOPOLY_RESOURCE' }
  | { readonly type: 'BUILD_ROAD' }
  | { readonly type: 'FINISH_FREE_ROAD_PLACEMENT' }
>

export type DevelopmentCardLifecycleCommandEnvelope = Omit<CommandEnvelope, 'command'> & {
  readonly command: DevelopmentCardLifecycleCommand
}

function failure(code: RuleViolationCode, details?: RuleViolation['details']): EngineResult {
  return details === undefined
    ? { ok: false, violation: { code } }
    : { ok: false, violation: { code, details } }
}

function executeBuy(
  state: GameState,
  envelope: DevelopmentCardLifecycleCommandEnvelope,
): EngineResult {
  const definition = state.bank.developmentDeck[0]
  if (definition === undefined) return failure('DEVELOPMENT_DECK_EMPTY')
  const player = state.players[envelope.actorId]
  if (player === undefined) throw new Error(`Development-card buyer ${envelope.actorId} is unknown.`)
  if (!canAffordResourceCost(player.resources, STANDARD_DEVELOPMENT_CARD_COST)) {
    return failure('INSUFFICIENT_RESOURCES')
  }
  const payment = payResourceCostToBank(
    player.resources,
    state.bank.resources,
    STANDARD_DEVELOPMENT_CARD_COST,
  )
  const owned = createOwnedDevelopmentCard(definition, state.turn.turnNumber)
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    players: {
      ...state.players,
      [envelope.actorId]: {
        ...player,
        resources: payment.playerResources,
        developmentCards: [...player.developmentCards, owned],
      },
    },
    bank: {
      resources: payment.bankResources,
      developmentDeck: state.bank.developmentDeck.slice(1),
    },
  }
  const scoring = reconcileAwardsAndCurrentPlayerVictory(nextState)
  assertDevelopmentCardState(scoring.state)
  return {
    ok: true,
    state: scoring.state,
    events: [{
      type: 'DEVELOPMENT_CARD_BOUGHT',
      ownerId: envelope.actorId,
      cardId: definition.id,
      cardType: definition.type,
      acquiredTurnNumber: state.turn.turnNumber,
    }, ...scoring.events],
  }
}

function playedPlayer(
  state: GameState,
  card: OwnedDevelopmentCard,
): PlayerState {
  const player = state.players[state.turn.currentPlayerId]
  if (player === undefined) throw new Error(`Current player ${state.turn.currentPlayerId} is unknown.`)
  return {
    ...player,
    developmentCards: replaceOwnedDevelopmentCardStatus(
      player.developmentCards,
      card.id,
      'PLAYED',
    ),
  }
}

function executePlay(
  state: GameState,
  envelope: DevelopmentCardLifecycleCommandEnvelope,
): EngineResult {
  if (envelope.command.type !== 'PLAY_DEVELOPMENT_CARD') return failure('WRONG_PHASE')
  const playability = validateActionCardPlayability(
    state,
    envelope.actorId,
    envelope.command.cardId,
  )
  if (playability !== null) return { ok: false, violation: playability }
  const card = findOwnedDevelopmentCard(state, envelope.actorId, envelope.command.cardId)
  if (card === null) throw new Error(`Playable development card ${envelope.command.cardId} disappeared.`)

  let roadCount: 1 | 2 | null = null
  if (card.type === 'ROAD_BUILDING') {
    roadCount = remainingFreeRoadCount(state, envelope.actorId)
    if (roadCount === null) return failure('DEVELOPMENT_CARD_NOT_PLAYABLE', { cardId: card.id })
  }
  if (
    card.type === 'INVENTION'
    && RESOURCE_TYPES.reduce((sum, resource) => sum + state.bank.resources[resource], 0) < 2
  ) return failure('DEVELOPMENT_CARD_NOT_PLAYABLE', { cardId: card.id })

  let player = playedPlayer(state, card)
  if (card.type === 'KNIGHT') player = { ...player, playedKnights: player.playedKnights + 1 }
  const commonState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    players: { ...state.players, [envelope.actorId]: player },
    turn: { ...state.turn, developmentCardPlayedThisTurn: true },
  }
  let nextState: GameState
  switch (card.type) {
    case 'KNIGHT':
      nextState = {
        ...commonState,
        turn: { ...commonState.turn, phase: 'ROBBER_MOVE_REQUIRED' },
        pendingDecision: {
          type: 'MOVE_ROBBER',
          actingPlayerId: envelope.actorId,
          cause: { type: 'KNIGHT', cardId: card.id },
        },
      }
      break
    case 'ROAD_BUILDING':
      if (roadCount === null) throw new Error('Road Building has no legal placement count.')
      nextState = {
        ...commonState,
        turn: { ...commonState.turn, phase: 'FREE_ROAD_PLACEMENT' },
        pendingDecision: {
          type: 'PLACE_FREE_ROADS',
          actingPlayerId: envelope.actorId,
          cardId: card.id,
          remainingRoadCount: roadCount,
        },
      }
      break
    case 'INVENTION':
      nextState = {
        ...commonState,
        pendingDecision: {
          type: 'CHOOSE_INVENTION_RESOURCES',
          actingPlayerId: envelope.actorId,
          cardId: card.id,
        },
      }
      break
    case 'MONOPOLY':
      nextState = {
        ...commonState,
        pendingDecision: {
          type: 'CHOOSE_MONOPOLY_RESOURCE',
          actingPlayerId: envelope.actorId,
          cardId: card.id,
        },
      }
      break
    case 'VICTORY_POINT':
      return failure('DEVELOPMENT_CARD_NOT_PLAYABLE', { cardId: card.id })
  }

  const playEvent: GameEvent = {
    type: 'DEVELOPMENT_CARD_PLAYED',
    ownerId: envelope.actorId,
    cardId: card.id,
    cardType: card.type,
  }
  if (card.type === 'KNIGHT') {
    const awards = reconcileAwards(nextState)
    assertDevelopmentCardState(awards.state)
    return { ok: true, state: awards.state, events: [playEvent, ...awards.events] }
  }
  assertDevelopmentCardState(nextState)
  return { ok: true, state: nextState, events: [playEvent] }
}

function executeFreeRoad(
  state: GameState,
  envelope: DevelopmentCardLifecycleCommandEnvelope,
): EngineResult {
  if (envelope.command.type !== 'BUILD_ROAD') return failure('WRONG_PHASE')
  const pending = state.pendingDecision
  if (pending?.type !== 'PLACE_FREE_ROADS') throw new Error('Free road requires PLACE_FREE_ROADS pending data.')
  const violation = validateFreeRoadPlacement(state, envelope.actorId, envelope.command.edgeId)
  if (violation !== null) return { ok: false, violation }
  const remainingRoadCount = pending.remainingRoadCount - 1
  const completed = remainingRoadCount === 0
  const rawState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    board: {
      ...state.board,
      edgeOccupancy: {
        ...state.board.edgeOccupancy,
        [envelope.command.edgeId]: { ownerId: envelope.actorId },
      },
    },
    turn: {
      ...state.turn,
      phase: completed ? resumePhaseAfterCardEffect(state) : 'FREE_ROAD_PLACEMENT',
    },
    pendingDecision: completed
      ? null
      : { ...pending, remainingRoadCount: 1 },
  }
  const awards = reconcileAwards(rawState)
  let finalState = awards.state
  let victoryEvents: readonly GameEvent[] = []
  if (deriveActualVictoryPoints(finalState, envelope.actorId) >= 10) {
    const stableState: GameState = {
      ...finalState,
      turn: { ...finalState.turn, phase: resumePhaseAfterCardEffect(finalState) },
      pendingDecision: null,
    }
    const victory = resolveCurrentPlayerVictory(stableState)
    finalState = victory.state
    victoryEvents = victory.events
  }
  assertDevelopmentCardState(finalState)
  return {
    ok: true,
    state: finalState,
    events: [{
      type: 'ROAD_BUILT',
      ownerId: envelope.actorId,
      edgeId: envelope.command.edgeId,
      source: 'ROAD_BUILDING_CARD',
    }, ...awards.events, ...victoryEvents],
  }
}

function executeFinishFreeRoad(
  state: GameState,
  envelope: DevelopmentCardLifecycleCommandEnvelope,
): EngineResult {
  const pending = state.pendingDecision
  if (pending?.type !== 'PLACE_FREE_ROADS') throw new Error('Finish free roads requires matching pending data.')
  if (
    pending.remainingRoadCount !== 1
    || deriveLegalFreeRoadEdgeIds(state, envelope.actorId).length > 0
  ) return failure('DEVELOPMENT_CARD_NOT_PLAYABLE')
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    turn: { ...state.turn, phase: resumePhaseAfterCardEffect(state) },
    pendingDecision: null,
  }
  assertDevelopmentCardState(nextState)
  return { ok: true, state: nextState, events: [] }
}

function executeInventionChoice(
  state: GameState,
  envelope: DevelopmentCardLifecycleCommandEnvelope,
): EngineResult {
  if (envelope.command.type !== 'CHOOSE_INVENTION_RESOURCES') return failure('WRONG_PHASE')
  const violation = validateInventionSelection(envelope.command.resources, state.bank.resources)
  if (violation !== null) return { ok: false, violation }
  const player = state.players[envelope.actorId]
  if (player === undefined) throw new Error(`Invention actor ${envelope.actorId} is unknown.`)
  const transfer = transferInventionResources(
    player.resources,
    state.bank.resources,
    envelope.command.resources,
  )
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    players: { ...state.players, [envelope.actorId]: { ...player, resources: transfer.playerResources } },
    bank: { ...state.bank, resources: transfer.bankResources },
    pendingDecision: null,
  }
  assertDevelopmentCardState(nextState)
  return { ok: true, state: nextState, events: [] }
}

function executeMonopolyChoice(
  state: GameState,
  envelope: DevelopmentCardLifecycleCommandEnvelope,
): EngineResult {
  if (envelope.command.type !== 'CHOOSE_MONOPOLY_RESOURCE') return failure('WRONG_PHASE')
  if (!RESOURCE_TYPES.includes(envelope.command.resource as ResourceType)) {
    return failure('DEVELOPMENT_CARD_NOT_PLAYABLE')
  }
  const transfer = transferMonopolyResource(state, envelope.actorId, envelope.command.resource)
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    players: transfer.players,
    pendingDecision: null,
  }
  assertDevelopmentCardState(nextState)
  return { ok: true, state: nextState, events: [] }
}

function expectedPendingType(
  command: DevelopmentCardLifecycleCommand,
): NonNullable<GameState['pendingDecision']>['type'] | null {
  if (command.type === 'CHOOSE_INVENTION_RESOURCES') return 'CHOOSE_INVENTION_RESOURCES'
  if (command.type === 'CHOOSE_MONOPOLY_RESOURCE') return 'CHOOSE_MONOPOLY_RESOURCE'
  if (command.type === 'BUILD_ROAD' || command.type === 'FINISH_FREE_ROAD_PLACEMENT') {
    return 'PLACE_FREE_ROADS'
  }
  return null
}

function executePendingCommand(
  state: GameState,
  envelope: DevelopmentCardLifecycleCommandEnvelope,
): EngineResult {
  const expected = expectedPendingType(envelope.command)
  if (expected === null) throw new Error('Expected a pending development-card command.')
  if (state.pendingDecision !== null && state.pendingDecision.type !== expected) {
    return failure('PENDING_DECISION_REQUIRED')
  }
  const pending = state.pendingDecision
  const phaseMatches = expected === 'PLACE_FREE_ROADS'
    ? state.turn.phase === 'FREE_ROAD_PLACEMENT'
    : isDevelopmentCardEffectPhase(state.turn.phase)
  if (pending === null || pending.type !== expected || !phaseMatches) {
    return failure('WRONG_PHASE', { phase: state.turn.phase, command: envelope.command.type })
  }
  if (!('actingPlayerId' in pending)) throw new Error('Card-effect pending decision lacks an acting player.')
  if (envelope.actorId !== pending.actingPlayerId) return failure('NOT_YOUR_TURN')
  if (envelope.command.type === 'BUILD_ROAD') return executeFreeRoad(state, envelope)
  if (envelope.command.type === 'FINISH_FREE_ROAD_PLACEMENT') {
    return executeFinishFreeRoad(state, envelope)
  }
  if (envelope.command.type === 'CHOOSE_INVENTION_RESOURCES') {
    return executeInventionChoice(state, envelope)
  }
  return executeMonopolyChoice(state, envelope)
}

export function executeDevelopmentCardLifecycleCommand(
  state: GameState,
  envelope: DevelopmentCardLifecycleCommandEnvelope,
): EngineResult {
  assertDevelopmentCardState(state)
  if (envelope.expectedStateVersion !== state.stateVersion) {
    return failure('STALE_STATE_VERSION', {
      expected: envelope.expectedStateVersion,
      actual: state.stateVersion,
    })
  }
  if (state.players[envelope.actorId] === undefined) {
    return failure('UNKNOWN_ACTOR', { actorId: envelope.actorId })
  }
  if (state.winnerId !== null || state.turn.phase === 'GAME_OVER') return failure('GAME_OVER')

  const expected = expectedPendingType(envelope.command)
  if (expected !== null) return executePendingCommand(state, envelope)

  if (state.pendingDecision !== null) return failure('PENDING_DECISION_REQUIRED')
  if (envelope.actorId !== state.turn.currentPlayerId) return failure('NOT_YOUR_TURN')
  const validPhase = envelope.command.type === 'BUY_DEVELOPMENT_CARD'
    ? state.turn.phase === 'ACTION'
    : isDevelopmentCardEffectPhase(state.turn.phase)
  if (!validPhase) {
    return failure('WRONG_PHASE', { phase: state.turn.phase, command: envelope.command.type })
  }
  return envelope.command.type === 'BUY_DEVELOPMENT_CARD'
    ? executeBuy(state, envelope)
    : executePlay(state, envelope)
}
