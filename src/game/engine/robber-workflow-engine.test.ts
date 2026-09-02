import type { GameEvent } from '../contracts/events.ts'
import type { GameState } from '../model/game-state.ts'
import type { CommandId, DevelopmentCardId, PlayerId, TileId } from '../model/ids.ts'
import type { ResourceBag } from '../model/resource.ts'
import { executeNormalTurnLifecycleCommand } from './normal-turn-lifecycle-engine.ts'
import {
  executeRobberWorkflowCommand,
} from './robber-workflow-engine.ts'
import type {
  RobberWorkflowCommand,
  RobberWorkflowCommandEnvelope,
} from './robber-workflow-engine.ts'
import {
  createBalancedControlledRollInput,
  createBalancedDiscardState,
  createNoDiscardRobberMoveState,
} from './task-07-controlled-seven.test-helper.ts'
import { GOLDEN_PLAYER_IDS } from './task-05-golden-fixture.test-helper.ts'

const EMPTY_BAG: ResourceBag = { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 }

function envelope(
  state: GameState,
  actorId: PlayerId,
  command: RobberWorkflowCommand,
): RobberWorkflowCommandEnvelope {
  return {
    commandId: `command:task-07:${state.stateVersion}:${command.type}` as CommandId,
    actorId,
    expectedStateVersion: state.stateVersion,
    command,
  }
}

function executeSuccess(
  state: GameState,
  actorId: PlayerId,
  command: RobberWorkflowCommand,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const result = executeRobberWorkflowCommand(state, envelope(state, actorId, command))
  if (!result.ok) throw new Error(`Robber workflow fixture failed: ${result.violation.code}.`)
  return result
}

function discardCommand(resource: 'LUMBER' | 'BRICK' | 'GRAIN', quantity: number): RobberWorkflowCommand {
  return { type: 'DISCARD_RESOURCES', resources: { ...EMPTY_BAG, [resource]: quantity } }
}

function completeGoldenDiscards(): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  let state = createBalancedDiscardState()
  const events: GameEvent[] = []
  for (const [actorId, command] of [
    [GOLDEN_PLAYER_IDS.human, discardCommand('BRICK', 4)],
    [GOLDEN_PLAYER_IDS.builder, discardCommand('GRAIN', 6)],
    [GOLDEN_PLAYER_IDS.sentinel, discardCommand('LUMBER', 4)],
  ] as const) {
    const result = executeSuccess(state, actorId, command)
    state = result.state
    events.push(...result.events)
  }
  return { state, events }
}

function moveToMultipleTargets(): GameState {
  return executeSuccess(
    completeGoldenDiscards().state,
    GOLDEN_PLAYER_IDS.sentinel,
    { type: 'MOVE_ROBBER', tileId: 'tile:0,-2' as TileId },
  ).state
}

