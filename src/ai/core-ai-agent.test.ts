import type { GameConfig } from '../game/model/game-config.ts'
import type { AiProfileId, CommandId, GameId, PlayerId } from '../game/model/ids.ts'
import { RULESET_ID } from '../game/model/ruleset.ts'
import { gameEngine } from '../game/engine/game-engine.ts'
import { createBalancedDiscardState } from '../game/engine/task-07-controlled-seven.test-helper.ts'
import { GOLDEN_PLAYER_IDS } from '../game/engine/task-05-golden-fixture.test-helper.ts'
import {
  createGoldenDomesticTradeStart,
  createInitialGoldenOffer,
} from '../game/engine/task-11-trading.test-helper.ts'
import { DEFAULT_AI_SAFETY_LIMITS, type AiDecisionContext } from './ai-agent.ts'
import { createAiCommandKey, DeterministicCoreAiAgent } from './core-ai-agent.ts'
import {
  evaluateStrategicPosition,
  scoreVertexForProduction,
} from './evaluation/core-evaluation.ts'

const agent = new DeterministicCoreAiAgent()
const context: AiDecisionContext = {
  commandNumberThisTurn: 0,
  commandNumberThisGame: 0,
  previousCommandKeysThisTurn: [],
  limits: DEFAULT_AI_SAFETY_LIMITS,
}

function config(): GameConfig {
  return {
    gameId: 'game:core-ai-test' as GameId,
    rulesetId: RULESET_ID,
    players: [
      {
        id: 'player:core:human' as PlayerId,
        name: 'Human',
        color: 'RED',
        controller: { type: 'HUMAN' },
      },
      {
        id: 'player:core:east' as PlayerId,
        name: 'East',
        color: 'BLUE',
        controller: { type: 'AI', profileId: 'CORE' as AiProfileId },
      },
      {
        id: 'player:core:south' as PlayerId,
        name: 'South',
        color: 'ORANGE',
        controller: { type: 'AI', profileId: 'CORE' as AiProfileId },
      },
      {
        id: 'player:core:west' as PlayerId,
        name: 'West',
        color: 'WHITE',
        controller: { type: 'AI', profileId: 'CORE' as AiProfileId },
      },
    ],
  }
}

describe('deterministic core AI', () => {
  it('chooses the same highest-value legal initial placement from the same redacted view', async () => {
    const state = gameEngine.createGame(config(), 'CORE-AI-SETUP')
    const view = gameEngine.createPlayerView(state, state.turn.currentPlayerId)
    const first = await agent.chooseNextCommand(view, context)
    const second = await agent.chooseNextCommand(view, context)

    expect(first).toEqual(second)
    expect(first.type).toBe('PLACE_INITIAL_SETTLEMENT')
    if (first.type !== 'PLACE_INITIAL_SETTLEMENT') throw new Error('Expected settlement command.')
    expect(view.legalActions.legalInitialSettlementVertexIds).toContain(first.vertexId)
    const result = gameEngine.execute(state, {
      commandId: 'command:core-ai:setup' as CommandId,
      actorId: state.turn.currentPlayerId,
      expectedStateVersion: state.stateVersion,
      command: first,
    })
    expect(result.ok).toBe(true)
  })

  it('returns an exact legal discard using only the acting player view', async () => {
    const state = createBalancedDiscardState()
    const pending = state.pendingDecision
    if (pending?.type !== 'DISCARD_RESOURCES') throw new Error('Expected discard fixture.')
    const actorId = state.playerOrder.find(
      (playerId) => pending.requiredCountByPlayer[playerId] !== undefined,
    )
    if (actorId === undefined) throw new Error('Expected required discard actor.')
    const view = gameEngine.createPlayerView(state, actorId)
    const command = await agent.chooseNextCommand(view, context)

    expect(command.type).toBe('DISCARD_RESOURCES')
    const result = gameEngine.execute(state, {
      commandId: 'command:core-ai:discard' as CommandId,
      actorId,
      expectedStateVersion: state.stateVersion,
      command,
    })
    expect(result.ok).toBe(true)
  })

  it('uses the Stage 13 safe deterministic reject policy for an incoming trade', async () => {
    const state = createGoldenDomesticTradeStart()
    const proposal = gameEngine.execute(state, {
      commandId: 'command:core-ai:proposal' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: state.stateVersion,
      command: { type: 'PROPOSE_TRADE', offer: createInitialGoldenOffer() },
    })
    if (!proposal.ok) throw new Error(`Trade fixture failed: ${proposal.violation.code}.`)
    const view = gameEngine.createPlayerView(proposal.state, GOLDEN_PLAYER_IDS.human)

    await expect(agent.chooseNextCommand(view, context)).resolves.toEqual({
      type: 'REJECT_TRADE',
      tradeId: createInitialGoldenOffer().tradeId,
    })
  })

  it('exposes inspectable strategic factors and distinguishes stronger production vertices', () => {
    const state = gameEngine.createGame(config(), 'CORE-AI-EVALUATION')
    const view = gameEngine.createPlayerView(state, state.turn.currentPlayerId)
    const legal = view.legalActions.legalInitialSettlementVertexIds ?? []
    const scores = legal.map((vertexId) => scoreVertexForProduction(view, vertexId))
    const strategic = evaluateStrategicPosition(view)

    expect(new Set(scores).size).toBeGreaterThan(1)
    expect(strategic).toMatchObject({
      productionProbability: 0,
      resourceDiversity: 0,
      immediateBuildUnlocks: 0,
      currentVictoryPoints: 0,
    })
    expect(strategic).toHaveProperty('resourceScarcity')
    expect(strategic).toHaveProperty('visibleOpponentThreat')
    expect(strategic).toHaveProperty('projectedVictoryPoints')
  })

  it('stops repeated-command loops with an actionable diagnostic', async () => {
    const state = gameEngine.createGame(config(), 'CORE-AI-SAFETY')
    const view = gameEngine.createPlayerView(state, state.turn.currentPlayerId)
    const command = await agent.chooseNextCommand(view, context)
    const key = createAiCommandKey(command)
    await expect(agent.chooseNextCommand(view, {
      ...context,
      previousCommandKeysThisTurn: Array<string>(12).fill(key),
    })).rejects.toThrow(/repeated-command safety limit/)
  })
})
