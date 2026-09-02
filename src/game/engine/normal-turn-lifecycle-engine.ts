import type { CommandEnvelope, GameCommand } from '../contracts/commands.ts'
import type { EngineResult } from '../contracts/engine-result.ts'
import type { RuleViolation, RuleViolationCode } from '../contracts/errors.ts'
import type { GameEvent } from '../contracts/events.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerId } from '../model/ids.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import { rollDice } from '../random/roll-dice.ts'
import { produceResourcesForRoll } from '../rules/resource-production.ts'
import { resolveCurrentPlayerVictory } from './scoring-reconciliation.ts'
import { assertScoringState } from './scoring-invariants.ts'

export type NormalTurnLifecycleCommand = Extract<
  GameCommand,
  { readonly type: 'ROLL_DICE' } | { readonly type: 'END_TURN' }
>

export type NormalTurnLifecycleCommandEnvelope = Omit<CommandEnvelope, 'command'> & {
  readonly command: NormalTurnLifecycleCommand
}

function failure(code: RuleViolationCode, details?: RuleViolation['details']): EngineResult {
  return details === undefined
    ? { ok: false, violation: { code } }
    : { ok: false, violation: { code, details } }
}

function requiredPhase(command: NormalTurnLifecycleCommand): 'ROLL_REQUIRED' | 'ACTION' {
  return command.type === 'ROLL_DICE' ? 'ROLL_REQUIRED' : 'ACTION'
}

function executeRoll(state: GameState): EngineResult {
  const diceResult = rollDice(state.random)
  const roll = diceResult.value
  const diceEvent: GameEvent = {
    type: 'DICE_ROLLED',
    playerId: state.turn.currentPlayerId,
    roll,
  }

  if (roll.total === 7) {
    const requiredCountByPlayer = {} as Record<PlayerId, number>
    for (const playerId of state.playerOrder) {
      const player = state.players[playerId]
      if (player === undefined) throw new Error(`Cannot resolve resource hand for player ${playerId}.`)
      const resourceCount = RESOURCE_TYPES.reduce(
        (sum, resource) => sum + player.resources[resource],
        0,
      )
      if (resourceCount > 7) requiredCountByPlayer[playerId] = Math.floor(resourceCount / 2)
    }

    const mustDiscard = Object.keys(requiredCountByPlayer).length > 0
    const nextState: GameState = {
      ...state,
      stateVersion: state.stateVersion + 1,
      random: diceResult.random,
      turn: {
        ...state.turn,
        phase: mustDiscard ? 'DISCARD_REQUIRED' : 'ROBBER_MOVE_REQUIRED',
        setup: null,
        lastRoll: roll,
      },
      pendingDecision: mustDiscard
        ? {
            type: 'DISCARD_RESOURCES',
            triggeringPlayerId: state.turn.currentPlayerId,
            requiredCountByPlayer,
            completedPlayerIds: [],
          }
        : {
            type: 'MOVE_ROBBER',
            actingPlayerId: state.turn.currentPlayerId,
            cause: { type: 'DICE_SEVEN' },
          },
    }
    assertScoringState(nextState)
    return { ok: true, state: nextState, events: [diceEvent] }
  }

  const production = produceResourcesForRoll(state, roll.total)
  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    players: production.players,
    bank: production.bank,
    random: diceResult.random,
    turn: {
      ...state.turn,
      phase: 'ACTION',
      setup: null,
      lastRoll: roll,
    },
    pendingDecision: null,
  }
  assertScoringState(nextState)
  return { ok: true, state: nextState, events: [diceEvent, ...production.events] }
}

function executeEndTurn(state: GameState): EngineResult {
  const currentIndex = state.playerOrder.indexOf(state.turn.currentPlayerId)
  if (currentIndex < 0) {
    throw new Error(`Cannot end turn for player ${state.turn.currentPlayerId}, who is absent from playerOrder.`)
  }
  const nextPlayerId = state.playerOrder[(currentIndex + 1) % state.playerOrder.length]
  if (nextPlayerId === undefined) throw new Error('Cannot resolve the next clockwise player.')
  const nextTurnNumber = state.turn.turnNumber + 1
  if (!Number.isSafeInteger(nextTurnNumber)) throw new Error('Cannot increment turnNumber safely.')

  const nextState: GameState = {
    ...state,
    stateVersion: state.stateVersion + 1,
    turn: {
      turnNumber: nextTurnNumber,
      currentPlayerId: nextPlayerId,
      phase: 'ROLL_REQUIRED',
      setup: null,
      lastRoll: null,
      developmentCardPlayedThisTurn: false,
    },
    pendingDecision: null,
  }
  const victory = resolveCurrentPlayerVictory(nextState)
  assertScoringState(victory.state)
  return {
    ok: true,
    state: victory.state,
    events: [
      { type: 'TURN_ENDED', playerId: state.turn.currentPlayerId, turnNumber: state.turn.turnNumber },
      { type: 'TURN_STARTED', playerId: nextPlayerId, turnNumber: nextTurnNumber },
      ...victory.events,
    ],
  }
}

export function executeNormalTurnLifecycleCommand(
  state: GameState,
  envelope: NormalTurnLifecycleCommandEnvelope,
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
  if (state.turn.phase !== requiredPhase(envelope.command)) {
    return failure('WRONG_PHASE', { phase: state.turn.phase, command: envelope.command.type })
  }

  return envelope.command.type === 'ROLL_DICE'
    ? executeRoll(state)
    : executeEndTurn(state)
}
