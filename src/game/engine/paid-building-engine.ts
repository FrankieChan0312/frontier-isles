import type { CommandEnvelope, GameCommand } from '../contracts/commands.ts'
import type { EngineResult } from '../contracts/engine-result.ts'
import type { RuleViolation, RuleViolationCode } from '../contracts/errors.ts'
import type { GameEvent } from '../contracts/events.ts'
import type { GameState } from '../model/game-state.ts'
import type { ResourceBag } from '../model/resource.ts'
import {
  STANDARD_CITY_COST,
  STANDARD_ROAD_COST,
  STANDARD_SETTLEMENT_COST,
} from '../model/standard-build-costs.ts'
import { validateCityUpgrade } from '../rules/city-upgrade-rules.ts'
import { validatePaidRoadPlacement } from '../rules/paid-road-rules.ts'
import { validatePaidSettlementPlacement } from '../rules/paid-settlement-rules.ts'
import { payResourceCostToBank } from '../rules/resource-payment.ts'
import { reconcileAwardsAndCurrentPlayerVictory } from './scoring-reconciliation.ts'
import { assertScoringState } from './scoring-invariants.ts'

export type PaidBuildingCommand = Extract<
  GameCommand,
  | { readonly type: 'BUILD_ROAD' }
  | { readonly type: 'BUILD_SETTLEMENT' }
  | { readonly type: 'UPGRADE_CITY' }
>

export type PaidBuildingCommandEnvelope = Omit<CommandEnvelope, 'command'> & {
  readonly command: PaidBuildingCommand
}

function failure(code: RuleViolationCode, details?: RuleViolation['details']): EngineResult {
  return details === undefined
    ? { ok: false, violation: { code } }
    : { ok: false, violation: { code, details } }
}

function executeBuild(state: GameState, envelope: PaidBuildingCommandEnvelope): EngineResult {
  const actor = state.players[envelope.actorId]
  if (actor === undefined) throw new Error(`Paid build actor ${envelope.actorId} is unknown.`)

  let violation: RuleViolation | null
  let cost: ResourceBag
  let board: GameState['board']
  let event: GameEvent
  switch (envelope.command.type) {
    case 'BUILD_ROAD':
      violation = validatePaidRoadPlacement(state, envelope.actorId, envelope.command.edgeId)
      if (violation !== null) return { ok: false, violation }
      cost = STANDARD_ROAD_COST
      board = {
        ...state.board,
        edgeOccupancy: {
          ...state.board.edgeOccupancy,
          [envelope.command.edgeId]: { ownerId: envelope.actorId },
        },
      }
      event = {
        type: 'ROAD_BUILT',
        ownerId: envelope.actorId,
        edgeId: envelope.command.edgeId,
        source: 'PAID_BUILD',
      }
      break
    case 'BUILD_SETTLEMENT':
      violation = validatePaidSettlementPlacement(state, envelope.actorId, envelope.command.vertexId)
      if (violation !== null) return { ok: false, violation }
      cost = STANDARD_SETTLEMENT_COST
      board = {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          [envelope.command.vertexId]: { type: 'SETTLEMENT', ownerId: envelope.actorId },
        },
      }
      event = {
        type: 'SETTLEMENT_BUILT',
        ownerId: envelope.actorId,
        vertexId: envelope.command.vertexId,
        source: 'PAID_BUILD',
      }
      break
    case 'UPGRADE_CITY':
      violation = validateCityUpgrade(state, envelope.actorId, envelope.command.vertexId)
      if (violation !== null) return { ok: false, violation }
      cost = STANDARD_CITY_COST
      board = {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          [envelope.command.vertexId]: { type: 'CITY', ownerId: envelope.actorId },
        },
      }
      event = {
        type: 'CITY_BUILT',
        ownerId: envelope.actorId,
        vertexId: envelope.command.vertexId,
      }
      break
  }

  const payment = payResourceCostToBank(actor.resources, state.bank.resources, cost)
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    board,
    players: {
      ...state.players,
      [envelope.actorId]: { ...actor, resources: payment.playerResources },
    },
    bank: { ...state.bank, resources: payment.bankResources },
  }
  const scoring = reconcileAwardsAndCurrentPlayerVictory(nextState)
  assertScoringState(scoring.state)
  return { ok: true, state: scoring.state, events: [event, ...scoring.events] }
}

export function executePaidBuildingCommand(
  state: GameState,
  envelope: PaidBuildingCommandEnvelope,
): EngineResult {
  assertScoringState(state)
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
  if (state.pendingDecision !== null) return failure('PENDING_DECISION_REQUIRED')
  if (envelope.actorId !== state.turn.currentPlayerId) return failure('NOT_YOUR_TURN')
  if (state.turn.phase !== 'ACTION') {
    return failure('WRONG_PHASE', { phase: state.turn.phase, command: envelope.command.type })
  }
  return executeBuild(state, envelope)
}
