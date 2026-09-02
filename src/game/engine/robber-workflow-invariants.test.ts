import type { GameState } from '../model/game-state.ts'
import type { CommandId, DevelopmentCardId, PlayerId, TileId } from '../model/ids.ts'
import { executeRobberWorkflowCommand } from './robber-workflow-engine.ts'
import { assertRobberWorkflowState } from './robber-workflow-invariants.ts'
import {
  createBalancedDiscardState,
  createNoDiscardRobberMoveState,
} from './task-07-controlled-seven.test-helper.ts'
import { GOLDEN_PLAYER_IDS } from './task-05-golden-fixture.test-helper.ts'

function execute(
  state: GameState,
  actorId: PlayerId,
  command: Parameters<typeof executeRobberWorkflowCommand>[1]['command'],
): GameState {
  const result = executeRobberWorkflowCommand(state, {
    commandId: `command:invariant:${state.stateVersion}` as CommandId,
    actorId,
    expectedStateVersion: state.stateVersion,
    command,
  })
  if (!result.ok) throw new Error(`Invariant fixture failed: ${result.violation.code}.`)
  return result.state
}

function discardStateAfterHuman(): GameState {
  return execute(createBalancedDiscardState(), GOLDEN_PLAYER_IDS.human, {
    type: 'DISCARD_RESOURCES',
    resources: { LUMBER: 0, BRICK: 4, WOOL: 0, GRAIN: 0, ORE: 0 },
  })
}

function goldenMoveState(): GameState {
  let state = discardStateAfterHuman()
  state = execute(state, GOLDEN_PLAYER_IDS.builder, {
    type: 'DISCARD_RESOURCES',
    resources: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 6, ORE: 0 },
  })
  return execute(state, GOLDEN_PLAYER_IDS.sentinel, {
    type: 'DISCARD_RESOURCES',
    resources: { LUMBER: 4, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
  })
}

function goldenTargetState(): GameState {
  return execute(goldenMoveState(), GOLDEN_PLAYER_IDS.sentinel, {
    type: 'MOVE_ROBBER',
    tileId: 'tile:0,-2' as TileId,
  })
}

