import type { CommandEnvelope, GameCommand } from '../contracts/commands.ts'
import type { EngineResult } from '../contracts/engine-result.ts'
import type { RuleViolation, RuleViolationCode } from '../contracts/errors.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerId } from '../model/ids.ts'
import type { RobberCause } from '../model/pending-decision.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import type { ResourceBag } from '../model/resource.ts'
import type { GamePhase } from '../model/turn.ts'
import { drawRandomResourceFromBag } from '../random/draw-random-resource.ts'
import { validateDiscardSelection } from '../rules/discard-rules.ts'
import { deriveEligibleRobberTargetPlayerIds } from '../rules/robber-target-rules.ts'
import { assertRobberWorkflowState } from './robber-workflow-invariants.ts'

export type RobberWorkflowCommand = Extract<
  GameCommand,
  | { readonly type: 'DISCARD_RESOURCES' }
  | { readonly type: 'MOVE_ROBBER' }
  | { readonly type: 'STEAL_FROM_PLAYER' }
>

export type RobberWorkflowCommandEnvelope = Omit<CommandEnvelope, 'command'> & {
  readonly command: RobberWorkflowCommand
}

function failure(code: RuleViolationCode, details?: RuleViolation['details']): EngineResult {
  return details === undefined
    ? { ok: false, violation: { code } }
    : { ok: false, violation: { code, details } }
}

function pendingTypeForCommand(
  command: RobberWorkflowCommand,
): NonNullable<GameState['pendingDecision']>['type'] {
  if (command.type === 'DISCARD_RESOURCES') return 'DISCARD_RESOURCES'
  if (command.type === 'MOVE_ROBBER') return 'MOVE_ROBBER'
  return 'CHOOSE_ROBBER_TARGET'
}

function phaseForCommand(command: RobberWorkflowCommand): GamePhase {
  if (command.type === 'DISCARD_RESOURCES') return 'DISCARD_REQUIRED'
  if (command.type === 'MOVE_ROBBER') return 'ROBBER_MOVE_REQUIRED'
  return 'ROBBER_TARGET_REQUIRED'
}

function resumePhase(cause: RobberCause, state: GameState): 'ROLL_REQUIRED' | 'ACTION' {
  if (cause.type === 'DICE_SEVEN') return 'ACTION'
  return state.turn.lastRoll === null ? 'ROLL_REQUIRED' : 'ACTION'
}

function cloneBag(resources: ResourceBag): ResourceBag {
  return {
    LUMBER: resources.LUMBER,
    BRICK: resources.BRICK,
    WOOL: resources.WOOL,
    GRAIN: resources.GRAIN,
    ORE: resources.ORE,
  }
}

function executeDiscard(
  state: GameState,
  envelope: RobberWorkflowCommandEnvelope,
): EngineResult {
  if (envelope.command.type !== 'DISCARD_RESOURCES') return failure('WRONG_PHASE')
  const pending = state.pendingDecision
  if (pending?.type !== 'DISCARD_RESOURCES') throw new Error('Discard command requires discard pending data.')
  const requiredCount = pending.requiredCountByPlayer[envelope.actorId]
  if (requiredCount === undefined || pending.completedPlayerIds.includes(envelope.actorId)) {
    return failure('INVALID_DISCARD', { reason: 'PLAYER_NOT_REQUIRED' })
  }
  const player = state.players[envelope.actorId]
  if (player === undefined) throw new Error(`Discard actor ${envelope.actorId} is unknown.`)
  const violation = validateDiscardSelection(envelope.command.resources, player.resources, requiredCount)
  if (violation !== null) return { ok: false, violation }

  const playerResources: Record<(typeof RESOURCE_TYPES)[number], number> = { ...player.resources }
  const bankResources: Record<(typeof RESOURCE_TYPES)[number], number> = { ...state.bank.resources }
  for (const resource of RESOURCE_TYPES) {
    playerResources[resource] -= envelope.command.resources[resource]
    bankResources[resource] += envelope.command.resources[resource]
  }
  const completedSet = new Set([...pending.completedPlayerIds, envelope.actorId])
  const completedPlayerIds = state.playerOrder.filter((playerId) => completedSet.has(playerId))
  const remaining = Object.keys(pending.requiredCountByPlayer).some(
    (playerId) => !completedSet.has(playerId as PlayerId),
  )
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    players: {
      ...state.players,
      [envelope.actorId]: { ...player, resources: playerResources },
    },
    bank: { ...state.bank, resources: bankResources },
    turn: {
      ...state.turn,
      phase: remaining ? 'DISCARD_REQUIRED' : 'ROBBER_MOVE_REQUIRED',
    },
    pendingDecision: remaining
      ? { ...pending, completedPlayerIds }
      : {
          type: 'MOVE_ROBBER',
          actingPlayerId: pending.triggeringPlayerId,
          cause: { type: 'DICE_SEVEN' },
        },
  }
  assertRobberWorkflowState(nextState)
  return {
    ok: true,
    state: nextState,
    events: [{
      type: 'RESOURCES_DISCARDED',
      playerId: envelope.actorId,
      resources: cloneBag(envelope.command.resources),
    }],
  }
}

