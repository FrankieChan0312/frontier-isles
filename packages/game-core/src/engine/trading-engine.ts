import type { CommandEnvelope, GameCommand } from '../contracts/commands.ts'
import type { EngineResult } from '../contracts/engine-result.ts'
import type { RuleViolation, RuleViolationCode } from '../contracts/errors.ts'
import type { GameState } from '../model/game-state.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import type { ResourceType } from '../model/resource.ts'
import {
  canProvideTradeBundle,
  cloneTradeOffer,
  exchangeDomesticTradeBundles,
  hasPositiveResourceOverlap,
  hasValidCounterTradeLineage,
  hasValidInitialTradeParties,
  hasValidTradeBundles,
} from '../rules/domestic-trade-rules.ts'
import {
  deriveBestMaritimeTradeRatio,
  exchangeMaritimeResources,
} from '../rules/maritime-trade-rules.ts'
import { assertTradingState } from './trading-invariants.ts'

export type TradingCommand = Extract<
  GameCommand,
  | { readonly type: 'PROPOSE_TRADE' }
  | { readonly type: 'ACCEPT_TRADE' }
  | { readonly type: 'REJECT_TRADE' }
  | { readonly type: 'COUNTER_TRADE' }
  | { readonly type: 'MARITIME_TRADE' }
>

export type TradingCommandEnvelope = Omit<CommandEnvelope, 'command'> & {
  readonly command: TradingCommand
}

function failure(code: RuleViolationCode, details?: RuleViolation['details']): EngineResult {
  return details === undefined
    ? { ok: false, violation: { code } }
    : { ok: false, violation: { code, details } }
}

function executeProposal(state: GameState, envelope: TradingCommandEnvelope): EngineResult {
  if (envelope.command.type !== 'PROPOSE_TRADE') return failure('TRADE_NOT_ALLOWED')
  const offer = envelope.command.offer
  if (!hasValidInitialTradeParties(state, envelope.actorId, offer)) {
    return failure('TRADE_PARTY_MISMATCH')
  }
  if (!hasValidTradeBundles(offer)) return failure('INVALID_TRADE_OFFER')
  if (hasPositiveResourceOverlap(offer.initiatorGives, offer.counterpartyGives)) {
    return failure('SAME_RESOURCE_TRADE')
  }
  const initiator = state.players[offer.initiatorId]
  if (initiator === undefined) throw new Error(`Trade initiator ${offer.initiatorId} disappeared.`)
  if (!canProvideTradeBundle(initiator, offer.initiatorGives)) {
    return failure('TRADE_RESOURCE_UNAVAILABLE')
  }
  const storedOffer = cloneTradeOffer(offer)
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    pendingDecision: {
      type: 'RESPOND_TO_TRADE',
      responderId: storedOffer.counterpartyId,
      offer: storedOffer,
      counterDepth: 0,
    },
  }
  assertTradingState(nextState)
  return { ok: true, state: nextState, events: [{ type: 'TRADE_PROPOSED', offer: storedOffer }] }
}

function executeMaritime(state: GameState, envelope: TradingCommandEnvelope): EngineResult {
  if (envelope.command.type !== 'MARITIME_TRADE') return failure('MARITIME_TRADE_NOT_ALLOWED')
  const { giveResource, receiveResource } = envelope.command
  if (
    !RESOURCE_TYPES.includes(giveResource as ResourceType)
    || !RESOURCE_TYPES.includes(receiveResource as ResourceType)
  ) return failure('MARITIME_TRADE_NOT_ALLOWED')
  if (giveResource === receiveResource) return failure('SAME_RESOURCE_TRADE')
  const player = state.players[envelope.actorId]
  if (player === undefined) throw new Error(`Maritime trader ${envelope.actorId} disappeared.`)
  const ratio = deriveBestMaritimeTradeRatio(state.board, envelope.actorId, giveResource)
  if (player.resources[giveResource] < ratio) return failure('INSUFFICIENT_RESOURCES')
  if (state.bank.resources[receiveResource] < 1) {
    return failure('BANK_RESOURCE_UNAVAILABLE', { resource: receiveResource })
  }
  const exchange = exchangeMaritimeResources(
    player.resources,
    state.bank.resources,
    giveResource,
    receiveResource,
    ratio,
  )
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    players: {
      ...state.players,
      [envelope.actorId]: { ...player, resources: exchange.playerResources },
    },
    bank: { ...state.bank, resources: exchange.bankResources },
  }
  assertTradingState(nextState)
  return {
    ok: true,
    state: nextState,
    events: [{
      type: 'MARITIME_TRADE_COMPLETED',
      playerId: envelope.actorId,
      giveResource,
      receiveResource,
      ratio,
    }],
  }
}

function executeReject(state: GameState, envelope: TradingCommandEnvelope): EngineResult {
  if (envelope.command.type !== 'REJECT_TRADE') return failure('TRADE_NOT_ALLOWED')
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    pendingDecision: null,
  }
  assertTradingState(nextState)
  return {
    ok: true,
    state: nextState,
    events: [{
      type: 'TRADE_REJECTED',
      tradeId: envelope.command.tradeId,
      rejectedById: envelope.actorId,
    }],
  }
}

