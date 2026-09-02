import { expectTypeOf } from 'vitest'
import type { CommandEnvelope, GameCommand } from '../contracts/commands.ts'
import type { GameEvent } from '../contracts/events.ts'
import type { GameState } from '../model/game-state.ts'
import type { CommandId, EdgeId, PlayerId, VertexId } from '../model/ids.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import { executeNormalTurnLifecycleCommand } from './normal-turn-lifecycle-engine.ts'
import {
  executePaidBuildingCommand,
} from './paid-building-engine.ts'
import type {
  PaidBuildingCommand,
  PaidBuildingCommandEnvelope,
} from './paid-building-engine.ts'
import { GOLDEN_PLAYER_IDS } from './task-05-golden-fixture.test-helper.ts'
import {
  createGoldenPaidBuildingStart,
  createResolvedSevenPaidBuildingStart,
} from './task-08-paid-building.test-helper.ts'
import { derivePlayerPieceCounts } from '../rules/player-piece-counts.ts'

const FIRST_EDGE = 'edge:vertex:-1,-1,2|vertex:1,-2,1' as EdgeId
const SECOND_EDGE = 'edge:vertex:1,-2,1|vertex:2,-1,-1' as EdgeId
const THIRD_EDGE = 'edge:vertex:2,-1,-1|vertex:4,-2,-2' as EdgeId
const TARGET_VERTEX = 'vertex:2,-1,-1' as VertexId

function envelope(
  state: GameState,
  actorId: PlayerId,
  command: PaidBuildingCommand,
): PaidBuildingCommandEnvelope {
  return {
    commandId: `command:task-08:${state.stateVersion}:${command.type}` as CommandId,
    actorId,
    expectedStateVersion: state.stateVersion,
    command,
  }
}

function executeSuccess(
  state: GameState,
  command: PaidBuildingCommand,
): { readonly state: GameState; readonly events: readonly GameEvent[] } {
  const result = executePaidBuildingCommand(
    state,
    envelope(state, GOLDEN_PLAYER_IDS.sentinel, command),
  )
  if (!result.ok) throw new Error(`Paid-building fixture failed: ${result.violation.code}.`)
  return result
}

function violationCode(
  state: GameState,
  actorId: PlayerId,
  command: PaidBuildingCommand,
): string | null {
  const result = executePaidBuildingCommand(state, envelope(state, actorId, command))
  return result.ok ? null : result.violation.code
}

function withRoads(
  state: GameState,
  roads: readonly (readonly [EdgeId, PlayerId])[],
): GameState {
  return {
    ...state,
    board: {
      ...state.board,
      edgeOccupancy: {
        ...state.board.edgeOccupancy,
        ...Object.fromEntries(roads.map(([edgeId, ownerId]) => [edgeId, { ownerId }])),
      },
    },
  }
}

describe('paid-building engine public boundary', () => {
  it('exports exactly the three accepted paid command types', () => {
    expectTypeOf<PaidBuildingCommand>().toEqualTypeOf<Extract<
      GameCommand,
      | { readonly type: 'BUILD_ROAD' }
      | { readonly type: 'BUILD_SETTLEMENT' }
      | { readonly type: 'UPGRADE_CITY' }
    >>()
    expectTypeOf<PaidBuildingCommandEnvelope>().toEqualTypeOf<
      Omit<CommandEnvelope, 'command'> & { readonly command: PaidBuildingCommand }
    >()
  })
})

