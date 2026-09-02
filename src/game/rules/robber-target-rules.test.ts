import type { GameState } from '../model/game-state.ts'
import type { PlayerId, TileId, VertexId } from '../model/ids.ts'
import {
  createNoDiscardRobberMoveState,
} from '../engine/task-07-controlled-seven.test-helper.ts'
import { GOLDEN_PLAYER_IDS } from '../engine/task-05-golden-fixture.test-helper.ts'
import { deriveEligibleRobberTargetPlayerIds } from './robber-target-rules.ts'

describe('robber target derivation', () => {
  it('derives the exact multiple-target anchor in player order', () => {
    const state = createNoDiscardRobberMoveState()
    expect(deriveEligibleRobberTargetPlayerIds(
      state,
      'tile:0,-2' as TileId,
      GOLDEN_PLAYER_IDS.sentinel,
    )).toEqual([GOLDEN_PLAYER_IDS.merchant, GOLDEN_PLAYER_IDS.builder])
  })

  it('matches the no-target and one-target anchors', () => {
    const state = createNoDiscardRobberMoveState()
    expect(deriveEligibleRobberTargetPlayerIds(
      state,
      'tile:1,-2' as TileId,
      GOLDEN_PLAYER_IDS.sentinel,
    )).toEqual([])
    expect(deriveEligibleRobberTargetPlayerIds(
      state,
      'tile:-2,2' as TileId,
      GOLDEN_PLAYER_IDS.sentinel,
    )).toEqual([GOLDEN_PLAYER_IDS.human])
  })

  it('deduplicates multiple buildings and excludes the actor and zero-card players', () => {
    const state = createNoDiscardRobberMoveState()
    const zeroMerchant: GameState = {
      ...state,
      players: {
        ...state.players,
        [GOLDEN_PLAYER_IDS.merchant]: {
          ...state.players[GOLDEN_PLAYER_IDS.merchant] as NonNullable<typeof state.players[typeof GOLDEN_PLAYER_IDS.merchant]>,
          resources: { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
        },
      },
      bank: {
        ...state.bank,
        resources: { ...state.bank.resources, BRICK: state.bank.resources.BRICK + 1 },
      },
    }
    expect(deriveEligibleRobberTargetPlayerIds(
      zeroMerchant,
      'tile:0,-2' as TileId,
      GOLDEN_PLAYER_IDS.sentinel,
    )).toEqual([GOLDEN_PLAYER_IDS.builder])
    expect(deriveEligibleRobberTargetPlayerIds(
      state,
      'tile:0,-2' as TileId,
      GOLDEN_PLAYER_IDS.builder,
    )).toEqual([GOLDEN_PLAYER_IDS.merchant])
  })

  it('does not treat roads as target eligibility', () => {
    const state = createNoDiscardRobberMoveState()
    const tile = state.board.topology.tiles['tile:1,-2' as TileId]
    if (tile === undefined) throw new Error('Missing roads-only target fixture tile.')
    const edgeId = tile.edgeIds[0]
    const roadsOnly: GameState = {
      ...state,
      board: {
        ...state.board,
        edgeOccupancy: {
          ...state.board.edgeOccupancy,
          [edgeId]: { ownerId: GOLDEN_PLAYER_IDS.human },
        },
      },
    }
    expect(deriveEligibleRobberTargetPlayerIds(
      roadsOnly,
      'tile:1,-2' as TileId,
      GOLDEN_PLAYER_IDS.sentinel,
    )).toEqual([])
  })

  it('throws for unknown tiles, actors, occupancy owners, and invalid counts', () => {
    const state = createNoDiscardRobberMoveState()
    expect(() => deriveEligibleRobberTargetPlayerIds(
      state,
      'tile:unknown' as TileId,
      GOLDEN_PLAYER_IDS.sentinel,
    )).toThrow(/absent/)
    expect(() => deriveEligibleRobberTargetPlayerIds(
      state,
      'tile:0,-2' as TileId,
      'player:unknown' as PlayerId,
    )).toThrow(/unknown/)
    const tile = state.board.topology.tiles['tile:0,-2' as TileId]
    const vertexId = tile?.vertexIds[0]
    if (vertexId === undefined) throw new Error('Missing corrupt owner fixture vertex.')
    expect(() => deriveEligibleRobberTargetPlayerIds({
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          [vertexId as VertexId]: { type: 'SETTLEMENT', ownerId: 'player:unknown' as PlayerId },
        },
      },
    }, 'tile:0,-2' as TileId, GOLDEN_PLAYER_IDS.sentinel)).toThrow(/unknown owner/)
    expect(() => deriveEligibleRobberTargetPlayerIds({
      ...state,
      players: {
        ...state.players,
        [GOLDEN_PLAYER_IDS.builder]: {
          ...state.players[GOLDEN_PLAYER_IDS.builder] as NonNullable<typeof state.players[typeof GOLDEN_PLAYER_IDS.builder]>,
          resources: { ...state.players[GOLDEN_PLAYER_IDS.builder]?.resources as NonNullable<typeof state.players[typeof GOLDEN_PLAYER_IDS.builder]>['resources'], GRAIN: -1 },
        },
      },
    }, 'tile:0,-2' as TileId, GOLDEN_PLAYER_IDS.sentinel)).toThrow(/non-negative/)
  })
})
