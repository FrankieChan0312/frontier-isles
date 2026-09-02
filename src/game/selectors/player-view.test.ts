import type { CommandId, PlayerId, VertexId } from '../model/ids.ts'
import { gameEngine } from '../engine/game-engine.ts'
import { GOLDEN_PLAYER_IDS } from '../engine/task-05-golden-fixture.test-helper.ts'
import { moveStandardCardToPlayer } from '../engine/task-10-development-card.test-helper.ts'
import {
  createGoldenDomesticTradeStart,
  createInitialGoldenOffer,
} from '../engine/task-11-trading.test-helper.ts'

describe('createPlayerView', () => {
  it('shows exact private data only to its owner and returns independent public graphs', () => {
    const base = createGoldenDomesticTradeStart()
    const state = moveStandardCardToPlayer(
      base,
      GOLDEN_PLAYER_IDS.sentinel,
      'VICTORY_POINT',
    )
    const view = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.human)
    const sentinel = view.opponents.find((player) => player.id === GOLDEN_PLAYER_IDS.sentinel)

    expect(view.self.resources).toEqual(state.players[GOLDEN_PLAYER_IDS.human]?.resources)
    expect(sentinel).toMatchObject({ resourceCardCount: 3, developmentCardCount: 1 })
    expect(sentinel).not.toHaveProperty('resources')
    expect(sentinel).not.toHaveProperty('developmentCards')
    expect(view).not.toHaveProperty('random')
    expect(view.publicGame.bank).not.toHaveProperty('developmentDeck')
    expect(view.publicGame).not.toHaveProperty('players')

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
