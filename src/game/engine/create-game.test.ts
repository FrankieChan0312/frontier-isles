import { createStandardInitialBoard } from '../board/standard-board-content.ts'
import type { GameConfig, PlayerConfig } from '../model/game-config.ts'
import type { AiProfileId, GameId, PlayerId, TileId } from '../model/ids.ts'
import { RULESET_ID } from '../model/ruleset.ts'
import { STANDARD_BANK_RESOURCE_COUNT } from '../model/standard-bank.ts'
import { STANDARD_DEVELOPMENT_DECK_SOURCE } from '../model/standard-development-deck.ts'
import { createInitialRandomState, nextRandomInt } from '../random/seeded-random.ts'
import { createGame } from './create-game.ts'

const GOLDEN_SEED = 'FRONTIER-ISLES-TASK-05'

function goldenConfig(): GameConfig {
  return {
    gameId: 'game:task-05' as GameId,
    rulesetId: RULESET_ID,
    players: [
      { id: 'player:human' as PlayerId, name: 'Frankie', color: 'RED', controller: { type: 'HUMAN' } },
      { id: 'player:merchant' as PlayerId, name: 'Merchant', color: 'BLUE', controller: { type: 'AI', profileId: 'ai:merchant' as AiProfileId } },
      { id: 'player:builder' as PlayerId, name: 'Builder', color: 'ORANGE', controller: { type: 'AI', profileId: 'ai:builder' as AiProfileId } },
      { id: 'player:sentinel' as PlayerId, name: 'Sentinel', color: 'WHITE', controller: { type: 'AI', profileId: 'ai:sentinel' as AiProfileId } },
    ],
  }
}

function runtimeConfig(mutator: (players: PlayerConfig[]) => void): GameConfig {
  const config = structuredClone(goldenConfig())
  const players = [...config.players]
  mutator(players)
  return { ...config, players } as unknown as GameConfig
}

