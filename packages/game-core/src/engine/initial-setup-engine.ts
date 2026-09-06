import type { CommandEnvelope, GameCommand } from '../contracts/commands.ts'
import type { EngineResult } from '../contracts/engine-result.ts'
import type { RuleViolation, RuleViolationCode } from '../contracts/errors.ts'
import type { GameEvent } from '../contracts/events.ts'
import type { GameState } from '../model/game-state.ts'
import type { TurnState } from '../model/turn.ts'
import { validateInitialRoad } from '../rules/initial-road-rules.ts'
import { validateInitialSettlement } from '../rules/initial-settlement-rules.ts'
import { grantStartingResources } from '../rules/starting-resource-grant.ts'
import { assertInitialSetupState } from './initial-setup-invariants.ts'

export type InitialSetupCommand = Extract<
  GameCommand,
  | { readonly type: 'PLACE_INITIAL_SETTLEMENT' }
  | { readonly type: 'PLACE_INITIAL_ROAD' }
>

export type InitialSetupCommandEnvelope = Omit<CommandEnvelope, 'command'> & {
  readonly command: InitialSetupCommand
}

function failure(code: RuleViolationCode, details?: RuleViolation['details']): EngineResult {
  return details === undefined ? { ok: false, violation: { code } } : { ok: false, violation: { code, details } }
}

function requiredCommandForPhase(phase: GameState['turn']['phase']): InitialSetupCommand['type'] | null {
  if (phase === 'SETUP_SETTLEMENT') return 'PLACE_INITIAL_SETTLEMENT'
  if (phase === 'SETUP_ROAD') return 'PLACE_INITIAL_ROAD'
  return null
}

function nextSetupTurn(
  state: GameState,
): { readonly turn: TurnState; readonly completed: boolean } {
  const setup = state.turn.setup
  if (setup === null) throw new Error('Cannot advance an initial road without setup state.')

  if (setup.round === 1) {
    if (setup.placementIndex < 3) {
      const nextIndex = setup.placementIndex + 1
      const playerId = state.playerOrder[nextIndex]
      if (playerId === undefined) throw new Error(`Cannot resolve round-1 setup player ${nextIndex}.`)
      return {
        completed: false,
        turn: {
          ...state.turn,
          currentPlayerId: playerId,
          phase: 'SETUP_SETTLEMENT',
          setup: { round: 1, placementIndex: nextIndex, pendingSettlementVertexId: null },
        },
      }
    }
    return {
      completed: false,
      turn: {
        ...state.turn,
        currentPlayerId: state.playerOrder[3],
        phase: 'SETUP_SETTLEMENT',
        setup: { round: 2, placementIndex: 0, pendingSettlementVertexId: null },
      },
    }
  }

  if (setup.placementIndex < 3) {
    const nextIndex = setup.placementIndex + 1
    const orderIndex = 3 - nextIndex
    const playerId = state.playerOrder[orderIndex]
    if (playerId === undefined) throw new Error(`Cannot resolve round-2 setup player ${nextIndex}.`)
    return {
      completed: false,
      turn: {
        ...state.turn,
        currentPlayerId: playerId,
        phase: 'SETUP_SETTLEMENT',
        setup: { round: 2, placementIndex: nextIndex, pendingSettlementVertexId: null },
      },
    }
  }

  return {
    completed: true,
    turn: {
      turnNumber: 1,
      currentPlayerId: state.playerOrder[0],
      phase: 'ROLL_REQUIRED',
      setup: null,
      lastRoll: null,
      developmentCardPlayedThisTurn: false,
    },
  }
}

