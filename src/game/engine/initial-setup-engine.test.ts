import type { InitialSetupCommand } from './initial-setup-engine.ts'
import type { GameConfig } from '../model/game-config.ts'
import type {
  AiProfileId,
  CommandId,
  EdgeId,
  GameId,
  PlayerId,
  VertexId,
} from '../model/ids.ts'
import { RULESET_ID } from '../model/ruleset.ts'
import { createGame } from './create-game.ts'
import {
  executeInitialSetupCommand,
  type InitialSetupCommandEnvelope,
} from './initial-setup-engine.ts'

const IDS = {
  sentinel: 'player:sentinel' as PlayerId,
  human: 'player:human' as PlayerId,
  merchant: 'player:merchant' as PlayerId,
  builder: 'player:builder' as PlayerId,
}

function config(): GameConfig {
  return {
    gameId: 'game:task-05' as GameId,
    rulesetId: RULESET_ID,
    players: [
      { id: IDS.human, name: 'Frankie', color: 'RED', controller: { type: 'HUMAN' } },
      { id: IDS.merchant, name: 'Merchant', color: 'BLUE', controller: { type: 'AI', profileId: 'ai:merchant' as AiProfileId } },
      { id: IDS.builder, name: 'Builder', color: 'ORANGE', controller: { type: 'AI', profileId: 'ai:builder' as AiProfileId } },
      { id: IDS.sentinel, name: 'Sentinel', color: 'WHITE', controller: { type: 'AI', profileId: 'ai:sentinel' as AiProfileId } },
    ],
  }
}

function envelope(
  actorId: PlayerId,
  expectedStateVersion: number,
  command: InitialSetupCommand,
): InitialSetupCommandEnvelope {
  return {
    commandId: `command:setup:${expectedStateVersion}` as CommandId,
    actorId,
    expectedStateVersion,
    command,
  }
}