describe('createGame', () => {
  it('accepts the frozen four-player runtime config and preserves input text', () => {
    const config = goldenConfig()
    const state = createGame(config, GOLDEN_SEED)
    expect(state.gameId).toBe(config.gameId)
    expect(state.players['player:human' as PlayerId]?.name).toBe('Frankie')
  })

  it('rejects malformed runtime configuration boundaries', () => {
    expect(() => createGame({ ...goldenConfig(), gameId: '   ' as GameId }, GOLDEN_SEED)).toThrow(/gameId/)
    expect(() => createGame({ ...goldenConfig(), rulesetId: 'OTHER' } as unknown as GameConfig, GOLDEN_SEED)).toThrow(/rulesetId/)
    expect(() => createGame({ ...goldenConfig(), players: goldenConfig().players.slice(0, 3) } as unknown as GameConfig, GOLDEN_SEED)).toThrow(/exactly four/)
    expect(() => createGame(runtimeConfig((players) => { players[1] = { ...players[1] as PlayerConfig, id: players[0]?.id as PlayerId } }), GOLDEN_SEED)).toThrow(/duplicated/)
    expect(() => createGame(runtimeConfig((players) => { players[3] = { ...players[3] as PlayerConfig, color: 'ORANGE' } }), GOLDEN_SEED)).toThrow(/color/)
    expect(() => createGame(runtimeConfig((players) => { players[0] = { ...players[0] as PlayerConfig, controller: { type: 'AI', profileId: 'ai:extra' as AiProfileId } } }), GOLDEN_SEED)).toThrow(/HUMAN/)
    expect(() => createGame(runtimeConfig((players) => { players[1] = { ...players[1] as PlayerConfig, controller: { type: 'HUMAN' } } }), GOLDEN_SEED)).toThrow(/HUMAN/)
    expect(() => createGame(runtimeConfig((players) => { players[2] = { ...players[2] as PlayerConfig, name: '  ' } }), GOLDEN_SEED)).toThrow(/name/)
    expect(() => createGame(runtimeConfig((players) => { players[2] = { ...players[2] as PlayerConfig, controller: { type: 'AI', profileId: ' ' as AiProfileId } } }), GOLDEN_SEED)).toThrow(/profileId/)
    expect(() => createGame(runtimeConfig((players) => { players[2] = { ...players[2] as PlayerConfig, controller: { type: 'OTHER' } as never } }), GOLDEN_SEED)).toThrow(/invalid controller/)
  })

  it('creates a fresh standard bank with 19 of each resource', () => {
    const first = createGame(goldenConfig(), GOLDEN_SEED)
    const second = createGame(goldenConfig(), GOLDEN_SEED)
    expect(first.bank.resources).toEqual({ LUMBER: 19, BRICK: 19, WOOL: 19, GRAIN: 19, ORE: 19 })
    expect(STANDARD_BANK_RESOURCE_COUNT).toBe(19)
    expect(first.bank.resources).not.toBe(second.bank.resources)
  })

  it('defines the exact unique 25-card source order', () => {
    const expectedIds = [
      ...Array.from({ length: 14 }, (_, i) => `development-card:knight:${String(i + 1).padStart(2, '0')}`),
      ...Array.from({ length: 5 }, (_, i) => `development-card:victory-point:${String(i + 1).padStart(2, '0')}`),
      'development-card:road-building:01', 'development-card:road-building:02',
      'development-card:monopoly:01', 'development-card:monopoly:02',
      'development-card:invention:01', 'development-card:invention:02',
    ]
    expect(STANDARD_DEVELOPMENT_DECK_SOURCE.map((card) => card.id)).toEqual(expectedIds)
    expect(new Set(expectedIds).size).toBe(25)
    expect(STANDARD_DEVELOPMENT_DECK_SOURCE.map((card) => card.type)).toEqual([
      ...Array<string>(14).fill('KNIGHT'),
      ...Array<string>(5).fill('VICTORY_POINT'),
      'ROAD_BUILDING', 'ROAD_BUILDING', 'MONOPOLY', 'MONOPOLY', 'INVENTION', 'INVENTION',
    ])
  })

  it('matches all golden random, rotation, board, deck, and turn anchors', () => {
    const initial = createInitialRandomState(GOLDEN_SEED)
    const boardResult = createStandardInitialBoard(initial)
    const starterResult = nextRandomInt(boardResult.random, 0, 4)
    const state = createGame(goldenConfig(), GOLDEN_SEED)
    const red = (Object.entries(state.board.tileContents) as unknown as [TileId, { readonly numberToken: number | null }][])
      .filter(([, content]) => content.numberToken === 6 || content.numberToken === 8)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([id, content]) => `${id}:${content.numberToken}`)

    expect(initial).toMatchObject({ state: 1571516003, drawCount: 0 })
    expect(boardResult.random).toMatchObject({ state: 2850798816, drawCount: 59 })
    expect(starterResult).toMatchObject({ value: 3, random: { state: 277719227, drawCount: 60 } })
    expect(state.random).toMatchObject({ state: 3364541899, drawCount: 84 })
    expect(state.playerOrder).toEqual(['player:sentinel', 'player:human', 'player:merchant', 'player:builder'])
    expect(state.board.robberTileId).toBe('tile:2,0')
    expect(red).toEqual(['tile:-1,1:8', 'tile:0,-1:8', 'tile:0,2:6', 'tile:2,-2:6'])
    expect(state.turn).toEqual({
      turnNumber: 0,
      currentPlayerId: 'player:sentinel',
      phase: 'SETUP_SETTLEMENT',
      setup: { round: 1, placementIndex: 0, pendingSettlementVertexId: null },
      lastRoll: null,
      developmentCardPlayedThisTurn: false,
    })
    expect(state.bank.developmentDeck.map((card) => `${card.id} ${card.type}`)).toEqual([
      'development-card:victory-point:03 VICTORY_POINT',
      'development-card:knight:09 KNIGHT',
      'development-card:knight:13 KNIGHT',
      'development-card:knight:01 KNIGHT',
      'development-card:monopoly:01 MONOPOLY',
      'development-card:knight:12 KNIGHT',
      'development-card:knight:07 KNIGHT',
      'development-card:victory-point:05 VICTORY_POINT',
      'development-card:monopoly:02 MONOPOLY',
      'development-card:knight:04 KNIGHT',
      'development-card:knight:02 KNIGHT',
      'development-card:invention:02 INVENTION',
      'development-card:knight:14 KNIGHT',
      'development-card:victory-point:02 VICTORY_POINT',
      'development-card:victory-point:01 VICTORY_POINT',
      'development-card:knight:06 KNIGHT',
      'development-card:road-building:02 ROAD_BUILDING',
      'development-card:knight:11 KNIGHT',
      'development-card:road-building:01 ROAD_BUILDING',
      'development-card:knight:03 KNIGHT',
      'development-card:knight:05 KNIGHT',
      'development-card:invention:01 INVENTION',
      'development-card:knight:08 KNIGHT',
      'development-card:knight:10 KNIGHT',
      'development-card:victory-point:04 VICTORY_POINT',
    ])
    expect(state.bank.developmentDeck[0]?.id).toBe('development-card:victory-point:03')
  })

  it('returns deterministic independent plain graphs without mutating config or source', () => {
    const config = goldenConfig()
    const configSnapshot = structuredClone(config)
    const sourceSnapshot = structuredClone(STANDARD_DEVELOPMENT_DECK_SOURCE)
    const first = createGame(config, GOLDEN_SEED)
    const second = createGame(config, GOLDEN_SEED)
    expect(first).toEqual(second)
    expect(first).not.toBe(second)
    expect(first.board).not.toBe(second.board)
    expect(first.players).not.toBe(second.players)
    expect(first.bank.developmentDeck).not.toBe(second.bank.developmentDeck)
    expect(first.bank.developmentDeck[0]).not.toBe(second.bank.developmentDeck[0])
    expect(first.bank.developmentDeck[0]).not.toBe(STANDARD_DEVELOPMENT_DECK_SOURCE[0])
    expect(config).toEqual(configSnapshot)
    expect(STANDARD_DEVELOPMENT_DECK_SOURCE).toEqual(sourceSnapshot)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
  })

  it('produces meaningful deterministic differences for different seeds', () => {
    const first = createGame(goldenConfig(), 'TASK05-A')
    const second = createGame(goldenConfig(), 'TASK05-B')
    expect({ board: first.board.tileContents, order: first.playerOrder, deck: first.bank.developmentDeck })
      .not.toEqual({ board: second.board.tileContents, order: second.playerOrder, deck: second.bank.developmentDeck })
  })
})
