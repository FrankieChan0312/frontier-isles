import type { CommandId, TradeId } from '@frontier-isles/game-core/model/ids'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { GOLDEN_PLAYER_IDS } from '@frontier-isles/game-core/engine/task-05-golden-fixture.test-helper'
import {
  createGoldenDomesticTradeStart,
  createInitialGoldenOffer,
  EMPTY_TRADE_BAG,
} from '@frontier-isles/game-core/engine/task-11-trading.test-helper'
import { DEFAULT_AI_SAFETY_LIMITS, type AiDecisionContext } from './ai-agent.ts'
import { createAiCommandKey } from './core-ai-agent.ts'
import { asAiProfileId } from './personalities/ai-profiles.ts'
import { PersonalityAiAgent } from './personality-ai-agent.ts'

const agent = new PersonalityAiAgent()

function depthOneAiView(
  tradeId: TradeId,
  initiatorGives: typeof EMPTY_TRADE_BAG,
  counterpartyGives: typeof EMPTY_TRADE_BAG,
) {
  const initialState = createGoldenDomesticTradeStart()
  const initial = createInitialGoldenOffer()
  const proposed = gameEngine.execute(initialState, {
    commandId: 'command:personality:counter-fixture:proposal' as CommandId,
    actorId: GOLDEN_PLAYER_IDS.sentinel,
    expectedStateVersion: initialState.stateVersion,
    command: { type: 'PROPOSE_TRADE', offer: initial },
  })
  if (!proposed.ok) throw new Error(`AI proposal fixture failed: ${proposed.violation.code}.`)
  const countered = gameEngine.execute(proposed.state, {
    commandId: 'command:personality:counter-fixture:counter' as CommandId,
    actorId: GOLDEN_PLAYER_IDS.human,
    expectedStateVersion: proposed.state.stateVersion,
    command: {
      type: 'COUNTER_TRADE',
      previousTradeId: initial.tradeId,
      offer: {
        ...initial,
        tradeId,
        proposedById: GOLDEN_PLAYER_IDS.human,
        parentTradeId: initial.tradeId,
        initiatorGives,
        counterpartyGives,
      },
    },
  })
  if (!countered.ok) throw new Error(`Human counter fixture failed: ${countered.violation.code}.`)
  return gameEngine.createPlayerView(countered.state, GOLDEN_PLAYER_IDS.sentinel)
}

function context(profile: 'MERCHANT' | 'BUILDER' | 'SENTINEL'): AiDecisionContext {
  return {
    profileId: asAiProfileId(profile),
    commandNumberThisTurn: 0,
    commandNumberThisGame: 0,
    previousCommandKeysThisTurn: [],
    limits: DEFAULT_AI_SAFETY_LIMITS,
  }
}