function executeCounter(state: GameState, envelope: TradingCommandEnvelope): EngineResult {
  if (envelope.command.type !== 'COUNTER_TRADE') return failure('TRADE_NOT_ALLOWED')
  const pending = state.pendingDecision
  if (pending?.type !== 'RESPOND_TO_TRADE') throw new Error('Counter requires trade pending data.')
  if (pending.counterDepth === 1) return failure('TRADE_NOT_ALLOWED')
  const offer = envelope.command.offer
  if (!hasValidCounterTradeLineage(pending, envelope.actorId, offer)) {
    return failure('TRADE_PARTY_MISMATCH')
  }
  if (!hasValidTradeBundles(offer)) return failure('INVALID_TRADE_OFFER')
  if (hasPositiveResourceOverlap(offer.initiatorGives, offer.counterpartyGives)) {
    return failure('SAME_RESOURCE_TRADE')
  }
  const counterparty = state.players[offer.counterpartyId]
  if (counterparty === undefined) throw new Error(`Trade counterparty ${offer.counterpartyId} disappeared.`)
  if (!canProvideTradeBundle(counterparty, offer.counterpartyGives)) {
    return failure('TRADE_RESOURCE_UNAVAILABLE')
  }
  const storedOffer = cloneTradeOffer(offer)
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    pendingDecision: {
      type: 'RESPOND_TO_TRADE',
      responderId: storedOffer.initiatorId,
      offer: storedOffer,
      counterDepth: 1,
    },
  }
  assertTradingState(nextState)
  return {
    ok: true,
    state: nextState,
    events: [{
      type: 'TRADE_COUNTERED',
      previousTradeId: envelope.command.previousTradeId,
      offer: storedOffer,
    }],
  }
}

function executeAccept(state: GameState): EngineResult {
  const pending = state.pendingDecision
  if (pending?.type !== 'RESPOND_TO_TRADE') throw new Error('Acceptance requires trade pending data.')
  const offer = pending.offer
  const initiator = state.players[offer.initiatorId]
  const counterparty = state.players[offer.counterpartyId]
  if (initiator === undefined || counterparty === undefined) {
    throw new Error('Accepted trade references a missing party.')
  }
  if (
    !canProvideTradeBundle(initiator, offer.initiatorGives)
    || !canProvideTradeBundle(counterparty, offer.counterpartyGives)
  ) return failure('TRADE_RESOURCE_UNAVAILABLE')
  const exchange = exchangeDomesticTradeBundles(
    initiator.resources,
    counterparty.resources,
    offer,
  )
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    players: {
      ...state.players,
      [offer.initiatorId]: { ...initiator, resources: exchange.initiatorResources },
      [offer.counterpartyId]: { ...counterparty, resources: exchange.counterpartyResources },
    },
    pendingDecision: null,
  }
  assertTradingState(nextState)
  return { ok: true, state: nextState, events: [{ type: 'TRADE_COMPLETED', offer }] }
}

function currentPendingTradeId(command: TradingCommand): string | null {
  if (command.type === 'ACCEPT_TRADE' || command.type === 'REJECT_TRADE') return command.tradeId
  if (command.type === 'COUNTER_TRADE') return command.previousTradeId
  return null
}

function executeResponse(state: GameState, envelope: TradingCommandEnvelope): EngineResult {
  if (state.pendingDecision === null) return failure('TRADE_NOT_PENDING')
  if (state.pendingDecision.type !== 'RESPOND_TO_TRADE') {
    return failure('PENDING_DECISION_REQUIRED')
  }
  if (currentPendingTradeId(envelope.command) !== state.pendingDecision.offer.tradeId) {
    return failure('TRADE_NOT_PENDING')
  }
  if (envelope.actorId !== state.pendingDecision.responderId) {
    return failure('TRADE_PARTY_MISMATCH')
  }
  if (envelope.command.type === 'REJECT_TRADE') return executeReject(state, envelope)
  if (envelope.command.type === 'COUNTER_TRADE') return executeCounter(state, envelope)
  return executeAccept(state)
}

export function executeTradingCommand(
  state: GameState,
  envelope: TradingCommandEnvelope,
): EngineResult {
  assertTradingState(state)
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

  const isResponse = envelope.command.type === 'ACCEPT_TRADE'
    || envelope.command.type === 'REJECT_TRADE'
    || envelope.command.type === 'COUNTER_TRADE'
  if (isResponse) return executeResponse(state, envelope)

  if (state.pendingDecision !== null) return failure('PENDING_DECISION_REQUIRED')
  if (envelope.actorId !== state.turn.currentPlayerId) return failure('NOT_YOUR_TURN')
  if (state.turn.phase !== 'ACTION') {
    return failure('WRONG_PHASE', { phase: state.turn.phase, command: envelope.command.type })
  }
  return envelope.command.type === 'PROPOSE_TRADE'
    ? executeProposal(state, envelope)
    : executeMaritime(state, envelope)
}
