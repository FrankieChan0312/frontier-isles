import type { GameEvent } from '../contracts/events.ts'
import type { GameState } from '../model/game-state.ts'
import type { CommandId, DevelopmentCardId, PlayerId, TileId } from '../model/ids.ts'
import type { ResourceBag } from '../model/resource.ts'
import { nextRandomUint32 } from '../random/seeded-random.ts'
import {
  executeNormalTurnLifecycleCommand,
} from './normal-turn-lifecycle-engine.ts'
import type {
  NormalTurnLifecycleCommand,
  NormalTurnLifecycleCommandEnvelope,
} from './normal-turn-lifecycle-engine.ts'
import {
  createCompletedGoldenSetup,
  GOLDEN_PLAYER_IDS,
} from './task-05-golden-fixture.test-helper.ts'

function envelope(
  actorId: PlayerId,
  expectedStateVersion: number,
  command: NormalTurnLifecycleCommand,
): NormalTurnLifecycleCommandEnvelope {
  return {
    commandId: `command:lifecycle:${expectedStateVersion}:${command.type}` as CommandId,
    actorId,
    expectedStateVersion,
    command,
  }
}

function executeSuccess(
  state: GameState,
  actorId: PlayerId,
  command: NormalTurnLifecycleCommand,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const result = executeNormalTurnLifecycleCommand(
    state,
    envelope(actorId, state.stateVersion, command),
  )
  if (!result.ok) throw new Error(`Lifecycle fixture failed: ${result.violation.code}.`)
  return result
}

function controlledSevenState(): GameState {
  const state = createCompletedGoldenSetup()
  return {
    ...state,
    random: { ...state.random, state: 259, drawCount: 84 },
  }
}