describe('robber workflow invariants', () => {
  it('accepts coherent discard, move, target, and resolved-seven states without mutation', () => {
    const target = goldenTargetState()
    const resolved = execute(target, GOLDEN_PLAYER_IDS.sentinel, {
      type: 'STEAL_FROM_PLAYER',
      targetPlayerId: GOLDEN_PLAYER_IDS.builder,
    })
    for (const state of [
      createBalancedDiscardState(),
      discardStateAfterHuman(),
      goldenMoveState(),
      target,
      resolved,
    ]) {
      const snapshot = structuredClone(state)
      expect(() => assertRobberWorkflowState(state)).not.toThrow()
      expect(state).toEqual(snapshot)
    }
    expect(resolved.turn.phase).toBe('ACTION')
    expect(resolved.turn.lastRoll?.total).toBe(7)
    expect(resolved.pendingDecision).toBeNull()
  })

  it('rejects resource-count and conservation corruption', () => {
    const state = createBalancedDiscardState()
    expect(() => assertRobberWorkflowState({
      ...state,
      bank: { ...state.bank, resources: { ...state.bank.resources, ORE: 18 } },
    })).toThrow(/total must equal 19/)
    expect(() => assertRobberWorkflowState({
      ...state,
      players: {
        ...state.players,
        [GOLDEN_PLAYER_IDS.human]: {
          ...state.players[GOLDEN_PLAYER_IDS.human] as NonNullable<typeof state.players[typeof GOLDEN_PLAYER_IDS.human]>,
          resources: { ...state.players[GOLDEN_PLAYER_IDS.human]?.resources as NonNullable<typeof state.players[typeof GOLDEN_PLAYER_IDS.human]>['resources'], BRICK: Number.MAX_SAFE_INTEGER + 1 },
        },
      },
    })).toThrow(/safe integer/)
  })

  it('rejects corrupt discard trigger, requirements, completion membership, ordering, and terminal state', () => {
    const state = createBalancedDiscardState()
    const pending = state.pendingDecision
    if (pending?.type !== 'DISCARD_RESOURCES') throw new Error('Missing discard invariant fixture.')
    expect(() => assertRobberWorkflowState({
      ...state,
      pendingDecision: { ...pending, triggeringPlayerId: GOLDEN_PLAYER_IDS.human },
    })).toThrow(/trigger/)
    expect(() => assertRobberWorkflowState({
      ...state,
      pendingDecision: {
        ...pending,
        requiredCountByPlayer: { ...pending.requiredCountByPlayer, ['player:unknown' as PlayerId]: 1 },
      },
    })).toThrow(/unknown player/)
    expect(() => assertRobberWorkflowState({
      ...state,
      pendingDecision: {
        ...pending,
        requiredCountByPlayer: { ...pending.requiredCountByPlayer, [GOLDEN_PLAYER_IDS.human]: 0 },
      },
    })).toThrow(/positive safe integer/)
    expect(() => assertRobberWorkflowState({
      ...state,
      pendingDecision: { ...pending, completedPlayerIds: [GOLDEN_PLAYER_IDS.merchant] },
    })).toThrow(/no requirement/)
    expect(() => assertRobberWorkflowState({
      ...discardStateAfterHuman(),
      pendingDecision: {
        ...discardStateAfterHuman().pendingDecision as Extract<NonNullable<GameState['pendingDecision']>, { type: 'DISCARD_RESOURCES' }>,
        completedPlayerIds: [GOLDEN_PLAYER_IDS.builder, GOLDEN_PLAYER_IDS.human],
      },
    })).toThrow(/canonical/)
    expect(() => assertRobberWorkflowState({
      ...state,
      pendingDecision: {
        ...pending,
        completedPlayerIds: [
          GOLDEN_PLAYER_IDS.sentinel,
          GOLDEN_PLAYER_IDS.human,
          GOLDEN_PLAYER_IDS.builder,
        ],
      },
    })).toThrow(/cannot persist/)
  })

  it('rejects incoherent move actors, dice-seven rolls, and Knight causes', () => {
    const state = createNoDiscardRobberMoveState()
    const pending = state.pendingDecision
    if (pending?.type !== 'MOVE_ROBBER') throw new Error('Missing move invariant fixture.')
    expect(() => assertRobberWorkflowState({
      ...state,
      pendingDecision: { ...pending, actingPlayerId: GOLDEN_PLAYER_IDS.human },
    })).toThrow(/acting player/)
    expect(() => assertRobberWorkflowState({
      ...state,
      turn: { ...state.turn, lastRoll: { dice: [3, 2], total: 5 } },
    })).toThrow(/total-seven/)
    expect(() => assertRobberWorkflowState({
      ...state,
      turn: { ...state.turn, lastRoll: null },
      pendingDecision: {
        ...pending,
        cause: { type: 'KNIGHT', cardId: '' as DevelopmentCardId },
      },
    })).toThrow(/card ID/)
  })

  it('rejects selected-tile and every authoritative target-list corruption', () => {
    const state = goldenTargetState()
    const pending = state.pendingDecision
    if (pending?.type !== 'CHOOSE_ROBBER_TARGET') throw new Error('Missing target invariant fixture.')
    const corruptions: readonly GameState[] = [
      {
        ...state,
        pendingDecision: { ...pending, selectedTileId: 'tile:1,-2' as TileId },
      },
      {
        ...state,
        pendingDecision: { ...pending, eligibleTargetPlayerIds: [] },
      },
      {
        ...state,
        pendingDecision: {
          ...pending,
          eligibleTargetPlayerIds: [GOLDEN_PLAYER_IDS.builder, GOLDEN_PLAYER_IDS.merchant],
        },
      },
      {
        ...state,
        pendingDecision: {
          ...pending,
          eligibleTargetPlayerIds: [GOLDEN_PLAYER_IDS.merchant, GOLDEN_PLAYER_IDS.merchant],
        },
      },
      {
        ...state,
        pendingDecision: {
          ...pending,
          eligibleTargetPlayerIds: [GOLDEN_PLAYER_IDS.sentinel, GOLDEN_PLAYER_IDS.builder],
        },
      },
      {
        ...state,
        pendingDecision: {
          ...pending,
          eligibleTargetPlayerIds: ['player:unknown' as PlayerId, GOLDEN_PLAYER_IDS.builder],
        },
      },
    ]
    for (const corrupted of corruptions) {
      expect(() => assertRobberWorkflowState(corrupted)).toThrow(/target|unknown/)
    }

    const zeroBuilder: GameState = {
      ...state,
      players: {
        ...state.players,
        [GOLDEN_PLAYER_IDS.builder]: {
          ...state.players[GOLDEN_PLAYER_IDS.builder] as NonNullable<typeof state.players[typeof GOLDEN_PLAYER_IDS.builder]>,
          resources: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
        },
      },
      bank: {
        ...state.bank,
        resources: { ...state.bank.resources, GRAIN: state.bank.resources.GRAIN + 6 },
      },
    }
    expect(() => assertRobberWorkflowState(zeroBuilder)).toThrow(/target list/)
  })

  it('rejects a robber tile absent from topology', () => {
    const state = createNoDiscardRobberMoveState()
    expect(() => assertRobberWorkflowState({
      ...state,
      board: { ...state.board, robberTileId: 'tile:unknown' as TileId },
    })).toThrow(/robber tile/)
  })
})
