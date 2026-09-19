import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { GameConfig } from '@frontier-isles/game-core/model/game-config'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import type { CommandId, PlayerId } from '@frontier-isles/game-core/model/ids'
import type { ResourceBag } from '@frontier-isles/game-core/model/resource'
import { RESOURCE_TYPES, createEmptyResourceBag } from '@frontier-isles/game-core/model/resource'
import { createOnlineGame } from '@frontier-isles/game-core/engine/create-game'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { assertTradingState } from '@frontier-isles/game-core/engine/trading-invariants'
import {
  CANONICAL_SEAT_IDS, REALTIME_PROTOCOL_VERSION, gameCommandRequestSchema, gameIdSchema,
  roomCodeSchema, sessionIdSchema,
  type Acknowledgement, type GameCommandRequest, type SessionId,
} from '@frontier-isles/realtime-contracts'
import { GameSession, type GameSeat, type GameSessionDependencies } from '../src/game/game-session.js'

export const TEST_ROOM_CODE = roomCodeSchema.parse('ABC234')
export const TEST_GAME_ID = gameIdSchema.parse('game:online-test')
export const TEST_SESSION_IDS: readonly SessionId[] = CANONICAL_SEAT_IDS.map(
  (seat) => sessionIdSchema.parse(`session_test_${seat}_0001`),
)

export function testSeats(humans = 2): readonly GameSeat[] {
  return CANONICAL_SEAT_IDS.map((seatId, index) => {
    const sessionId = TEST_SESSION_IDS[index]
    if (sessionId === undefined) throw new Error('Missing test session.')
    return index < humans ? { seatId, occupancy: 'HUMAN', sessionId, displayName: seatId }
      : { seatId, occupancy: 'AI', profileId: index === 2 ? 'BUILDER' : 'MERCHANT' }
  })
}

export function testSession(
  humans = 2,
  dependencies: GameSessionDependencies = {},
  seed = 'ONLINE-SESSION-TEST',
): GameSession {
  return new GameSession(TEST_ROOM_CODE, TEST_GAME_ID, testSeats(humans), seed, dependencies)
}

export function requireValue<T>(value: T | null | undefined): T {
  if (value === undefined || value === null) throw new Error('Missing required test value.')
  return value
}

export function successData<T>(result: Acknowledgement<T>): T {
  if (!result.ok) throw new Error(`Unexpected acknowledgement: ${result.error.code}.`)
  return result.data
}

export function requestFor(game: GameSession, sessionId: SessionId, command: GameCommand, suffix = ''): GameCommandRequest {
  const version = game.snapshot(sessionId).view.stateVersion
  return gameCommandRequestSchema.parse({ protocolVersion: REALTIME_PROTOCOL_VERSION,
    roomCode: game.roomCode, gameId: game.gameId, commandId: `human:${sessionId}:${version}:${suffix}`,
    expectedStateVersion: version, command })
}

/** Test-only fixtures first perform the real setup commands, then conserve all resources. */
export function completedSetup(config: GameConfig, seed: string): GameState {
  let state = createOnlineGame(config, seed)
  for (let index = 0; index < 16; index += 1) {
    const actorId = state.turn.currentPlayerId
    const view = gameEngine.createPlayerView(state, actorId)
    const command: GameCommand = state.turn.phase === 'SETUP_SETTLEMENT'
      ? { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: requireValue(view.legalActions.legalInitialSettlementVertexIds?.[0]) }
      : { type: 'PLACE_INITIAL_ROAD', edgeId: requireValue(view.legalActions.legalInitialRoadEdgeIds?.[0]) }
    const result = gameEngine.execute(state, { commandId: `fixture:${index}` as CommandId,
      actorId, expectedStateVersion: state.stateVersion, command })
    if (!result.ok) throw new Error(`Setup fixture failed: ${result.violation.code}.`)
    state = result.state
    assertTradingState(state)
  }
  return state
}

export function withHands(state: GameState, hands: Readonly<Record<PlayerId, ResourceBag>>): GameState {
  const bank = { LUMBER: 19, BRICK: 19, WOOL: 19, GRAIN: 19, ORE: 19 }
  const players = { ...state.players }
  for (const id of state.playerOrder) {
    const player = requireValue(state.players[id])
    const resources = hands[id] ?? createEmptyResourceBag()
    players[id] = { ...player, resources }
    for (const resource of RESOURCE_TYPES) bank[resource] -= resources[resource]
  }
  const next = { ...state, bank: { ...state.bank, resources: bank }, players }
  assertTradingState(next)
  return next
}

export function actionFixture(config: GameConfig, seed: string): GameState {
  const state = completedSetup(config, seed)
  const hands = Object.fromEntries(config.players.map((player) => [player.id,
    { LUMBER: 2, BRICK: 2, WOOL: 2, GRAIN: 2, ORE: 2 }]))
  const next: GameState = { ...withHands(state, hands),
    turn: { ...state.turn, currentPlayerId: config.players[0].id, phase: 'ACTION', lastRoll: { dice: [1, 2], total: 3 } } }
  assertTradingState(next)
  return next
}