describe('normal-turn lifecycle engine', () => {
  it('rolls a non-seven, produces atomically, enters ACTION, and preserves the development flag', () => {
    const start = createCompletedGoldenSetup()
    const state: GameState = {
      ...start,
      turn: { ...start.turn, developmentCardPlayedThisTurn: true },
    }
    const result = executeSuccess(state, GOLDEN_PLAYER_IDS.sentinel, { type: 'ROLL_DICE' })
    expect(result.state.stateVersion).toBe(17)
    expect(result.state.turn).toEqual({
      turnNumber: 1,
      currentPlayerId: GOLDEN_PLAYER_IDS.sentinel,
      phase: 'ACTION',
      setup: null,
      lastRoll: { dice: [3, 2], total: 5 },
      developmentCardPlayedThisTurn: true,
    })
    expect(result.state.random).toMatchObject({ state: 1264537981, drawCount: 86 })
    expect(result.events).toEqual([
      { type: 'DICE_ROLLED', playerId: GOLDEN_PLAYER_IDS.sentinel, roll: { dice: [3, 2], total: 5 } },
      { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.builder, tileId: 'tile:-1,-1', resource: 'BRICK', quantity: 1 },
    ])
  })

  it('enters robber movement after seven when nobody must discard', () => {
    const state = controlledSevenState()
    const before = {
      players: structuredClone(state.players),
      bank: structuredClone(state.bank),
      board: structuredClone(state.board),
    }
    const result = executeSuccess(state, GOLDEN_PLAYER_IDS.sentinel, { type: 'ROLL_DICE' })
    expect(result.state.stateVersion).toBe(17)
    expect(result.state.turn).toMatchObject({
      turnNumber: 1,
      currentPlayerId: GOLDEN_PLAYER_IDS.sentinel,
      phase: 'ROBBER_MOVE_REQUIRED',
      lastRoll: { dice: [6, 1], total: 7 },
    })
    expect(result.state.pendingDecision).toEqual({
      type: 'MOVE_ROBBER',
      actingPlayerId: GOLDEN_PLAYER_IDS.sentinel,
      cause: { type: 'DICE_SEVEN' },
    })
    expect(result.state.random).toMatchObject({ state: 68079378, drawCount: 86 })
    expect(result.events).toEqual([{
      type: 'DICE_ROLLED',
      playerId: GOLDEN_PLAYER_IDS.sentinel,
      roll: { dice: [6, 1], total: 7 },
    }])
    expect(result.state.players).toEqual(before.players)
    expect(result.state.bank).toEqual(before.bank)
    expect(result.state.board).toEqual(before.board)
  })

  it('enters deterministic discard state for the frozen 8/9/7/12 hands without transfer', () => {
    const state = controlledSevenState()
    const hands: Readonly<Record<PlayerId, ResourceBag>> = {
      [GOLDEN_PLAYER_IDS.sentinel]: { LUMBER: 8, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
      [GOLDEN_PLAYER_IDS.human]: { LUMBER: 0, BRICK: 9, WOOL: 0, GRAIN: 0, ORE: 0 },
      [GOLDEN_PLAYER_IDS.merchant]: { LUMBER: 0, BRICK: 0, WOOL: 7, GRAIN: 0, ORE: 0 },
      [GOLDEN_PLAYER_IDS.builder]: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 12, ORE: 0 },
    }
    const players = Object.fromEntries(state.playerOrder.map((playerId) => {
      const player = state.players[playerId]
      if (player === undefined) throw new Error(`Missing player ${playerId}.`)
      return [playerId, { ...player, resources: hands[playerId] }]
    })) as GameState['players']
    const fixture: GameState = {
      ...state,
      players,
      bank: {
        ...state.bank,
        resources: { LUMBER: 11, BRICK: 10, WOOL: 12, GRAIN: 7, ORE: 19 },
      },
    }
    const snapshot = structuredClone({ players: fixture.players, bank: fixture.bank })
    const result = executeSuccess(fixture, GOLDEN_PLAYER_IDS.sentinel, { type: 'ROLL_DICE' })
    expect(result.state.turn.phase).toBe('DISCARD_REQUIRED')
    expect(result.state.pendingDecision).toEqual({
      type: 'DISCARD_RESOURCES',
      triggeringPlayerId: GOLDEN_PLAYER_IDS.sentinel,
      requiredCountByPlayer: {
        [GOLDEN_PLAYER_IDS.sentinel]: 4,
        [GOLDEN_PLAYER_IDS.human]: 4,
        [GOLDEN_PLAYER_IDS.builder]: 6,
      },
      completedPlayerIds: [],
    })
    expect(result.state.players).toEqual(snapshot.players)
    expect(result.state.bank).toEqual(snapshot.bank)
    expect(result.events).toHaveLength(1)
    expect(result.events[0]?.type).toBe('DICE_ROLLED')
  })

  it('ends a turn clockwise with exact events, resets turn-local fields, and consumes no RNG', () => {
    const start = createCompletedGoldenSetup()
    const rolled = executeSuccess(start, GOLDEN_PLAYER_IDS.sentinel, { type: 'ROLL_DICE' }).state
    const random = rolled.random
    const result = executeSuccess(rolled, GOLDEN_PLAYER_IDS.sentinel, { type: 'END_TURN' })
    expect(result.state.stateVersion).toBe(18)
    expect(result.state.turn).toEqual({
      turnNumber: 2,
      currentPlayerId: GOLDEN_PLAYER_IDS.human,
      phase: 'ROLL_REQUIRED',
      setup: null,
      lastRoll: null,
      developmentCardPlayedThisTurn: false,
    })
    expect(result.state.random).toBe(random)
    expect(result.events).toEqual([
      { type: 'TURN_ENDED', playerId: GOLDEN_PLAYER_IDS.sentinel, turnNumber: 1 },
      { type: 'TURN_STARTED', playerId: GOLDEN_PLAYER_IDS.human, turnNumber: 2 },
    ])
  })

  it('wraps Builder to Sentinel and increments the global turn number', () => {
    const start = createCompletedGoldenSetup()
    const action: GameState = {
      ...start,
      stateVersion: 23,
      turn: {
        turnNumber: 4,
        currentPlayerId: GOLDEN_PLAYER_IDS.builder,
        phase: 'ACTION',
        setup: null,
        lastRoll: { dice: [3, 2], total: 5 },
        developmentCardPlayedThisTurn: true,
      },
    }
    const result = executeSuccess(action, GOLDEN_PLAYER_IDS.builder, { type: 'END_TURN' })
    expect(result.state.turn).toEqual({
      turnNumber: 5,
      currentPlayerId: GOLDEN_PLAYER_IDS.sentinel,
      phase: 'ROLL_REQUIRED',
      setup: null,
      lastRoll: null,
      developmentCardPlayedThisTurn: false,
    })
  })

  it('applies frozen validation precedence and leaves failed inputs deeply unchanged', () => {
    const state = createCompletedGoldenSetup()
    const command = envelope('player:unknown' as PlayerId, 99, { type: 'ROLL_DICE' })
    const stateSnapshot = structuredClone(state)
    const commandSnapshot = structuredClone(command)
    const stale = executeNormalTurnLifecycleCommand(state, command)
    expect(stale.ok ? null : stale.violation.code).toBe('STALE_STATE_VERSION')

    const unknown = executeNormalTurnLifecycleCommand(
      state,
      envelope('player:unknown' as PlayerId, 16, { type: 'ROLL_DICE' }),
    )
    expect(unknown.ok ? null : unknown.violation.code).toBe('UNKNOWN_ACTOR')

    const gameOverState: GameState = {
      ...state,
      players: {
        ...state.players,
        [GOLDEN_PLAYER_IDS.sentinel]: {
          ...state.players[GOLDEN_PLAYER_IDS.sentinel],
          developmentCards: Array.from({ length: 10 }, (_, index) => ({
            id: `development-card:test:lifecycle-winner:${index}` as DevelopmentCardId,
            type: 'VICTORY_POINT' as const,
            acquiredTurnNumber: 1,
            status: 'REVEALED' as const,
          })),
        },
      },
      turn: { ...state.turn, phase: 'GAME_OVER' },
      winnerId: GOLDEN_PLAYER_IDS.sentinel,
    }
    const gameOver = executeNormalTurnLifecycleCommand(
      gameOverState,
      envelope(GOLDEN_PLAYER_IDS.sentinel, 16, { type: 'ROLL_DICE' }),
    )
    expect(gameOver.ok ? null : gameOver.violation.code).toBe('GAME_OVER')

    const pendingState: GameState = {
      ...state,
      pendingDecision: {
        type: 'MOVE_ROBBER',
        actingPlayerId: GOLDEN_PLAYER_IDS.sentinel,
        cause: { type: 'DICE_SEVEN' },
      },
    }
    const pending = executeNormalTurnLifecycleCommand(
      pendingState,
      envelope(GOLDEN_PLAYER_IDS.sentinel, 16, { type: 'ROLL_DICE' }),
    )
    expect(pending.ok ? null : pending.violation.code).toBe('PENDING_DECISION_REQUIRED')

    const wrongActor = executeNormalTurnLifecycleCommand(
      state,
      envelope(GOLDEN_PLAYER_IDS.human, 16, { type: 'ROLL_DICE' }),
    )
    expect(wrongActor.ok ? null : wrongActor.violation.code).toBe('NOT_YOUR_TURN')
    expect(state).toEqual(stateSnapshot)
    expect(command).toEqual(commandSnapshot)
  })

  it('returns WRONG_PHASE for the opposite lifecycle command without consuming RNG', () => {
    const state = createCompletedGoldenSetup()
    const endEarly = executeNormalTurnLifecycleCommand(
      state,
      envelope(GOLDEN_PLAYER_IDS.sentinel, 16, { type: 'END_TURN' }),
    )
    expect(endEarly.ok ? null : endEarly.violation.code).toBe('WRONG_PHASE')
    const rolled = executeSuccess(state, GOLDEN_PLAYER_IDS.sentinel, { type: 'ROLL_DICE' }).state
    const random = structuredClone(rolled.random)
    const rollAgain = executeNormalTurnLifecycleCommand(
      rolled,
      envelope(GOLDEN_PLAYER_IDS.sentinel, 17, { type: 'ROLL_DICE' }),
    )
    expect(rollAgain.ok ? null : rollAgain.violation.code).toBe('WRONG_PHASE')
    expect(rolled.random).toEqual(random)
  })

  it('matches the exact eight-command golden lifecycle replay and 19-event totals', () => {
    let state = createCompletedGoldenSetup()
    const original = {
      board: structuredClone(state.board),
      deck: structuredClone(state.bank.developmentDeck),
      awards: structuredClone(state.awards),
      order: structuredClone(state.playerOrder),
      identities: Object.fromEntries(Object.values(state.players).map((player) => [player.id, {
        id: player.id,
        name: player.name,
        color: player.color,
        controller: player.controller,
        developmentCards: player.developmentCards,
        playedKnights: player.playedKnights,
      }])),
    }
    const expectedRolls = [
      { actor: GOLDEN_PLAYER_IDS.sentinel, dice: [3, 2], total: 5, raw: [3561776786, 1264537981], random: 1264537981, count: 86 },
      { actor: GOLDEN_PLAYER_IDS.human, dice: [6, 2], total: 8, raw: [2405734757, 2504974177], random: 2504974177, count: 88 },
      { actor: GOLDEN_PLAYER_IDS.merchant, dice: [5, 4], total: 9, raw: [2600066608, 2261670735], random: 2261670735, count: 90 },
      { actor: GOLDEN_PLAYER_IDS.builder, dice: [3, 2], total: 5, raw: [4183043612, 3999636151], random: 3999636151, count: 92 },
    ] as const
    const expectedProductionEvents: readonly (readonly GameEvent[])[] = [
      [
        { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.builder, tileId: 'tile:-1,-1' as TileId, resource: 'BRICK', quantity: 1 },
      ],
      [
        { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.sentinel, tileId: 'tile:-1,1' as TileId, resource: 'GRAIN', quantity: 1 },
        { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.human, tileId: 'tile:-1,1' as TileId, resource: 'GRAIN', quantity: 1 },
        { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.builder, tileId: 'tile:0,-1' as TileId, resource: 'GRAIN', quantity: 2 },
      ],
      [
        { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.sentinel, tileId: 'tile:0,0' as TileId, resource: 'ORE', quantity: 1 },
        { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.builder, tileId: 'tile:0,0' as TileId, resource: 'ORE', quantity: 1 },
      ],
      [
        { type: 'RESOURCE_PRODUCED', playerId: GOLDEN_PLAYER_IDS.builder, tileId: 'tile:-1,-1' as TileId, resource: 'BRICK', quantity: 1 },
      ],
    ]
    const allEvents: GameEvent[] = []

    for (let index = 0; index < expectedRolls.length; index += 1) {
      const expected = expectedRolls[index]
      const expectedProduction = expectedProductionEvents[index]
      if (expected === undefined || expectedProduction === undefined) {
        throw new Error(`Missing lifecycle expectation ${index}.`)
      }
      const firstRaw = nextRandomUint32(state.random)
      const secondRaw = nextRandomUint32(firstRaw.random)
      expect([firstRaw.value, secondRaw.value]).toEqual(expected.raw)
      const rollResult = executeSuccess(state, expected.actor, { type: 'ROLL_DICE' })
      state = rollResult.state
      allEvents.push(...rollResult.events)
      expect(state.turn.lastRoll).toEqual({ dice: expected.dice, total: expected.total })
      expect(state.random).toMatchObject({ state: expected.random, drawCount: expected.count })
      expect(rollResult.events).toEqual([
        { type: 'DICE_ROLLED', playerId: expected.actor, roll: { dice: expected.dice, total: expected.total } },
        ...expectedProduction,
      ])
      const endResult = executeSuccess(state, expected.actor, { type: 'END_TURN' })
      state = endResult.state
      allEvents.push(...endResult.events)
    }

    expect(state.stateVersion).toBe(24)
    expect(state.turn).toEqual({
      turnNumber: 5,
      currentPlayerId: GOLDEN_PLAYER_IDS.sentinel,
      phase: 'ROLL_REQUIRED',
      setup: null,
      lastRoll: null,
      developmentCardPlayedThisTurn: false,
    })
    expect(state.pendingDecision).toBeNull()
    expect(state.winnerId).toBeNull()
    expect(state.random).toMatchObject({ state: 3999636151, drawCount: 92 })
    expect(state.players[GOLDEN_PLAYER_IDS.human]?.resources).toEqual({ LUMBER: 0, BRICK: 1, WOOL: 1, GRAIN: 2, ORE: 0 })
    expect(state.players[GOLDEN_PLAYER_IDS.merchant]?.resources).toEqual({ LUMBER: 0, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 })
    expect(state.players[GOLDEN_PLAYER_IDS.builder]?.resources).toEqual({ LUMBER: 0, BRICK: 4, WOOL: 0, GRAIN: 3, ORE: 1 })
    expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({ LUMBER: 0, BRICK: 1, WOOL: 0, GRAIN: 1, ORE: 1 })
    expect(state.bank.resources).toEqual({ LUMBER: 19, BRICK: 12, WOOL: 18, GRAIN: 13, ORE: 17 })
    expect(allEvents.reduce<Record<string, number>>((counts, event) => ({
      ...counts,
      [event.type]: (counts[event.type] ?? 0) + 1,
    }), {})).toEqual({
      DICE_ROLLED: 4,
      RESOURCE_PRODUCED: 7,
      TURN_ENDED: 4,
      TURN_STARTED: 4,
    })
    expect(allEvents).toHaveLength(19)
    expect(state.board).toEqual(original.board)
    expect(state.bank.developmentDeck).toEqual(original.deck)
    expect(state.awards).toEqual(original.awards)
    expect(state.playerOrder).toEqual(original.order)
    expect(Object.fromEntries(Object.values(state.players).map((player) => [player.id, {
      id: player.id,
      name: player.name,
      color: player.color,
      controller: player.controller,
      developmentCards: player.developmentCards,
      playedKnights: player.playedKnights,
    }]))).toEqual(original.identities)
  })
})