describe('robber workflow engine', () => {
  it('allows an affected non-current player to discard and transfers exact cards to the bank', () => {
    const state = createBalancedDiscardState()
    const random = state.random
    const result = executeSuccess(
      state,
      GOLDEN_PLAYER_IDS.human,
      discardCommand('BRICK', 4),
    )
    expect(result.state.stateVersion).toBe(18)
    expect(result.state.turn.currentPlayerId).toBe(GOLDEN_PLAYER_IDS.sentinel)
    expect(result.state.turn.phase).toBe('DISCARD_REQUIRED')
    expect(result.state.players[GOLDEN_PLAYER_IDS.human]?.resources.BRICK).toBe(5)
    expect(result.state.bank.resources.BRICK).toBe(14)
    expect(result.state.pendingDecision).toMatchObject({
      type: 'DISCARD_RESOURCES',
      completedPlayerIds: [GOLDEN_PLAYER_IDS.human],
    })
    expect(result.state.random).toBe(random)
    expect(result.events).toEqual([{
      type: 'RESOURCES_DISCARDED',
      playerId: GOLDEN_PLAYER_IDS.human,
      resources: { ...EMPTY_BAG, BRICK: 4 },
    }])
  })

  it('accepts arbitrary discard order, stores canonical completion order, and transitions after the final discard', () => {
    let state = createBalancedDiscardState()
    const human = executeSuccess(state, GOLDEN_PLAYER_IDS.human, discardCommand('BRICK', 4))
    state = human.state
    const builder = executeSuccess(state, GOLDEN_PLAYER_IDS.builder, discardCommand('GRAIN', 6))
    state = builder.state
    expect(state.pendingDecision).toMatchObject({
      type: 'DISCARD_RESOURCES',
      completedPlayerIds: [GOLDEN_PLAYER_IDS.human, GOLDEN_PLAYER_IDS.builder],
    })
    const sentinel = executeSuccess(state, GOLDEN_PLAYER_IDS.sentinel, discardCommand('LUMBER', 4))
    state = sentinel.state
    expect(state.stateVersion).toBe(20)
    expect(state.turn.phase).toBe('ROBBER_MOVE_REQUIRED')
    expect(state.pendingDecision).toEqual({
      type: 'MOVE_ROBBER',
      actingPlayerId: GOLDEN_PLAYER_IDS.sentinel,
      cause: { type: 'DICE_SEVEN' },
    })
    expect(state.random).toMatchObject({ state: 68079378, drawCount: 86 })
    expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({ ...EMPTY_BAG, LUMBER: 4 })
    expect(state.players[GOLDEN_PLAYER_IDS.human]?.resources).toEqual({ ...EMPTY_BAG, BRICK: 5 })
    expect(state.players[GOLDEN_PLAYER_IDS.merchant]?.resources).toEqual({ ...EMPTY_BAG, WOOL: 7 })
    expect(state.players[GOLDEN_PLAYER_IDS.builder]?.resources).toEqual({ ...EMPTY_BAG, GRAIN: 6 })
    expect(state.bank.resources).toEqual({ LUMBER: 15, BRICK: 14, WOOL: 12, GRAIN: 13, ORE: 19 })
  })

  it('returns INVALID_DISCARD for malformed, wrong-sized, unaffordable, non-required, and repeated submissions', () => {
    const state = createBalancedDiscardState()
    const invalidBags = [
      { ...EMPTY_BAG, BRICK: 3 },
      { ...EMPTY_BAG, BRICK: -1 },
      { ...EMPTY_BAG, BRICK: 1.5 },
      { LUMBER: 0, BRICK: 4, WOOL: 0, GRAIN: 0 },
      { ...EMPTY_BAG, BRICK: 4, GOLD: 0 },
      { ...EMPTY_BAG, BRICK: 10 },
    ]
    for (const resources of invalidBags) {
      const result = executeRobberWorkflowCommand(state, envelope(
        state,
        GOLDEN_PLAYER_IDS.human,
        { type: 'DISCARD_RESOURCES', resources: resources as unknown as ResourceBag },
      ))
      expect(result.ok ? null : result.violation.code).toBe('INVALID_DISCARD')
    }
    const merchant = executeRobberWorkflowCommand(
      state,
      envelope(state, GOLDEN_PLAYER_IDS.merchant, discardCommand('LUMBER', 0)),
    )
    expect(merchant.ok ? null : merchant.violation.code).toBe('INVALID_DISCARD')

    const afterHuman = executeSuccess(state, GOLDEN_PLAYER_IDS.human, discardCommand('BRICK', 4)).state
    const repeated = executeRobberWorkflowCommand(
      afterHuman,
      envelope(afterHuman, GOLDEN_PLAYER_IDS.human, discardCommand('BRICK', 4)),
    )
    expect(repeated.ok ? null : repeated.violation.code).toBe('INVALID_DISCARD')
  })

  it('keeps failed discard state, envelope, RNG, and version deeply unchanged', () => {
    const state = createBalancedDiscardState()
    const command = envelope(state, GOLDEN_PLAYER_IDS.human, discardCommand('BRICK', 3))
    const stateSnapshot = structuredClone(state)
    const commandSnapshot = structuredClone(command)
    const result = executeRobberWorkflowCommand(state, command)
    expect(result.ok ? null : result.violation.code).toBe('INVALID_DISCARD')
    expect(state).toEqual(stateSnapshot)
    expect(command).toEqual(commandSnapshot)
  })

  it('enforces shared precedence before command payload validation', () => {
    const state = createBalancedDiscardState()
    const corrupted = {
      ...state,
      bank: { ...state.bank, resources: { ...state.bank.resources, ORE: 18 } },
    }
    expect(() => executeRobberWorkflowCommand(
      corrupted,
      { ...envelope(state, 'player:unknown' as PlayerId, { type: 'MOVE_ROBBER', tileId: 'tile:unknown' as TileId }), expectedStateVersion: 99 },
    )).toThrow(/total must equal 19/)

    const stale = executeRobberWorkflowCommand(
      state,
      { ...envelope(state, 'player:unknown' as PlayerId, discardCommand('BRICK', 4)), expectedStateVersion: 99 },
    )
    expect(stale.ok ? null : stale.violation.code).toBe('STALE_STATE_VERSION')
    const unknown = executeRobberWorkflowCommand(
      state,
      envelope(state, 'player:unknown' as PlayerId, discardCommand('BRICK', 4)),
    )
    expect(unknown.ok ? null : unknown.violation.code).toBe('UNKNOWN_ACTOR')

    const gameOverState: GameState = {
      ...state,
      turn: { ...state.turn, phase: 'GAME_OVER' },
      pendingDecision: null,
      winnerId: GOLDEN_PLAYER_IDS.sentinel,
    }
    const gameOver = executeRobberWorkflowCommand(
      gameOverState,
      envelope(gameOverState, GOLDEN_PLAYER_IDS.sentinel, { type: 'MOVE_ROBBER', tileId: 'tile:unknown' as TileId }),
    )
    expect(gameOver.ok ? null : gameOver.violation.code).toBe('GAME_OVER')

    const pendingMismatch = executeRobberWorkflowCommand(
      state,
      envelope(state, GOLDEN_PLAYER_IDS.sentinel, { type: 'MOVE_ROBBER', tileId: 'tile:unknown' as TileId }),
    )
    expect(pendingMismatch.ok ? null : pendingMismatch.violation.code).toBe('PENDING_DECISION_REQUIRED')
    const noPending = createBalancedControlledRollInput()
    const wrongPhase = executeRobberWorkflowCommand(
      noPending,
      envelope(noPending, GOLDEN_PLAYER_IDS.sentinel, discardCommand('LUMBER', 4)),
    )
    expect(wrongPhase.ok ? null : wrongPhase.violation.code).toBe('WRONG_PHASE')
  })

  it('validates robber actor before tile and rejects current or unknown tiles', () => {
    const state = completeGoldenDiscards().state
    const wrongActor = executeRobberWorkflowCommand(
      state,
      envelope(state, GOLDEN_PLAYER_IDS.human, { type: 'MOVE_ROBBER', tileId: 'tile:unknown' as TileId }),
    )
    expect(wrongActor.ok ? null : wrongActor.violation.code).toBe('NOT_YOUR_TURN')
    for (const tileId of [state.board.robberTileId, 'tile:unknown' as TileId]) {
      const result = executeRobberWorkflowCommand(
        state,
        envelope(state, GOLDEN_PLAYER_IDS.sentinel, { type: 'MOVE_ROBBER', tileId }),
      )
      expect(result.ok ? null : result.violation.code).toBe('INVALID_ROBBER_TILE')
    }
  })

  it('moves with no target directly to ACTION without consuming RNG', () => {
    const state = createNoDiscardRobberMoveState()
    const random = state.random
    const result = executeSuccess(
      state,
      GOLDEN_PLAYER_IDS.sentinel,
      { type: 'MOVE_ROBBER', tileId: 'tile:1,-2' as TileId },
    )
    expect(result.state.turn.phase).toBe('ACTION')
    expect(result.state.pendingDecision).toBeNull()
    expect(result.state.board.robberTileId).toBe('tile:1,-2')
    expect(result.state.random).toBe(random)
    expect(result.events).toEqual([{
      type: 'ROBBER_MOVED',
      playerId: GOLDEN_PLAYER_IDS.sentinel,
      fromTileId: 'tile:2,0',
      toTileId: 'tile:1,-2',
      cause: { type: 'DICE_SEVEN' },
    }])
  })

  it('requires explicit theft for one target and preserves RNG during movement', () => {
    const state = createNoDiscardRobberMoveState()
    const result = executeSuccess(
      state,
      GOLDEN_PLAYER_IDS.sentinel,
      { type: 'MOVE_ROBBER', tileId: 'tile:-2,2' as TileId },
    )
    expect(result.state.turn.phase).toBe('ROBBER_TARGET_REQUIRED')
    expect(result.state.pendingDecision).toEqual({
      type: 'CHOOSE_ROBBER_TARGET',
      actingPlayerId: GOLDEN_PLAYER_IDS.sentinel,
      selectedTileId: 'tile:-2,2',
      eligibleTargetPlayerIds: [GOLDEN_PLAYER_IDS.human],
      cause: { type: 'DICE_SEVEN' },
    })
    expect(result.state.random).toBe(state.random)
    expect(result.events).toHaveLength(1)
  })

  it('derives the exact Merchant/Builder target order for the golden move', () => {
    const state = completeGoldenDiscards().state
    const result = executeSuccess(
      state,
      GOLDEN_PLAYER_IDS.sentinel,
      { type: 'MOVE_ROBBER', tileId: 'tile:0,-2' as TileId },
    )
    expect(result.state.stateVersion).toBe(21)
    expect(result.state.turn.phase).toBe('ROBBER_TARGET_REQUIRED')
    expect(result.state.pendingDecision).toMatchObject({
      type: 'CHOOSE_ROBBER_TARGET',
      eligibleTargetPlayerIds: [GOLDEN_PLAYER_IDS.merchant, GOLDEN_PLAYER_IDS.builder],
    })
    expect(result.state.random).toMatchObject({ state: 68079378, drawCount: 86 })
  })

  it('rejects invalid targets without consuming randomness', () => {
    const state = moveToMultipleTargets()
    const snapshot = structuredClone(state)
    for (const targetPlayerId of [
      GOLDEN_PLAYER_IDS.sentinel,
      GOLDEN_PLAYER_IDS.human,
      'player:unknown' as PlayerId,
    ]) {
      const result = executeRobberWorkflowCommand(
        state,
        envelope(state, GOLDEN_PLAYER_IDS.sentinel, { type: 'STEAL_FROM_PLAYER', targetPlayerId }),
      )
      expect(result.ok ? null : result.violation.code).toBe('INVALID_ROBBER_TARGET')
    }
    expect(state).toEqual(snapshot)
  })

  it('steals exactly one uniformly selected card and resumes ACTION', () => {
    const state = moveToMultipleTargets()
    const bank = state.bank
    const result = executeSuccess(
      state,
      GOLDEN_PLAYER_IDS.sentinel,
      { type: 'STEAL_FROM_PLAYER', targetPlayerId: GOLDEN_PLAYER_IDS.builder },
    )
    expect(result.state.stateVersion).toBe(22)
    expect(result.state.turn.phase).toBe('ACTION')
    expect(result.state.turn.lastRoll).toEqual({ dice: [6, 1], total: 7 })
    expect(result.state.pendingDecision).toBeNull()
    expect(result.state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({ ...EMPTY_BAG, LUMBER: 4, GRAIN: 1 })
    expect(result.state.players[GOLDEN_PLAYER_IDS.builder]?.resources).toEqual({ ...EMPTY_BAG, GRAIN: 5 })
    expect(result.state.bank).toBe(bank)
    expect(result.state.random).toMatchObject({ state: 1618009444, drawCount: 87 })
    expect(result.events).toEqual([{
      type: 'RESOURCE_STOLEN',
      fromPlayerId: GOLDEN_PLAYER_IDS.builder,
      toPlayerId: GOLDEN_PLAYER_IDS.sentinel,
      resource: 'GRAIN',
    }])
  })

  it('resumes synthetic Knight workflows according to whether dice were already rolled', () => {
    const base = createNoDiscardRobberMoveState()
    for (const [lastRoll, expectedPhase] of [
      [null, 'ROLL_REQUIRED'],
      [{ dice: [3, 2] as const, total: 5 as const }, 'ACTION'],
    ] as const) {
      const knight: GameState = {
        ...base,
        turn: { ...base.turn, lastRoll },
        pendingDecision: {
          type: 'MOVE_ROBBER',
          actingPlayerId: GOLDEN_PLAYER_IDS.sentinel,
          cause: {
            type: 'KNIGHT',
            cardId: 'development-card:knight:test' as DevelopmentCardId,
          },
        },
      }
      const result = executeSuccess(
        knight,
        GOLDEN_PLAYER_IDS.sentinel,
        { type: 'MOVE_ROBBER', tileId: 'tile:1,-2' as TileId },
      )
      expect(result.state.turn.phase).toBe(expectedPhase)
    }
  })

  it('allows accepted END_TURN after a resolved seven without another RNG draw', () => {
    const resolved = executeSuccess(
      moveToMultipleTargets(),
      GOLDEN_PLAYER_IDS.sentinel,
      { type: 'STEAL_FROM_PLAYER', targetPlayerId: GOLDEN_PLAYER_IDS.builder },
    ).state
    const random = resolved.random
    const result = executeNormalTurnLifecycleCommand(resolved, {
      commandId: 'command:task-07:end-turn' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: 22,
      command: { type: 'END_TURN' },
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.stateVersion).toBe(23)
    expect(result.state.turn).toEqual({
      turnNumber: 2,
      currentPlayerId: GOLDEN_PLAYER_IDS.human,
      phase: 'ROLL_REQUIRED',
      setup: null,
      lastRoll: null,
      developmentCardPlayedThisTurn: false,
    })
    expect(result.state.random).toBe(random)
  })

  it('matches the exact six-command controlled workflow and all final anchors', () => {
    const rollInput = createBalancedControlledRollInput()
    const preserved = {
      board: structuredClone(rollInput.board),
      deck: structuredClone(rollInput.bank.developmentDeck),
      awards: structuredClone(rollInput.awards),
      order: structuredClone(rollInput.playerOrder),
      identities: Object.fromEntries(Object.values(rollInput.players).map((player) => [player.id, {
        id: player.id,
        name: player.name,
        color: player.color,
        controller: player.controller,
        developmentCards: player.developmentCards,
        playedKnights: player.playedKnights,
      }])),
    }
    const roll = executeNormalTurnLifecycleCommand(rollInput, {
      commandId: 'command:task-07:golden-roll' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: 16,
      command: { type: 'ROLL_DICE' },
    })
    if (!roll.ok) throw new Error(`Golden roll failed: ${roll.violation.code}.`)
    let state = roll.state
    const events: GameEvent[] = [...roll.events]
    for (const [actorId, command] of [
      [GOLDEN_PLAYER_IDS.human, discardCommand('BRICK', 4)],
      [GOLDEN_PLAYER_IDS.builder, discardCommand('GRAIN', 6)],
      [GOLDEN_PLAYER_IDS.sentinel, discardCommand('LUMBER', 4)],
      [GOLDEN_PLAYER_IDS.sentinel, { type: 'MOVE_ROBBER', tileId: 'tile:0,-2' as TileId }],
      [GOLDEN_PLAYER_IDS.sentinel, { type: 'STEAL_FROM_PLAYER', targetPlayerId: GOLDEN_PLAYER_IDS.builder }],
    ] as const) {
      const result = executeSuccess(state, actorId, command)
      state = result.state
      events.push(...result.events)
    }

    expect(state.stateVersion).toBe(22)
    expect(state.turn).toEqual({
      turnNumber: 1,
      currentPlayerId: GOLDEN_PLAYER_IDS.sentinel,
      phase: 'ACTION',
      setup: null,
      lastRoll: { dice: [6, 1], total: 7 },
      developmentCardPlayedThisTurn: false,
    })
    expect(state.pendingDecision).toBeNull()
    expect(state.board.robberTileId).toBe('tile:0,-2')
    expect(state.random).toMatchObject({ state: 1618009444, drawCount: 87 })
    expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({ ...EMPTY_BAG, LUMBER: 4, GRAIN: 1 })
    expect(state.players[GOLDEN_PLAYER_IDS.human]?.resources).toEqual({ ...EMPTY_BAG, BRICK: 5 })
    expect(state.players[GOLDEN_PLAYER_IDS.merchant]?.resources).toEqual({ ...EMPTY_BAG, WOOL: 7 })
    expect(state.players[GOLDEN_PLAYER_IDS.builder]?.resources).toEqual({ ...EMPTY_BAG, GRAIN: 5 })
    expect(state.bank.resources).toEqual({ LUMBER: 15, BRICK: 14, WOOL: 12, GRAIN: 13, ORE: 19 })
    expect(events.reduce<Record<string, number>>((counts, event) => ({
      ...counts,
      [event.type]: (counts[event.type] ?? 0) + 1,
    }), {})).toEqual({
      DICE_ROLLED: 1,
      RESOURCES_DISCARDED: 3,
      ROBBER_MOVED: 1,
      RESOURCE_STOLEN: 1,
    })
    expect(events).toHaveLength(6)
    expect({ ...state.board, robberTileId: preserved.board.robberTileId }).toEqual(preserved.board)
    expect(state.bank.developmentDeck).toEqual(preserved.deck)
    expect(state.awards).toEqual(preserved.awards)
    expect(state.playerOrder).toEqual(preserved.order)
    expect(Object.fromEntries(Object.values(state.players).map((player) => [player.id, {
      id: player.id,
      name: player.name,
      color: player.color,
      controller: player.controller,
      developmentCards: player.developmentCards,
      playedKnights: player.playedKnights,
    }]))).toEqual(preserved.identities)
  })
})