const REPLAY: readonly [PlayerId, InitialSetupCommand][] = [
  [IDS.sentinel, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,-1,2' as VertexId }],
  [IDS.sentinel, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,-1,2|vertex:-2,-2,4' as EdgeId }],
  [IDS.human, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,-4,5' as VertexId }],
  [IDS.human, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,-4,5|vertex:-2,-2,4' as EdgeId }],
  [IDS.merchant, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,-7,8' as VertexId }],
  [IDS.merchant, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,-7,8|vertex:-2,-5,7' as EdgeId }],
  [IDS.builder, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,2,-1' as VertexId }],
  [IDS.builder, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,2,-1|vertex:-2,1,1' as EdgeId }],
  [IDS.builder, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,5,-4' as VertexId }],
  [IDS.builder, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,5,-4|vertex:-2,4,-2' as EdgeId }],
  [IDS.merchant, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,8,-7' as VertexId }],
  [IDS.merchant, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-1,8,-7|vertex:-2,7,-5' as EdgeId }],
  [IDS.human, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-4,-1,5' as VertexId }],
  [IDS.human, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-2,-2,4|vertex:-4,-1,5' as EdgeId }],
  [IDS.sentinel, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-4,-4,8' as VertexId }],
  [IDS.sentinel, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:vertex:-2,-5,7|vertex:-4,-4,8' as EdgeId }],
]

function executePrefix(count: number) {
  let state = createGame(config(), 'FRONTIER-ISLES-TASK-05')
  for (let index = 0; index < count; index += 1) {
    const step = REPLAY[index]
    if (step === undefined) throw new Error(`Missing replay step ${index}.`)
    const result = executeInitialSetupCommand(state, envelope(step[0], index, step[1]))
    if (!result.ok) throw new Error(`Replay step ${index} failed with ${result.violation.code}.`)
    state = result.state
  }
  return state
}

describe('initial setup engine', () => {
  it('places the first legal settlement without cost or road connection', () => {
    const state = createGame(config(), 'FRONTIER-ISLES-TASK-05')
    const snapshot = structuredClone(state)
    const command = REPLAY[0]
    if (command === undefined) throw new Error('Missing first replay command.')
    const result = executeInitialSetupCommand(state, envelope(command[0], 0, command[1]))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.board.vertexOccupancy['vertex:-1,-1,2' as VertexId]).toEqual({ type: 'SETTLEMENT', ownerId: IDS.sentinel })
    expect(result.state.players[IDS.sentinel]?.resources).toEqual(snapshot.players[IDS.sentinel]?.resources)
    expect(result.state.stateVersion).toBe(1)
    expect(result.state.random).toEqual(state.random)
    expect(result.events).toEqual([{ type: 'SETTLEMENT_BUILT', ownerId: IDS.sentinel, vertexId: 'vertex:-1,-1,2', source: 'INITIAL_PLACEMENT' }])
    expect(state).toEqual(snapshot)
  })

  it('rejects unknown, occupied, adjacent, and five-piece settlement targets', () => {
    const state = createGame(config(), 'FRONTIER-ISLES-TASK-05')
    const unknown = executeInitialSetupCommand(state, envelope(IDS.sentinel, 0, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:unknown' as VertexId }))
    expect(unknown.ok ? null : unknown.violation.code).toBe('ILLEGAL_VERTEX')

    const target = 'vertex:-1,-1,2' as VertexId
    const occupiedState = { ...state, board: { ...state.board, vertexOccupancy: { ...state.board.vertexOccupancy, [target]: { type: 'SETTLEMENT' as const, ownerId: IDS.human } } } }
    const occupied = executeInitialSetupCommand(occupiedState, envelope(IDS.sentinel, 0, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: target }))
    expect(occupied.ok ? null : occupied.violation.code).toBe('ILLEGAL_VERTEX')

    const adjacentId = state.board.topology.vertices[target]?.adjacentVertexIds[0]
    if (adjacentId === undefined) throw new Error('Missing adjacent test vertex.')
    const adjacentState = { ...state, board: { ...state.board, vertexOccupancy: { ...state.board.vertexOccupancy, [adjacentId]: { type: 'SETTLEMENT' as const, ownerId: IDS.human } } } }
    const adjacent = executeInitialSetupCommand(adjacentState, envelope(IDS.sentinel, 0, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: target }))
    expect(adjacent.ok ? null : adjacent.violation.code).toBe('DISTANCE_RULE_VIOLATION')

    const excluded = new Set([target, ...(state.board.topology.vertices[target]?.adjacentVertexIds ?? [])])
    const fiveIds = (Object.keys(state.board.vertexOccupancy) as VertexId[]).filter((id) => !excluded.has(id)).slice(0, 5)
    const fiveOccupancy = { ...state.board.vertexOccupancy }
    fiveIds.forEach((id) => { fiveOccupancy[id] = { type: 'SETTLEMENT', ownerId: IDS.sentinel } })
    const pieceState = { ...state, board: { ...state.board, vertexOccupancy: fiveOccupancy } }
    const pieces = executeInitialSetupCommand(pieceState, envelope(IDS.sentinel, 0, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: target }))
    expect(pieces.ok ? null : pieces.violation.code).toBe('INSUFFICIENT_PIECES')
  })

  it('enforces road phase, existence, occupancy, incidence, and finite supply', () => {
    const created = createGame(config(), 'FRONTIER-ISLES-TASK-05')
    const roadBeforeSettlement = executeInitialSetupCommand(created, envelope(IDS.sentinel, 0, REPLAY[1]?.[1] as InitialSetupCommand))
    expect(roadBeforeSettlement.ok ? null : roadBeforeSettlement.violation.code).toBe('WRONG_PHASE')
    const afterSettlement = executePrefix(1)
    const settlementDuringRoad = executeInitialSetupCommand(afterSettlement, envelope(IDS.sentinel, 1, REPLAY[0]?.[1] as InitialSetupCommand))
    expect(settlementDuringRoad.ok ? null : settlementDuringRoad.violation.code).toBe('WRONG_PHASE')

    const unknown = executeInitialSetupCommand(afterSettlement, envelope(IDS.sentinel, 1, { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:unknown' as EdgeId }))
    expect(unknown.ok ? null : unknown.violation.code).toBe('ILLEGAL_EDGE')
    const targetEdge = (REPLAY[1]?.[1] as Extract<InitialSetupCommand, { type: 'PLACE_INITIAL_ROAD' }>).edgeId
    const occupiedState = { ...afterSettlement, board: { ...afterSettlement.board, edgeOccupancy: { ...afterSettlement.board.edgeOccupancy, [targetEdge]: { ownerId: IDS.human } } } }
    const occupied = executeInitialSetupCommand(occupiedState, envelope(IDS.sentinel, 1, { type: 'PLACE_INITIAL_ROAD', edgeId: targetEdge }))
    expect(occupied.ok ? null : occupied.violation.code).toBe('ILLEGAL_EDGE')
    const pending = afterSettlement.turn.setup?.pendingSettlementVertexId
    const nonIncidentId = (Object.keys(afterSettlement.board.topology.edges) as EdgeId[]).find((id) => pending !== null && pending !== undefined && !afterSettlement.board.topology.edges[id]?.vertexIds.includes(pending))
    if (nonIncidentId === undefined) throw new Error('Missing non-incident edge.')
    const disconnected = executeInitialSetupCommand(afterSettlement, envelope(IDS.sentinel, 1, { type: 'PLACE_INITIAL_ROAD', edgeId: nonIncidentId }))
    expect(disconnected.ok ? null : disconnected.violation.code).toBe('ROAD_NOT_CONNECTED')

    const fifteen = (Object.keys(afterSettlement.board.edgeOccupancy) as EdgeId[]).filter((id) => id !== targetEdge).slice(0, 15)
    const edgeOccupancy = { ...afterSettlement.board.edgeOccupancy }
    fifteen.forEach((id) => { edgeOccupancy[id] = { ownerId: IDS.sentinel } })
    const pieceState = { ...afterSettlement, board: { ...afterSettlement.board, edgeOccupancy } }
    const pieces = executeInitialSetupCommand(pieceState, envelope(IDS.sentinel, 1, { type: 'PLACE_INITIAL_ROAD', edgeId: targetEdge }))
    expect(pieces.ok ? null : pieces.violation.code).toBe('INSUFFICIENT_PIECES')
  })

  it('places a successful road without cost, advances setup, and emits only ROAD_BUILT', () => {
    const state = executePrefix(1)
    const resources = structuredClone(state.players[IDS.sentinel]?.resources)
    const result = executeInitialSetupCommand(state, envelope(IDS.sentinel, 1, REPLAY[1]?.[1] as InitialSetupCommand))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.stateVersion).toBe(2)
    expect(result.state.random).toEqual(state.random)
    expect(result.state.players[IDS.sentinel]?.resources).toEqual(resources)
    expect(result.state.turn).toMatchObject({
      currentPlayerId: IDS.human,
      phase: 'SETUP_SETTLEMENT',
      setup: { round: 1, placementIndex: 1, pendingSettlementVertexId: null },
    })
    expect(result.events).toEqual([{
      type: 'ROAD_BUILT',
      ownerId: IDS.sentinel,
      edgeId: 'edge:vertex:-1,-1,2|vertex:-2,-2,4',
      source: 'INITIAL_PLACEMENT',
    }])
  })

  it('grants round-two resources immediately in sorted per-tile event order', () => {
    const state = executePrefix(8)
    const result = executeInitialSetupCommand(state, envelope(IDS.builder, 8, REPLAY[8]?.[1] as InitialSetupCommand))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[IDS.builder]?.resources).toEqual({ LUMBER: 0, BRICK: 2, WOOL: 0, GRAIN: 1, ORE: 0 })
    expect(result.state.bank.resources).toEqual({ LUMBER: 19, BRICK: 17, WOOL: 19, GRAIN: 18, ORE: 19 })
    expect(result.events.map((event) => event.type)).toEqual(['SETTLEMENT_BUILT', 'RESOURCE_PRODUCED', 'RESOURCE_PRODUCED', 'RESOURCE_PRODUCED'])
    expect(result.events.slice(1).map((event) => event.type === 'RESOURCE_PRODUCED' ? `${event.tileId}:${event.resource}` : '')).toEqual([
      'tile:-1,-1:BRICK', 'tile:0,-1:GRAIN', 'tile:0,-2:BRICK',
    ])
  })

  it('does not grant for desert adjacency and handles partial shortage deterministically', () => {
    const base = executePrefix(8)
    const lowBank = {
      ...base,
      bank: { ...base.bank, resources: { ...base.bank.resources, BRICK: 1, GRAIN: 0 } },
    }
    const result = executeInitialSetupCommand(lowBank, envelope(IDS.builder, 8, REPLAY[8]?.[1] as InitialSetupCommand))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.players[IDS.builder]?.resources).toEqual({ LUMBER: 0, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 })
    expect(result.state.bank.resources.BRICK).toBe(0)
    expect(result.state.bank.resources.GRAIN).toBe(0)
    expect(result.events.map((event) => event.type)).toEqual([
      'SETTLEMENT_BUILT', 'RESOURCE_PRODUCED', 'RESOURCE_PRODUCTION_BLOCKED', 'RESOURCE_PRODUCTION_BLOCKED',
    ])
    expect(result.events[1]).toMatchObject({ type: 'RESOURCE_PRODUCED', tileId: 'tile:-1,-1', resource: 'BRICK' })
    expect(result.events.slice(2)).toEqual([
      { type: 'RESOURCE_PRODUCTION_BLOCKED', resource: 'BRICK', affectedPlayerIds: [IDS.builder], reason: 'BANK_SHORTAGE' },
      { type: 'RESOURCE_PRODUCTION_BLOCKED', resource: 'GRAIN', affectedPlayerIds: [IDS.builder], reason: 'BANK_SHORTAGE' },
    ])

    const desertTile = base.board.robberTileId
    const desertVertex = base.board.topology.tiles[desertTile]?.vertexIds.find((id) => base.board.vertexOccupancy[id] === null)
    if (desertVertex === undefined) throw new Error('Missing desert-adjacent test vertex.')
    const synthetic = {
      ...base,
      board: { ...base.board, vertexOccupancy: Object.fromEntries(Object.keys(base.board.vertexOccupancy).map((id) => [id, null])) as typeof base.board.vertexOccupancy },
    }
    const desertResult = executeInitialSetupCommand(synthetic, envelope(IDS.builder, 8, { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: desertVertex }))
    expect(desertResult.ok).toBe(true)
    if (desertResult.ok) {
      expect(desertResult.events.some((event) => event.type === 'RESOURCE_PRODUCED' && event.tileId === desertTile)).toBe(false)
    }
  })

  it('follows envelope violation precedence and leaves failures byte-for-byte unchanged', () => {
    const state = createGame(config(), 'FRONTIER-ISLES-TASK-05')
    const snapshot = JSON.stringify(state)
    const random = structuredClone(state.random)
    const staleUnknown = executeInitialSetupCommand(state, envelope('player:unknown' as PlayerId, 99, REPLAY[0]?.[1] as InitialSetupCommand))
    expect(staleUnknown.ok ? null : staleUnknown.violation.code).toBe('STALE_STATE_VERSION')
    const unknown = executeInitialSetupCommand(state, envelope('player:unknown' as PlayerId, 0, REPLAY[0]?.[1] as InitialSetupCommand))
    expect(unknown.ok ? null : unknown.violation.code).toBe('UNKNOWN_ACTOR')
    const wrongActor = executeInitialSetupCommand(state, envelope(IDS.human, 0, REPLAY[0]?.[1] as InitialSetupCommand))
    expect(wrongActor.ok ? null : wrongActor.violation.code).toBe('NOT_YOUR_TURN')
    const gameOverState = { ...state, winnerId: IDS.sentinel, turn: { ...state.turn, phase: 'GAME_OVER' as const, setup: null } }
    const gameOver = executeInitialSetupCommand(gameOverState, envelope(IDS.sentinel, 0, REPLAY[0]?.[1] as InitialSetupCommand))
    expect(gameOver.ok ? null : gameOver.violation.code).toBe('GAME_OVER')
    const pendingState = {
      ...state,
      turn: { ...state.turn, phase: 'ACTION' as const, setup: null },
      pendingDecision: { type: 'CHOOSE_MONOPOLY_RESOURCE' as const, actingPlayerId: IDS.sentinel, cardId: 'card:test' as never },
    }
    const pending = executeInitialSetupCommand(pendingState, envelope(IDS.sentinel, 0, REPLAY[0]?.[1] as InitialSetupCommand))
    expect(pending.ok ? null : pending.violation.code).toBe('PENDING_DECISION_REQUIRED')
    expect(JSON.stringify(state)).toBe(snapshot)
    expect(state.random).toEqual(random)
  })

  it('executes the exact snake replay and reaches the frozen final state', () => {
    let state = createGame(config(), 'FRONTIER-ISLES-TASK-05')
    const creationDeck = structuredClone(state.bank.developmentDeck)
    const creationRandom = structuredClone(state.random)
    const allEvents: { readonly type: string }[] = []
    const actorOrder: PlayerId[] = []
    const expectedAfterRoad = [
      { round: 1, placementIndex: 1, playerId: IDS.human },
      { round: 1, placementIndex: 2, playerId: IDS.merchant },
      { round: 1, placementIndex: 3, playerId: IDS.builder },
      { round: 2, placementIndex: 0, playerId: IDS.builder },
      { round: 2, placementIndex: 1, playerId: IDS.merchant },
      { round: 2, placementIndex: 2, playerId: IDS.human },
      { round: 2, placementIndex: 3, playerId: IDS.sentinel },
    ] as const
    let roadTransitionIndex = 0
    const immediateResources = new Map<number, readonly [PlayerId, object]>([
      [8, [IDS.builder, { LUMBER: 0, BRICK: 2, WOOL: 0, GRAIN: 1, ORE: 0 }]],
      [10, [IDS.merchant, { LUMBER: 0, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 }]],
      [12, [IDS.human, { LUMBER: 0, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 0 }]],
      [14, [IDS.sentinel, { LUMBER: 0, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 }]],
    ])

    for (let index = 0; index < REPLAY.length; index += 1) {
      const step = REPLAY[index]
      if (step === undefined) throw new Error(`Missing replay step ${index}.`)
      actorOrder.push(state.turn.currentPlayerId)
      const result = executeInitialSetupCommand(state, envelope(step[0], index, step[1]))
      expect(result.ok, `step ${index}`).toBe(true)
      if (!result.ok) return
      state = result.state
      allEvents.push(...result.events)
      expect(state.stateVersion).toBe(index + 1)
      expect(state.random).toEqual(creationRandom)
      if (step[1].type === 'PLACE_INITIAL_SETTLEMENT') {
        expect(state.turn.phase).toBe('SETUP_ROAD')
        expect(state.turn.currentPlayerId).toBe(step[0])
        const immediate = immediateResources.get(index)
        if (immediate !== undefined) {
          expect(state.players[immediate[0]]?.resources).toEqual(immediate[1])
        }
      } else if (index < 15) {
        const expected = expectedAfterRoad[roadTransitionIndex]
        expect(expected).toBeDefined()
        expect(state.turn).toMatchObject({
          currentPlayerId: expected?.playerId,
          phase: 'SETUP_SETTLEMENT',
          setup: {
            round: expected?.round,
            placementIndex: expected?.placementIndex,
            pendingSettlementVertexId: null,
          },
        })
        roadTransitionIndex += 1
      }
    }

    expect(actorOrder.filter((_, index) => index % 2 === 0)).toEqual([
      IDS.sentinel, IDS.human, IDS.merchant, IDS.builder,
      IDS.builder, IDS.merchant, IDS.human, IDS.sentinel,
    ])
    expect(state.stateVersion).toBe(16)
    expect(state.turn).toEqual({ turnNumber: 1, currentPlayerId: IDS.sentinel, phase: 'ROLL_REQUIRED', setup: null, lastRoll: null, developmentCardPlayedThisTurn: false })
    expect(state.pendingDecision).toBeNull()
    expect(state.winnerId).toBeNull()

    const ownership = Object.fromEntries(Object.values(state.players).map((player) => [player.id, {
      settlements: Object.values(state.board.vertexOccupancy).filter((building) => building?.type === 'SETTLEMENT' && building.ownerId === player.id).length,
      roads: Object.values(state.board.edgeOccupancy).filter((road) => road?.ownerId === player.id).length,
      cities: Object.values(state.board.vertexOccupancy).filter((building) => building?.type === 'CITY' && building.ownerId === player.id).length,
    }]))
    expect(Object.values(ownership)).toEqual(Array.from({ length: 4 }, () => ({ settlements: 2, roads: 2, cities: 0 })))
    expect(state.players[IDS.human]?.resources).toEqual({ LUMBER: 0, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 0 })
    expect(state.players[IDS.merchant]?.resources).toEqual({ LUMBER: 0, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 })
    expect(state.players[IDS.builder]?.resources).toEqual({ LUMBER: 0, BRICK: 2, WOOL: 0, GRAIN: 1, ORE: 0 })
    expect(state.players[IDS.sentinel]?.resources).toEqual({ LUMBER: 0, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 })
    expect(state.bank.resources).toEqual({ LUMBER: 19, BRICK: 14, WOOL: 18, GRAIN: 17, ORE: 19 })
    expect(state.random).toEqual(creationRandom)
    expect(state.bank.developmentDeck).toEqual(creationDeck)
    expect(allEvents.reduce<Record<string, number>>((counts, event) => ({ ...counts, [event.type]: (counts[event.type] ?? 0) + 1 }), {})).toEqual({
      SETTLEMENT_BUILT: 8, RESOURCE_PRODUCED: 8, ROAD_BUILT: 8, TURN_STARTED: 1,
    })
    expect(allEvents).toHaveLength(25)
    expect(allEvents.slice(-2).map((event) => event.type)).toEqual(['ROAD_BUILT', 'TURN_STARTED'])
  })
})
