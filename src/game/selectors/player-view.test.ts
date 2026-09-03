import type { GameConfig } from '../model/game-config.ts'
import type { AiProfileId, CommandId, GameId, PlayerId, VertexId } from '../model/ids.ts'
import { RULESET_ID } from '../model/ruleset.ts'
import { gameEngine } from '../engine/game-engine.ts'
import { GOLDEN_PLAYER_IDS } from '../engine/task-05-golden-fixture.test-helper.ts'
import { moveStandardCardToPlayer } from '../engine/task-10-development-card.test-helper.ts'
import {
  createGoldenDomesticTradeStart,
  createInitialGoldenOffer,
} from '../engine/task-11-trading.test-helper.ts'

describe('createPlayerView', () => {
  it('projects an initial 19-card resource supply and only the 25-card deck count', () => {
    const humanId = 'player:view:human' as PlayerId
    const config: GameConfig = {
      gameId: 'game:view:bank' as GameId,
      rulesetId: RULESET_ID,
      players: [
        { id: humanId, name: 'Human', color: 'RED', controller: { type: 'HUMAN' } },
        { id: 'player:view:a' as PlayerId, name: 'A', color: 'BLUE', controller: { type: 'AI', profileId: 'MERCHANT' as AiProfileId } },
        { id: 'player:view:b' as PlayerId, name: 'B', color: 'ORANGE', controller: { type: 'AI', profileId: 'BUILDER' as AiProfileId } },
        { id: 'player:view:c' as PlayerId, name: 'C', color: 'WHITE', controller: { type: 'AI', profileId: 'SENTINEL' as AiProfileId } },
      ],
    }
    const state = gameEngine.createGame(config, 'PLAYER-VIEW-BANK-SUPPLY')
    const view = gameEngine.createPlayerView(state, humanId)

    expect(view.publicGame.bank).toEqual({
      resources: { LUMBER: 19, BRICK: 19, WOOL: 19, GRAIN: 19, ORE: 19 },
      developmentDeckCount: 25,
    })
    expect(view.publicGame.bank).not.toHaveProperty('developmentDeck')
    for (const card of state.bank.developmentDeck) {
      expect(JSON.stringify(view)).not.toContain(card.id)
    }
  })

  it('shows exact private data only to its owner and returns independent public graphs', () => {
    const base = createGoldenDomesticTradeStart()
    const state = moveStandardCardToPlayer(
      base,
      GOLDEN_PLAYER_IDS.sentinel,
      'VICTORY_POINT',
    )
    const view = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.human)
    const sentinel = view.opponents.find((player) => player.id === GOLDEN_PLAYER_IDS.sentinel)
    const hiddenCardId = state.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards[0]?.id
    if (hiddenCardId === undefined) throw new Error('Expected hidden opponent card ID.')

    expect(view.self.resources).toEqual(state.players[GOLDEN_PLAYER_IDS.human]?.resources)
    expect(sentinel).toMatchObject({ resourceCardCount: 3, developmentCardCount: 1 })
    expect(sentinel).not.toHaveProperty('resources')
    expect(sentinel).not.toHaveProperty('developmentCards')
    expect(view).not.toHaveProperty('random')
    expect(view.publicGame.bank).not.toHaveProperty('developmentDeck')
    expect(view.publicGame).not.toHaveProperty('players')
    expect(JSON.stringify(view)).not.toContain(hiddenCardId)

    const occupiedVertexId = (Object.keys(state.board.vertexOccupancy) as VertexId[])
      .find((vertexId) => state.board.vertexOccupancy[vertexId] !== null)
    if (occupiedVertexId === undefined) throw new Error('Expected occupied fixture vertex.')
    const stateBuilding = state.board.vertexOccupancy[occupiedVertexId]
    const mutableOccupancy = view.publicGame.board.vertexOccupancy as unknown as Record<string, unknown>
    mutableOccupancy[occupiedVertexId] = null
    const mutableResources = view.self.resources as unknown as Record<string, number>
    mutableResources.BRICK = 99

    expect(state.board.vertexOccupancy[occupiedVertexId]).toEqual(stateBuilding)
    expect(state.players[GOLDEN_PLAYER_IDS.human]?.resources.BRICK).toBe(2)
  })

  it('projects owner-only playability reasons without exposing card identities to opponents', () => {
    let state = createGoldenDomesticTradeStart()
    state = moveStandardCardToPlayer(
      state,
      GOLDEN_PLAYER_IDS.sentinel,
      'KNIGHT',
      'IN_HAND',
      state.turn.turnNumber,
    )
    state = moveStandardCardToPlayer(
      state,
      GOLDEN_PLAYER_IDS.sentinel,
      'MONOPOLY',
      'IN_HAND',
      0,
    )
    const ownedIds = state.players[GOLDEN_PLAYER_IDS.sentinel]?.developmentCards.map((card) => card.id)
    if (ownedIds === undefined) throw new Error('Expected owner development cards.')

    const ownerView = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.sentinel)
    expect(ownerView.legalActions.developmentCardPlayability).toEqual([
      { cardId: ownedIds[0], canPlay: false, reason: 'BOUGHT_THIS_TURN' },
      { cardId: ownedIds[1], canPlay: true, reason: 'PLAYABLE' },
    ])

    const opponentView = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.human)
    for (const cardId of ownedIds) expect(JSON.stringify(opponentView)).not.toContain(cardId)
    expect(opponentView.opponents.find((player) => player.id === GOLDEN_PLAYER_IDS.sentinel))
      .toMatchObject({ developmentCardCount: 2 })
  })

  it('projects trade details only to the two parties and capabilities only to the responder', () => {
    const state = createGoldenDomesticTradeStart()
    const proposal = gameEngine.execute(state, {
      commandId: 'command:stage-12:trade-view' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: state.stateVersion,
      command: { type: 'PROPOSE_TRADE', offer: createInitialGoldenOffer() },
    })
    if (!proposal.ok) throw new Error(`Trade fixture failed: ${proposal.violation.code}.`)

    const responderView = gameEngine.createPlayerView(proposal.state, GOLDEN_PLAYER_IDS.human)
    const initiatorView = gameEngine.createPlayerView(proposal.state, GOLDEN_PLAYER_IDS.sentinel)
    const observerView = gameEngine.createPlayerView(proposal.state, GOLDEN_PLAYER_IDS.merchant)

    expect(responderView.pendingDecision).toMatchObject({
      type: 'RESPOND_TO_TRADE',
      responderId: GOLDEN_PLAYER_IDS.human,
      offer: createInitialGoldenOffer(),
    })
    expect(responderView.legalActions.tradeResponse).toEqual({
      canAccept: true,
      canReject: true,
      canCounter: true,
    })
    expect(responderView.legalActions.permittedCommandTypes).toEqual(
      expect.arrayContaining(['ACCEPT_TRADE', 'REJECT_TRADE', 'COUNTER_TRADE']),
    )
    expect(initiatorView.pendingDecision).toMatchObject({ type: 'RESPOND_TO_TRADE' })
    expect(initiatorView.legalActions.tradeResponse).toBeNull()
    expect(observerView.pendingDecision).toEqual({
      type: 'TRADE_IN_PROGRESS',
      initiatorId: GOLDEN_PLAYER_IDS.sentinel,
      counterpartyId: GOLDEN_PLAYER_IDS.human,
      responderId: GOLDEN_PLAYER_IDS.human,
      counterDepth: 0,
    })
    expect(JSON.stringify(observerView)).not.toContain('initiatorGives')
    expect(JSON.stringify(observerView)).not.toContain('counterpartyGives')
  })

  it('rejects an unknown viewer rather than returning an unsafe partial projection', () => {
    const state = createGoldenDomesticTradeStart()
    expect(() => gameEngine.createPlayerView(state, 'player:unknown' as PlayerId))
      .toThrow(/unknown player/)
  })
})