function executeMove(
  state: GameState,
  envelope: RobberWorkflowCommandEnvelope,
): EngineResult {
  if (envelope.command.type !== 'MOVE_ROBBER') return failure('WRONG_PHASE')
  const pending = state.pendingDecision
  if (pending?.type !== 'MOVE_ROBBER') throw new Error('Move command requires move-robber pending data.')
  if (envelope.actorId !== pending.actingPlayerId) return failure('NOT_YOUR_TURN')
  const tileId = envelope.command.tileId
  if (
    state.board.topology.tiles[tileId] === undefined
    || tileId === state.board.robberTileId
  ) {
    return failure('INVALID_ROBBER_TILE', { tileId })
  }

  const targets = deriveEligibleRobberTargetPlayerIds(state, tileId, envelope.actorId)
  const phase = targets.length === 0 ? resumePhase(pending.cause, state) : 'ROBBER_TARGET_REQUIRED'
  const oldTileId = state.board.robberTileId
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    board: { ...state.board, robberTileId: tileId },
    turn: { ...state.turn, phase },
    pendingDecision: targets.length === 0
      ? null
      : {
          type: 'CHOOSE_ROBBER_TARGET',
          actingPlayerId: pending.actingPlayerId,
          selectedTileId: tileId,
          eligibleTargetPlayerIds: targets,
          cause: pending.cause,
        },
  }
  assertRobberWorkflowState(nextState)
  return {
    ok: true,
    state: nextState,
    events: [{
      type: 'ROBBER_MOVED',
      playerId: envelope.actorId,
      fromTileId: oldTileId,
      toTileId: tileId,
      cause: pending.cause,
    }],
  }
}

function executeSteal(
  state: GameState,
  envelope: RobberWorkflowCommandEnvelope,
): EngineResult {
  if (envelope.command.type !== 'STEAL_FROM_PLAYER') return failure('WRONG_PHASE')
  const pending = state.pendingDecision
  if (pending?.type !== 'CHOOSE_ROBBER_TARGET') throw new Error('Steal command requires robber-target pending data.')
  if (envelope.actorId !== pending.actingPlayerId) return failure('NOT_YOUR_TURN')
  const targetId = envelope.command.targetPlayerId
  if (targetId === envelope.actorId || !pending.eligibleTargetPlayerIds.includes(targetId)) {
    return failure('INVALID_ROBBER_TARGET', { targetPlayerId: targetId })
  }
  const actor = state.players[envelope.actorId]
  const target = state.players[targetId]
  if (actor === undefined || target === undefined) {
    return failure('INVALID_ROBBER_TARGET', { targetPlayerId: targetId })
  }

  const draw = drawRandomResourceFromBag(target.resources, state.random)
  const actorResources = { ...actor.resources, [draw.value]: actor.resources[draw.value] + 1 }
  const targetResources = { ...target.resources, [draw.value]: target.resources[draw.value] - 1 }
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    players: {
      ...state.players,
      [envelope.actorId]: { ...actor, resources: actorResources },
      [targetId]: { ...target, resources: targetResources },
    },
    turn: { ...state.turn, phase: resumePhase(pending.cause, state) },
    pendingDecision: null,
    random: draw.random,
  }
  assertRobberWorkflowState(nextState)
  return {
    ok: true,
    state: nextState,
    events: [{
      type: 'RESOURCE_STOLEN',
      fromPlayerId: targetId,
      toPlayerId: envelope.actorId,
      resource: draw.value,
    }],
  }
}

export function executeRobberWorkflowCommand(
  state: GameState,
  envelope: RobberWorkflowCommandEnvelope,
): EngineResult {
  assertRobberWorkflowState(state)
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

  const expectedPendingType = pendingTypeForCommand(envelope.command)
  if (state.pendingDecision !== null && state.pendingDecision.type !== expectedPendingType) {
    return failure('PENDING_DECISION_REQUIRED')
  }
  if (
    state.pendingDecision === null
    || state.pendingDecision.type !== expectedPendingType
    || state.turn.phase !== phaseForCommand(envelope.command)
  ) {
    return failure('WRONG_PHASE', { phase: state.turn.phase, command: envelope.command.type })
  }

  if (envelope.command.type === 'DISCARD_RESOURCES') return executeDiscard(state, envelope)
  if (envelope.command.type === 'MOVE_ROBBER') return executeMove(state, envelope)
  return executeSteal(state, envelope)
}