function placeSettlement(state: GameState, envelope: InitialSetupCommandEnvelope): EngineResult {
  if (envelope.command.type !== 'PLACE_INITIAL_SETTLEMENT') {
    return failure('WRONG_PHASE')
  }
  const violation = validateInitialSettlement(state, envelope.actorId, envelope.command.vertexId)
  if (violation !== null) return { ok: false, violation }
  const setup = state.turn.setup
  if (setup === null) throw new Error('SETUP_SETTLEMENT requires setup state.')

  const settlementEvent: GameEvent = {
    type: 'SETTLEMENT_BUILT',
    ownerId: envelope.actorId,
    vertexId: envelope.command.vertexId,
    source: 'INITIAL_PLACEMENT',
  }
  const board = {
    ...state.board,
    vertexOccupancy: {
      ...state.board.vertexOccupancy,
      [envelope.command.vertexId]: { type: 'SETTLEMENT' as const, ownerId: envelope.actorId },
    },
  }
  const grant = setup.round === 2
    ? grantStartingResources({ ...state, board }, envelope.actorId, envelope.command.vertexId)
    : { players: state.players, bank: state.bank, events: [] as readonly GameEvent[] }
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    board,
    players: grant.players,
    bank: grant.bank,
    turn: {
      ...state.turn,
      phase: 'SETUP_ROAD',
      setup: { ...setup, pendingSettlementVertexId: envelope.command.vertexId },
    },
  }
  assertInitialSetupState(nextState)
  return { ok: true, state: nextState, events: [settlementEvent, ...grant.events] }
}

function placeRoad(state: GameState, envelope: InitialSetupCommandEnvelope): EngineResult {
  if (envelope.command.type !== 'PLACE_INITIAL_ROAD') return failure('WRONG_PHASE')
  const setup = state.turn.setup
  const pendingVertexId = setup?.pendingSettlementVertexId
  if (pendingVertexId === null || pendingVertexId === undefined) {
    throw new Error('SETUP_ROAD requires a pending settlement vertex.')
  }
  const violation = validateInitialRoad(state, envelope.actorId, envelope.command.edgeId, pendingVertexId)
  if (violation !== null) return { ok: false, violation }

  const transition = nextSetupTurn(state)
  const roadEvent: GameEvent = {
    type: 'ROAD_BUILT',
    ownerId: envelope.actorId,
    edgeId: envelope.command.edgeId,
    source: 'INITIAL_PLACEMENT',
  }
  const events: GameEvent[] = [roadEvent]
  if (transition.completed) {
    events.push({ type: 'TURN_STARTED', playerId: state.playerOrder[0], turnNumber: 1 })
  }
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    board: {
      ...state.board,
      edgeOccupancy: {
        ...state.board.edgeOccupancy,
        [envelope.command.edgeId]: { ownerId: envelope.actorId },
      },
    },
    turn: transition.turn,
  }
  assertInitialSetupState(nextState)
  return { ok: true, state: nextState, events }
}

export function executeInitialSetupCommand(
  state: GameState,
  envelope: InitialSetupCommandEnvelope,
): EngineResult {
  assertInitialSetupState(state)
  if (envelope.expectedStateVersion !== state.stateVersion) {
    return failure('STALE_STATE_VERSION', { expected: envelope.expectedStateVersion, actual: state.stateVersion })
  }
  if (state.players[envelope.actorId] === undefined) return failure('UNKNOWN_ACTOR', { actorId: envelope.actorId })
  if (state.winnerId !== null || state.turn.phase === 'GAME_OVER') return failure('GAME_OVER')
  if (state.pendingDecision !== null) return failure('PENDING_DECISION_REQUIRED')
  if (envelope.actorId !== state.turn.currentPlayerId) return failure('NOT_YOUR_TURN')
  const requiredCommand = requiredCommandForPhase(state.turn.phase)
  if (requiredCommand === null || envelope.command.type !== requiredCommand) {
    return failure('WRONG_PHASE', { phase: state.turn.phase, command: envelope.command.type })
  }

  return state.turn.phase === 'SETUP_SETTLEMENT'
    ? placeSettlement(state, envelope)
    : placeRoad(state, envelope)
}
