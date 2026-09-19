import type { GameConfig } from '../model/game-config.ts'
import type { GameState } from '../model/game-state.ts'
import type { AiProfileId, CommandId, GameId, PlayerId, VertexId } from '../model/ids.ts'
import { RULESET_ID } from '../model/ruleset.ts'
import { createGame } from './create-game.ts'
import { executeInitialSetupCommand } from './initial-setup-engine.ts'
import { assertInitialSetupState } from './initial-setup-invariants.ts'

const sentinel = 'player:sentinel' as PlayerId
const human = 'player:human' as PlayerId

function config(): GameConfig {
  return {
    gameId: 'game:invariants' as GameId,
    rulesetId: RULESET_ID,
    players: [
      { id: human, name: 'Human', color: 'RED', controller: { type: 'HUMAN' } },
      { id: 'player:merchant' as PlayerId, name: 'Merchant', color: 'BLUE', controller: { type: 'AI', profileId: 'ai:merchant' as AiProfileId } },
      { id: 'player:builder' as PlayerId, name: 'Builder', color: 'ORANGE', controller: { type: 'AI', profileId: 'ai:builder' as AiProfileId } },
      { id: sentinel, name: 'Sentinel', color: 'WHITE', controller: { type: 'AI', profileId: 'ai:sentinel' as AiProfileId } },
    ],
  }
}

function created(): GameState {
  return createGame(config(), 'FRONTIER-ISLES-TASK-05')
}

function roadPhase(): GameState {
  const state = created()
  const result = executeInitialSetupCommand(state, {
    commandId: 'command:invariant' as CommandId,
    actorId: sentinel,
    expectedStateVersion: 0,
    command: { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: 'vertex:-1,-1,2' as VertexId },
  })
  if (!result.ok) throw new Error('Invariant fixture settlement failed.')
  return result.state
}

describe('initial setup invariants', () => {
  it('accepts valid settlement and road setup states without mutation', () => {
    for (const state of [created(), roadPhase()]) {
      const snapshot = structuredClone(state)
      expect(() => assertInitialSetupState(state)).not.toThrow()
      expect(state).toEqual(snapshot)
    }
  })

  it('rejects schema, ruleset, and malformed player-order state', () => {
    const state = created()
    expect(() => assertInitialSetupState({ ...state, schemaVersion: 2 } as unknown as GameState)).toThrow(/schema/)
    expect(() => assertInitialSetupState({ ...state, rulesetId: 'OTHER' } as unknown as GameState)).toThrow(/ruleset/)
    expect(() => assertInitialSetupState({ ...state, playerOrder: [sentinel, sentinel, human, 'player:builder' as PlayerId] })).toThrow(/playerOrder/)
    expect(() => assertInitialSetupState({ ...state, turn: { ...state.turn, currentPlayerId: human } })).toThrow(/current player must/)
  })

  it('rejects missing or malformed setup round/index/pending semantics', () => {
    const state = created()
    expect(() => assertInitialSetupState({ ...state, turn: { ...state.turn, setup: null } })).toThrow(/requires setup/)
    expect(() => assertInitialSetupState({ ...state, turn: { ...state.turn, setup: { round: 1, placementIndex: 0, pendingSettlementVertexId: 'vertex:-1,-1,2' as VertexId } } })).toThrow(/must not have a pending/)
    expect(() => assertInitialSetupState({ ...state, turn: { ...state.turn, setup: { round: 3, placementIndex: 0, pendingSettlementVertexId: null } as never } })).toThrow(/round/)
    expect(() => assertInitialSetupState({ ...state, turn: { ...state.turn, setup: { round: 1, placementIndex: 4, pendingSettlementVertexId: null } } })).toThrow(/placementIndex/)
  })

  it('rejects corrupt pending settlement ownership, type, and existence', () => {
    const state = roadPhase()
    const pending = state.turn.setup?.pendingSettlementVertexId
    if (pending === null || pending === undefined) throw new Error('Missing pending fixture vertex.')
    expect(() => assertInitialSetupState({ ...state, board: { ...state.board, vertexOccupancy: { ...state.board.vertexOccupancy, [pending]: null } } })).toThrow(/is empty/)
    expect(() => assertInitialSetupState({ ...state, board: { ...state.board, vertexOccupancy: { ...state.board.vertexOccupancy, [pending]: { type: 'SETTLEMENT', ownerId: human } } } })).toThrow(/owned by another/)
    expect(() => assertInitialSetupState({ ...state, board: { ...state.board, vertexOccupancy: { ...state.board.vertexOccupancy, [pending]: { type: 'CITY', ownerId: sentinel } } } })).toThrow(/must contain a settlement/)
    expect(() => assertInitialSetupState({ ...state, turn: { ...state.turn, setup: { ...state.turn.setup as NonNullable<typeof state.turn.setup>, pendingSettlementVertexId: 'vertex:unknown' as VertexId } } })).toThrow(/unknown/)
  })

  it('rejects invalid resources and occupancy IDs or owners', () => {
    const state = created()
    expect(() => assertInitialSetupState({ ...state, bank: { ...state.bank, resources: { ...state.bank.resources, BRICK: -1 } } })).toThrow(/non-negative/)
    expect(() => assertInitialSetupState({ ...state, players: { ...state.players, [sentinel]: { ...state.players[sentinel] as NonNullable<typeof state.players[typeof sentinel]>, resources: { ...state.players[sentinel]?.resources as NonNullable<typeof state.players[typeof sentinel]>['resources'], ORE: 1.5 } } } })).toThrow(/non-negative/)
    expect(() => assertInitialSetupState({ ...state, board: { ...state.board, edgeOccupancy: { ...state.board.edgeOccupancy, ['edge:unknown' as never]: null } } })).toThrow(/key count|unknown ID/)
    const vertexId = Object.keys(state.board.vertexOccupancy)[0] as VertexId
    expect(() => assertInitialSetupState({ ...state, board: { ...state.board, vertexOccupancy: { ...state.board.vertexOccupancy, [vertexId]: { type: 'SETTLEMENT', ownerId: 'player:unknown' as PlayerId } } } })).toThrow(/unknown owner/)
  })

  it('rejects setup states with winner or pending decision', () => {
    const state = created()
    expect(() => assertInitialSetupState({ ...state, winnerId: sentinel })).toThrow(/winner/)
    const pendingDecision = {
      type: 'CHOOSE_MONOPOLY_RESOURCE' as const,
      actingPlayerId: sentinel,
      cardId: 'development-card:test' as never,
    }
    expect(() => assertInitialSetupState({ ...state, pendingDecision })).toThrow(/pending decision/)
  })
})