describe('personality AI agent', () => {
  it('initiates a bounded legal AI-to-AI domestic offer in Action', async () => {
    const state = createGoldenDomesticTradeStart()
    const view = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.sentinel)
    const command = await agent.chooseNextCommand(view, context('MERCHANT'))

    expect(command.type).toBe('PROPOSE_TRADE')
    const result = gameEngine.execute(state, {
      commandId: 'command:personality:ai-to-ai' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: state.stateVersion,
      command,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state.pendingDecision?.type).toBe('RESPOND_TO_TRADE')
  })

  it('allows profiles to choose different valid commands from the same public position', async () => {
    const state = createGoldenDomesticTradeStart()
    const view = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.sentinel)
    const merchant = await agent.chooseNextCommand(view, context('MERCHANT'))
    const sentinel = await agent.chooseNextCommand(view, context('SENTINEL'))

    expect(merchant.type).toBe('PROPOSE_TRADE')
    expect(sentinel).not.toEqual(merchant)
    expect(view.legalActions.permittedCommandTypes).toContain(sentinel.type)
  })

  it('can create an AI-to-Human pending offer without a testing backdoor', async () => {
    const state = createGoldenDomesticTradeStart()
    const baseView = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.sentinel)
    const view = {
      ...baseView,
      legalActions: {
        ...baseView.legalActions,
        legalDomesticTradeCounterpartyIds: [GOLDEN_PLAYER_IDS.human],
      },
    }
    const command = await agent.chooseNextCommand(view, context('MERCHANT'))
    if (command.type !== 'PROPOSE_TRADE') throw new Error('Expected AI proposal.')
    expect(command.offer.counterpartyId).toBe(GOLDEN_PLAYER_IDS.human)

    const result = gameEngine.execute(state, {
      commandId: 'command:personality:ai-to-human' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: state.stateVersion,
      command,
    })
    if (!result.ok) throw new Error(`AI-to-Human proposal failed: ${result.violation.code}.`)
    expect(result.state.pendingDecision).toMatchObject({
      type: 'RESPOND_TO_TRADE',
      responderId: GOLDEN_PLAYER_IDS.human,
    })
  })

  it('responds deterministically and never counters a depth-one counteroffer', async () => {
    const state = createGoldenDomesticTradeStart()
    const proposal = gameEngine.execute(state, {
      commandId: 'command:personality:incoming' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: state.stateVersion,
      command: { type: 'PROPOSE_TRADE', offer: createInitialGoldenOffer() },
    })
    if (!proposal.ok) throw new Error(`Incoming proposal failed: ${proposal.violation.code}.`)
    const view = gameEngine.createPlayerView(proposal.state, GOLDEN_PLAYER_IDS.human)
    const first = await agent.chooseNextCommand(view, context('SENTINEL'))
    const second = await agent.chooseNextCommand(view, context('SENTINEL'))
    expect(first).toEqual(second)

    const counteredView = {
      ...view,
      pendingDecision: view.pendingDecision?.type === 'RESPOND_TO_TRADE'
        ? {
            ...view.pendingDecision,
            counterDepth: 1 as const,
            offer: {
              ...view.pendingDecision.offer,
              tradeId: 'trade:depth-one' as TradeId,
              parentTradeId: view.pendingDecision.offer.tradeId,
            },
          }
        : view.pendingDecision,
    }
    const depthOne = await agent.chooseNextCommand(counteredView, context('SENTINEL'))
    expect(depthOne.type).not.toBe('COUNTER_TRADE')
  })

  it.each([
    {
      name: 'favorable',
      tradeId: 'trade:personality:favorable' as TradeId,
      initiatorGives: { ...EMPTY_TRADE_BAG, LUMBER: 1 },
      counterpartyGives: { ...EMPTY_TRADE_BAG, BRICK: 2 },
      expectedType: 'ACCEPT_TRADE',
    },
    {
      name: 'unfavorable',
      tradeId: 'trade:personality:unfavorable' as TradeId,
      initiatorGives: { ...EMPTY_TRADE_BAG, LUMBER: 2, WOOL: 1 },
      counterpartyGives: { ...EMPTY_TRADE_BAG, BRICK: 1 },
      expectedType: 'REJECT_TRADE',
    },
    {
      name: 'unaffordable',
      tradeId: 'trade:personality:unaffordable' as TradeId,
      initiatorGives: { ...EMPTY_TRADE_BAG, ORE: 1 },
      counterpartyGives: { ...EMPTY_TRADE_BAG, BRICK: 1 },
      expectedType: 'REJECT_TRADE',
    },
  ])('makes a deterministic $expectedType decision for a $name depth-one counter', async ({
    tradeId,
    initiatorGives,
    counterpartyGives,
    expectedType,
  }) => {
    const view = depthOneAiView(tradeId, initiatorGives, counterpartyGives)
    const first = await agent.chooseNextCommand(view, context('SENTINEL'))
    const second = await agent.chooseNextCommand(view, context('SENTINEL'))

    expect(first).toEqual(second)
    expect(first.type).toBe(expectedType)
    expect(first.type).not.toBe('COUNTER_TRADE')
  })

  it('does not repeat identical proposal terms and never exceeds two attempts', async () => {
    const state = createGoldenDomesticTradeStart()
    const view = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.sentinel)
    const first = await agent.chooseNextCommand(view, context('MERCHANT'))
    if (first.type !== 'PROPOSE_TRADE') throw new Error('Expected first proposal.')
    const priorKey = createAiCommandKey(first)
    const next = await agent.chooseNextCommand(view, {
      ...context('MERCHANT'),
      previousCommandKeysThisTurn: [priorKey, priorKey],
    })
    expect(next.type).not.toBe('PROPOSE_TRADE')
  })
})