describe('paid-building engine', () => {
  it('executes the exact four-command golden combined-action replay', () => {
    const start = createGoldenPaidBuildingStart()
    expect(start).toMatchObject({
      stateVersion: 17,
      turn: {
        turnNumber: 1,
        currentPlayerId: GOLDEN_PLAYER_IDS.sentinel,
        phase: 'ACTION',
        lastRoll: { dice: [3, 2], total: 5 },
      },
      pendingDecision: null,
      winnerId: null,
      random: { state: 1264537981, drawCount: 86 },
    })
    expect(start.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({
      LUMBER: 3, BRICK: 3, WOOL: 1, GRAIN: 3, ORE: 3,
    })
    expect(start.bank.resources).toEqual({ LUMBER: 16, BRICK: 11, WOOL: 17, GRAIN: 14, ORE: 16 })
    const unchanged = {
      random: start.random,
      turn: start.turn,
      deck: start.bank.developmentDeck,
      topology: start.board.topology,
      contents: start.board.tileContents,
      robber: start.board.robberTileId,
      awards: start.awards,
      order: start.playerOrder,
    }
    const events: GameEvent[] = []

    let result = executeSuccess(start, { type: 'BUILD_ROAD', edgeId: FIRST_EDGE })
    let state = result.state
    events.push(...result.events)
    expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({ LUMBER: 2, BRICK: 2, WOOL: 1, GRAIN: 3, ORE: 3 })
    expect(state.bank.resources).toEqual({ LUMBER: 17, BRICK: 12, WOOL: 17, GRAIN: 14, ORE: 16 })

    result = executeSuccess(state, { type: 'BUILD_ROAD', edgeId: SECOND_EDGE })
    state = result.state
    events.push(...result.events)
    expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({ LUMBER: 1, BRICK: 1, WOOL: 1, GRAIN: 3, ORE: 3 })
    expect(state.bank.resources).toEqual({ LUMBER: 18, BRICK: 13, WOOL: 17, GRAIN: 14, ORE: 16 })

    result = executeSuccess(state, { type: 'BUILD_SETTLEMENT', vertexId: TARGET_VERTEX })
    state = result.state
    events.push(...result.events)
    expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({ LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 2, ORE: 3 })
    expect(state.bank.resources).toEqual({ LUMBER: 19, BRICK: 14, WOOL: 18, GRAIN: 15, ORE: 16 })

    result = executeSuccess(state, { type: 'UPGRADE_CITY', vertexId: TARGET_VERTEX })
    state = result.state
    events.push(...result.events)
    expect(state).toMatchObject({
      stateVersion: 21,
      turn: {
        turnNumber: 1,
        currentPlayerId: GOLDEN_PLAYER_IDS.sentinel,
        phase: 'ACTION',
        lastRoll: { dice: [3, 2], total: 5 },
      },
      pendingDecision: null,
      winnerId: null,
      random: { state: 1264537981, drawCount: 86 },
    })
    expect(state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({ LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 })
    expect(state.bank.resources).toEqual({ LUMBER: 19, BRICK: 14, WOOL: 18, GRAIN: 17, ORE: 19 })
    expect(state.board.edgeOccupancy[FIRST_EDGE]).toEqual({ ownerId: GOLDEN_PLAYER_IDS.sentinel })
    expect(state.board.edgeOccupancy[SECOND_EDGE]).toEqual({ ownerId: GOLDEN_PLAYER_IDS.sentinel })
    expect(state.board.vertexOccupancy[TARGET_VERTEX]).toEqual({ type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel })
    expect(derivePlayerPieceCounts(state.board, GOLDEN_PLAYER_IDS.sentinel)).toEqual({ roads: 4, settlements: 2, cities: 1 })
    expect(events).toEqual([
      { type: 'ROAD_BUILT', ownerId: GOLDEN_PLAYER_IDS.sentinel, edgeId: FIRST_EDGE, source: 'PAID_BUILD' },
      { type: 'ROAD_BUILT', ownerId: GOLDEN_PLAYER_IDS.sentinel, edgeId: SECOND_EDGE, source: 'PAID_BUILD' },
      { type: 'SETTLEMENT_BUILT', ownerId: GOLDEN_PLAYER_IDS.sentinel, vertexId: TARGET_VERTEX, source: 'PAID_BUILD' },
      { type: 'CITY_BUILT', ownerId: GOLDEN_PLAYER_IDS.sentinel, vertexId: TARGET_VERTEX },
    ])
    expect(state.random).toBe(unchanged.random)
    expect(state.turn).toBe(unchanged.turn)
    expect(state.bank.developmentDeck).toBe(unchanged.deck)
    expect(state.board.topology).toBe(unchanged.topology)
    expect(state.board.tileContents).toBe(unchanged.contents)
    expect(state.board.robberTileId).toBe(unchanged.robber)
    expect(state.awards).toBe(unchanged.awards)
    expect(state.playerOrder).toBe(unchanged.order)
  })

  it('returns exact ROAD_BLOCKED and ROAD_NOT_CONNECTED distinctions without payment', () => {
    const start = createGoldenPaidBuildingStart()
    expect(violationCode(start, GOLDEN_PLAYER_IDS.sentinel, { type: 'BUILD_ROAD', edgeId: THIRD_EDGE })).toBe('ROAD_NOT_CONNECTED')
    const connected = withRoads(start, [
      [FIRST_EDGE, GOLDEN_PLAYER_IDS.sentinel],
      [SECOND_EDGE, GOLDEN_PLAYER_IDS.sentinel],
    ])
    const blocked: GameState = {
      ...connected,
      board: {
        ...connected.board,
        vertexOccupancy: {
          ...connected.board.vertexOccupancy,
          [TARGET_VERTEX]: { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.human },
        },
      },
    }
    const snapshot = structuredClone(blocked)
    expect(violationCode(blocked, GOLDEN_PLAYER_IDS.sentinel, { type: 'BUILD_ROAD', edgeId: THIRD_EDGE })).toBe('ROAD_BLOCKED')
    expect(blocked).toEqual(snapshot)
  })

  it('rejects unknown and occupied targets before affordability', () => {
    const base = createGoldenPaidBuildingStart()
    const sentinel = base.players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    const poor: GameState = {
      ...base,
      players: {
        ...base.players,
        [GOLDEN_PLAYER_IDS.sentinel]: {
          ...sentinel,
          resources: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
        },
      },
      bank: {
        ...base.bank,
        resources: { LUMBER: 19, BRICK: 14, WOOL: 18, GRAIN: 17, ORE: 19 },
      },
    }
    expect(violationCode(poor, GOLDEN_PLAYER_IDS.sentinel, { type: 'BUILD_ROAD', edgeId: 'edge:unknown' as EdgeId })).toBe('ILLEGAL_EDGE')
    expect(violationCode(poor, GOLDEN_PLAYER_IDS.sentinel, { type: 'BUILD_ROAD', edgeId: 'edge:vertex:-1,-1,2|vertex:-2,-2,4' as EdgeId })).toBe('ILLEGAL_EDGE')
    expect(violationCode(poor, GOLDEN_PLAYER_IDS.sentinel, { type: 'BUILD_SETTLEMENT', vertexId: 'vertex:unknown' as VertexId })).toBe('ILLEGAL_VERTEX')
    expect(violationCode(poor, GOLDEN_PLAYER_IDS.sentinel, { type: 'UPGRADE_CITY', vertexId: 'vertex:unknown' as VertexId })).toBe('ILLEGAL_VERTEX')
  })

  it('enforces settlement distance/connection and grants no starting resources', () => {
    const start = createGoldenPaidBuildingStart()
    expect(violationCode(start, GOLDEN_PLAYER_IDS.sentinel, {
      type: 'BUILD_SETTLEMENT', vertexId: 'vertex:1,-2,1' as VertexId,
    })).toBe('DISTANCE_RULE_VIOLATION')
    expect(violationCode(start, GOLDEN_PLAYER_IDS.sentinel, {
      type: 'BUILD_SETTLEMENT', vertexId: TARGET_VERTEX,
    })).toBe('ROAD_NOT_CONNECTED')

    const connected = withRoads(start, [
      [FIRST_EDGE, GOLDEN_PLAYER_IDS.sentinel],
      [SECOND_EDGE, GOLDEN_PLAYER_IDS.sentinel],
      ['edge:vertex:1,1,-2|vertex:2,-1,-1' as EdgeId, GOLDEN_PLAYER_IDS.human],
    ])
    const beforeResources = connected.players[GOLDEN_PLAYER_IDS.sentinel]?.resources
    const result = executeSuccess(connected, { type: 'BUILD_SETTLEMENT', vertexId: TARGET_VERTEX })
    expect(result.state.players[GOLDEN_PLAYER_IDS.sentinel]?.resources).toEqual({
      LUMBER: (beforeResources?.LUMBER ?? 0) - 1,
      BRICK: (beforeResources?.BRICK ?? 0) - 1,
      WOOL: (beforeResources?.WOOL ?? 0) - 1,
      GRAIN: (beforeResources?.GRAIN ?? 0) - 1,
      ORE: beforeResources?.ORE,
    })
    expect(result.events).toEqual([{
      type: 'SETTLEMENT_BUILT',
      ownerId: GOLDEN_PLAYER_IDS.sentinel,
      vertexId: TARGET_VERTEX,
      source: 'PAID_BUILD',
    }])
  })

  it('upgrades only the actor own settlement and replaces it with one city', () => {
    const start = createGoldenPaidBuildingStart()
    expect(violationCode(start, GOLDEN_PLAYER_IDS.sentinel, { type: 'UPGRADE_CITY', vertexId: TARGET_VERTEX })).toBe('ILLEGAL_VERTEX')
    expect(violationCode(start, GOLDEN_PLAYER_IDS.sentinel, { type: 'UPGRADE_CITY', vertexId: 'vertex:-1,-4,5' as VertexId })).toBe('ILLEGAL_VERTEX')
    const alreadyCity: GameState = {
      ...start,
      board: {
        ...start.board,
        vertexOccupancy: {
          ...start.board.vertexOccupancy,
          ['vertex:-1,-1,2' as VertexId]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel },
        },
      },
    }
    expect(violationCode(alreadyCity, GOLDEN_PLAYER_IDS.sentinel, {
      type: 'UPGRADE_CITY', vertexId: 'vertex:-1,-1,2' as VertexId,
    })).toBe('ILLEGAL_VERTEX')

    const result = executeSuccess(start, {
      type: 'UPGRADE_CITY', vertexId: 'vertex:-1,-1,2' as VertexId,
    })
    expect(result.state.board.vertexOccupancy['vertex:-1,-1,2' as VertexId]).toEqual({
      type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel,
    })
    expect(derivePlayerPieceCounts(result.state.board, GOLDEN_PLAYER_IDS.sentinel)).toEqual({ roads: 2, settlements: 1, cities: 1 })
  })

  it('returns INSUFFICIENT_PIECES at exactly 15 roads, 5 settlements, and 4 cities', () => {
    const base = createGoldenPaidBuildingStart()
    const extraRoadIds = (Object.keys(base.board.edgeOccupancy) as EdgeId[])
      .filter((edgeId) => edgeId !== FIRST_EDGE && base.board.edgeOccupancy[edgeId] === null)
      .slice(0, 13)
    const roadLimit = withRoads(base, extraRoadIds.map((edgeId) => [edgeId, GOLDEN_PLAYER_IDS.sentinel]))
    expect(derivePlayerPieceCounts(roadLimit.board, GOLDEN_PLAYER_IDS.sentinel).roads).toBe(15)
    expect(violationCode(roadLimit, GOLDEN_PLAYER_IDS.sentinel, { type: 'BUILD_ROAD', edgeId: FIRST_EDGE })).toBe('INSUFFICIENT_PIECES')

    const connected = withRoads(base, [
      [FIRST_EDGE, GOLDEN_PLAYER_IDS.sentinel],
      [SECOND_EDGE, GOLDEN_PLAYER_IDS.sentinel],
    ])
    const targetDefinition = connected.board.topology.vertices[TARGET_VERTEX]
    if (targetDefinition === undefined) throw new Error('Missing frozen target vertex.')
    const targetAdjacent = new Set(targetDefinition.adjacentVertexIds)
    const settlementFillers = (Object.keys(connected.board.vertexOccupancy) as VertexId[])
      .filter((vertexId) => vertexId !== TARGET_VERTEX
        && !targetAdjacent.has(vertexId)
        && connected.board.vertexOccupancy[vertexId] === null)
      .slice(0, 3)
    const settlementLimit: GameState = {
      ...connected,
      board: {
        ...connected.board,
        vertexOccupancy: {
          ...connected.board.vertexOccupancy,
          ...Object.fromEntries(settlementFillers.map((vertexId) => [
            vertexId, { type: 'SETTLEMENT', ownerId: GOLDEN_PLAYER_IDS.sentinel },
          ])),
        },
      },
    }
    expect(derivePlayerPieceCounts(settlementLimit.board, GOLDEN_PLAYER_IDS.sentinel).settlements).toBe(5)
    expect(violationCode(settlementLimit, GOLDEN_PLAYER_IDS.sentinel, {
      type: 'BUILD_SETTLEMENT', vertexId: TARGET_VERTEX,
    })).toBe('INSUFFICIENT_PIECES')

    const cityTarget = 'vertex:-1,-1,2' as VertexId
    const cityFillers = (Object.keys(base.board.vertexOccupancy) as VertexId[])
      .filter((vertexId) => vertexId !== cityTarget && base.board.vertexOccupancy[vertexId] !== null)
      .slice(0, 4)
    const cityLimit: GameState = {
      ...base,
      board: {
        ...base.board,
        vertexOccupancy: {
          ...base.board.vertexOccupancy,
          ...Object.fromEntries(cityFillers.map((vertexId) => [
            vertexId, { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.sentinel },
          ])),
        },
      },
    }
    expect(derivePlayerPieceCounts(cityLimit.board, GOLDEN_PLAYER_IDS.sentinel).cities).toBe(4)
    expect(violationCode(cityLimit, GOLDEN_PLAYER_IDS.sentinel, {
      type: 'UPGRADE_CITY', vertexId: cityTarget,
    })).toBe('INSUFFICIENT_PIECES')
  })

  it('checks affordability only after legal targets, connections, and piece supply', () => {
    const base = createGoldenPaidBuildingStart()
    const sentinel = base.players[GOLDEN_PLAYER_IDS.sentinel]
    if (sentinel === undefined) throw new Error('Missing Sentinel.')
    const poorRoad: GameState = {
      ...base,
      players: {
        ...base.players,
        [GOLDEN_PLAYER_IDS.sentinel]: {
          ...sentinel,
          resources: { ...sentinel.resources, LUMBER: 0, BRICK: 0 },
        },
      },
      bank: {
        ...base.bank,
        resources: { ...base.bank.resources, LUMBER: 19, BRICK: 14 },
      },
    }
    expect(violationCode(poorRoad, GOLDEN_PLAYER_IDS.sentinel, {
      type: 'BUILD_ROAD', edgeId: FIRST_EDGE,
    })).toBe('INSUFFICIENT_RESOURCES')

    const connected = withRoads(base, [
      [FIRST_EDGE, GOLDEN_PLAYER_IDS.sentinel],
      [SECOND_EDGE, GOLDEN_PLAYER_IDS.sentinel],
    ])
    const connectedSentinel = connected.players[GOLDEN_PLAYER_IDS.sentinel]
    if (connectedSentinel === undefined) throw new Error('Missing connected Sentinel.')
    const poorSettlement: GameState = {
      ...connected,
      players: {
        ...connected.players,
        [GOLDEN_PLAYER_IDS.sentinel]: {
          ...connectedSentinel,
          resources: { ...connectedSentinel.resources, WOOL: 0 },
        },
      },
      bank: {
        ...connected.bank,
        resources: { ...connected.bank.resources, WOOL: 18 },
      },
    }
    expect(violationCode(poorSettlement, GOLDEN_PLAYER_IDS.sentinel, {
      type: 'BUILD_SETTLEMENT', vertexId: TARGET_VERTEX,
    })).toBe('INSUFFICIENT_RESOURCES')

    const poorCity: GameState = {
      ...base,
      players: {
        ...base.players,
        [GOLDEN_PLAYER_IDS.sentinel]: {
          ...sentinel,
          resources: { ...sentinel.resources, ORE: 0 },
        },
      },
      bank: {
        ...base.bank,
        resources: { ...base.bank.resources, ORE: 19 },
      },
    }
    expect(violationCode(poorCity, GOLDEN_PLAYER_IDS.sentinel, {
      type: 'UPGRADE_CITY', vertexId: 'vertex:-1,-1,2' as VertexId,
    })).toBe('INSUFFICIENT_RESOURCES')
  })

  it('uses the exact shared validation precedence', () => {
    const state = createGoldenPaidBuildingStart()
    const corrupt: GameState = {
      ...state,
      bank: { ...state.bank, resources: { ...state.bank.resources, ORE: 18 } },
    }
    expect(() => executePaidBuildingCommand(corrupt, {
      ...envelope(state, 'player:unknown' as PlayerId, { type: 'BUILD_ROAD', edgeId: 'edge:unknown' as EdgeId }),
      expectedStateVersion: 999,
    })).toThrow(/total must equal 19/)

    const stale = executePaidBuildingCommand(state, {
      ...envelope(state, 'player:unknown' as PlayerId, { type: 'BUILD_ROAD', edgeId: 'edge:unknown' as EdgeId }),
      expectedStateVersion: 999,
    })
    expect(stale.ok ? null : stale.violation.code).toBe('STALE_STATE_VERSION')
    expect(violationCode(state, 'player:unknown' as PlayerId, { type: 'BUILD_ROAD', edgeId: 'edge:unknown' as EdgeId })).toBe('UNKNOWN_ACTOR')

    const gameOver: GameState = {
      ...state,
      turn: { ...state.turn, phase: 'GAME_OVER' },
      winnerId: GOLDEN_PLAYER_IDS.sentinel,
    }
    expect(violationCode(gameOver, GOLDEN_PLAYER_IDS.human, { type: 'BUILD_ROAD', edgeId: 'edge:unknown' as EdgeId })).toBe('GAME_OVER')

    const pendingState = createResolvedSevenPaidBuildingStart()
    const withPending: GameState = {
      ...pendingState,
      turn: { ...pendingState.turn, phase: 'ROBBER_MOVE_REQUIRED' },
      pendingDecision: {
        type: 'MOVE_ROBBER',
        actingPlayerId: GOLDEN_PLAYER_IDS.sentinel,
        cause: { type: 'DICE_SEVEN' },
      },
    }
    expect(violationCode(withPending, GOLDEN_PLAYER_IDS.human, { type: 'BUILD_ROAD', edgeId: 'edge:unknown' as EdgeId })).toBe('PENDING_DECISION_REQUIRED')
    expect(violationCode(state, GOLDEN_PLAYER_IDS.human, { type: 'BUILD_ROAD', edgeId: 'edge:unknown' as EdgeId })).toBe('NOT_YOUR_TURN')

    const wrongPhase: GameState = {
      ...state,
      turn: { ...state.turn, phase: 'ROLL_REQUIRED', lastRoll: null },
    }
    expect(violationCode(wrongPhase, GOLDEN_PLAYER_IDS.sentinel, { type: 'BUILD_ROAD', edgeId: 'edge:unknown' as EdgeId })).toBe('WRONG_PHASE')
    const freeRoadPhase: GameState = {
      ...state,
      turn: { ...state.turn, phase: 'FREE_ROAD_PLACEMENT' },
    }
    expect(violationCode(freeRoadPhase, GOLDEN_PLAYER_IDS.sentinel, { type: 'BUILD_ROAD', edgeId: FIRST_EDGE })).toBe('WRONG_PHASE')
  })

  it('leaves every failed input, version, bank, board, and RNG deeply unchanged', () => {
    const state = createGoldenPaidBuildingStart()
    const command = envelope(state, GOLDEN_PLAYER_IDS.sentinel, {
      type: 'BUILD_ROAD', edgeId: THIRD_EDGE,
    })
    const stateSnapshot = structuredClone(state)
    const commandSnapshot = structuredClone(command)
    const result = executePaidBuildingCommand(state, command)
    expect(result.ok ? null : result.violation.code).toBe('ROAD_NOT_CONNECTED')
    expect(state).toEqual(stateSnapshot)
    expect(command).toEqual(commandSnapshot)
    expect(state.stateVersion).toBe(17)
    expect(state.random).toEqual(stateSnapshot.random)
  })

  it('builds after the resolved total-seven workflow without RNG and remains end-turn compatible', () => {
    const state = createResolvedSevenPaidBuildingStart()
    expect(state).toMatchObject({
      stateVersion: 22,
      turn: {
        turnNumber: 1,
        currentPlayerId: GOLDEN_PLAYER_IDS.sentinel,
        phase: 'ACTION',
        lastRoll: { dice: [6, 1], total: 7 },
      },
      pendingDecision: null,
      random: { state: 1618009444, drawCount: 87 },
    })
    const random = state.random
    const built = executeSuccess(state, { type: 'BUILD_ROAD', edgeId: FIRST_EDGE })
    expect(built.state.stateVersion).toBe(23)
    expect(built.state.turn.phase).toBe('ACTION')
    expect(built.state.turn.lastRoll?.total).toBe(7)
    expect(built.state.random).toBe(random)
    expect(built.events).toEqual([{
      type: 'ROAD_BUILT', ownerId: GOLDEN_PLAYER_IDS.sentinel, edgeId: FIRST_EDGE, source: 'PAID_BUILD',
    }])

    const ended = executeNormalTurnLifecycleCommand(built.state, {
      commandId: 'command:task-08:end-resolved-seven' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: 23,
      command: { type: 'END_TURN' },
    })
    if (!ended.ok) throw new Error(`Resolved-seven end turn failed: ${ended.violation.code}.`)
    expect(ended.state).toMatchObject({
      stateVersion: 24,
      turn: {
        turnNumber: 2,
        currentPlayerId: GOLDEN_PLAYER_IDS.human,
        phase: 'ROLL_REQUIRED',
        lastRoll: null,
      },
      random: { state: 1618009444, drawCount: 87 },
    })
  })

  it('conserves exactly 19 cards of every resource after each successful build', () => {
    let state = createGoldenPaidBuildingStart()
    for (const command of [
      { type: 'BUILD_ROAD', edgeId: FIRST_EDGE },
      { type: 'BUILD_ROAD', edgeId: SECOND_EDGE },
      { type: 'BUILD_SETTLEMENT', vertexId: TARGET_VERTEX },
      { type: 'UPGRADE_CITY', vertexId: TARGET_VERTEX },
    ] as const satisfies readonly PaidBuildingCommand[]) {
      state = executeSuccess(state, command).state
      for (const resource of RESOURCE_TYPES) {
        const total = state.playerOrder.reduce(
          (sum, playerId) => sum + (state.players[playerId]?.resources[resource] ?? 0),
          state.bank.resources[resource],
        )
        expect(total).toBe(19)
      }
    }
  })
})
