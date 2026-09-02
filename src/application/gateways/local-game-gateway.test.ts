import type { GameCommand } from '../../game/contracts/commands.ts'
import type { GameConfig } from '../../game/model/game-config.ts'
import type { GameState } from '../../game/model/game-state.ts'
import type {
  AiProfileId,
  CommandId,
  GameId,
  PlayerId,
  TradeId,
} from '../../game/model/ids.ts'
import { RULESET_ID } from '../../game/model/ruleset.ts'
import type { TradeOffer } from '../../game/model/trade.ts'
import { gameEngine } from '../../game/engine/game-engine.ts'
import { GOLDEN_PLAYER_IDS } from '../../game/engine/task-05-golden-fixture.test-helper.ts'
import {
  createGoldenDomesticTradeStart,
  createInitialGoldenOffer,
  EMPTY_TRADE_BAG,
} from '../../game/engine/task-11-trading.test-helper.ts'
import type { AiAgent, AiDecisionContext } from '../../ai/ai-agent.ts'
import {
  GAME_SAVE_SCHEMA_VERSION,
  parseGameSave,
  serializeGameSave,
  type GameSaveEnvelope,
} from '../../infrastructure/persistence/game-save-format.ts'
import type { GameSaveRepository } from '../../infrastructure/persistence/game-save-repository.ts'
import { InMemoryGameSaveRepository } from '../../infrastructure/persistence/game-save-repository.ts'
import type { GameUpdate } from './game-gateway.ts'
import { LocalGameGateway } from './local-game-gateway.ts'

const TEST_PLAYER_IDS = {
  human: 'player:gateway:human' as PlayerId,
  merchant: 'player:gateway:merchant' as PlayerId,
  builder: 'player:gateway:builder' as PlayerId,
  sentinel: 'player:gateway:sentinel' as PlayerId,
}

function config(): GameConfig {
  return {
    gameId: 'game:gateway' as GameId,
    rulesetId: RULESET_ID,
    players: [
      { id: TEST_PLAYER_IDS.human, name: 'Human', color: 'RED', controller: { type: 'HUMAN' } },
      {
        id: TEST_PLAYER_IDS.merchant,
        name: 'Merchant',
        color: 'BLUE',
        controller: { type: 'AI', profileId: 'MERCHANT' as AiProfileId },
      },
      {
        id: TEST_PLAYER_IDS.builder,
        name: 'Builder',
        color: 'ORANGE',
        controller: { type: 'AI', profileId: 'BUILDER' as AiProfileId },
      },
      {
        id: TEST_PLAYER_IDS.sentinel,
        name: 'Sentinel',
        color: 'WHITE',
        controller: { type: 'AI', profileId: 'SENTINEL' as AiProfileId },
      },
    ],
  }
}

function findSeed(humanStarts: boolean): string {
  for (let index = 1; index <= 100; index += 1) {
    const seed = `GATEWAY-START-${index}`
    const state = gameEngine.createGame(config(), seed)
    if ((state.playerOrder[0] === TEST_PLAYER_IDS.human) === humanStarts) return seed
  }
  throw new Error('Could not find deterministic gateway test seed.')
}

class CountingRepository implements GameSaveRepository {
  serialized: string | null = null
  writes = 0

  read(): Promise<string | null> {
    return Promise.resolve(this.serialized)
  }

  write(serializedSave: string): Promise<void> {
    this.serialized = serializedSave
    this.writes += 1
    return Promise.resolve()
  }

  delete(): Promise<void> {
    this.serialized = null
    return Promise.resolve()
  }
}

function saveForState(state: GameState): GameSaveEnvelope {
  const human = Object.values(state.players).find((player) => player.controller.type === 'HUMAN')
  if (human === undefined) throw new Error('Fixture has no Human player.')
  const assignments = {} as Record<PlayerId, AiProfileId>
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId]
    if (player?.controller.type === 'AI') assignments[playerId] = player.controller.profileId
  }
  return {
    schemaVersion: GAME_SAVE_SCHEMA_VERSION,
    savedAt: '2026-09-02T12:00:00.000Z',
    gameId: state.gameId,
    displaySeed: state.random.seed,
    humanPlayerId: human.id,
    aiProfileAssignments: assignments,
    orchestration: {
      commandCounter: state.stateVersion,
      commandCountThisGame: state.stateVersion,
      turnIdentity: `turn:${state.turn.turnNumber}:${state.turn.currentPlayerId}`,
      commandKeysThisTurn: [],
    },
    state,
  }
}

class ScriptedTradeAgent implements AiAgent {
  chooseNextCommand(view: Parameters<AiAgent['chooseNextCommand']>[0], context: AiDecisionContext): Promise<GameCommand> {
    if (view.pendingDecision?.type === 'RESPOND_TO_TRADE') {
      return Promise.resolve({
        type: 'REJECT_TRADE',
        tradeId: view.pendingDecision.offer.tradeId,
      })
    }
    if (view.publicGame.turn.phase === 'ACTION') {
      const alreadyProposed = context.previousCommandKeysThisTurn.some(
        (key) => key.startsWith('PROPOSE_TRADE:'),
      )
      if (alreadyProposed) return Promise.resolve({ type: 'END_TURN' })
      const offer: TradeOffer = {
        ...createInitialGoldenOffer(),
        tradeId: 'trade:gateway:ai-human' as TradeId,
      }
      return Promise.resolve({ type: 'PROPOSE_TRADE', offer })
    }
    throw new Error(`Unexpected scripted AI phase ${view.publicGame.turn.phase}.`)
  }
}

describe('LocalGameGateway', () => {
  it('runs AI setup actors to the next Human boundary and autosaves every transition', async () => {
    const repository = new CountingRepository()
    const gateway = new LocalGameGateway({
      saveRepository: repository,
      now: () => '2026-09-02T12:00:00.000Z',
    })
    const updates: GameUpdate[] = []
    gateway.subscribe((update) => updates.push(update))
    const view = await gateway.createGame(config(), findSeed(false))

    expect(view.self.id).toBe(TEST_PLAYER_IDS.human)
    expect(view.publicGame.turn.currentPlayerId).toBe(TEST_PLAYER_IDS.human)
    expect(view.publicGame.turn.phase).toBe('SETUP_SETTLEMENT')
    expect(view.stateVersion).toBeGreaterThan(0)
    expect(repository.writes).toBe(view.stateVersion + 1)
    const parsed = parseGameSave(repository.serialized ?? '')
    expect(parsed.ok).toBe(true)
    expect(updates.some((update) => update.aiThinking)).toBe(true)
    expect(updates.at(-1)).toMatchObject({ aiThinking: false, saveStatus: 'SAVED', error: null })
    expect(
      updates.every(
        (update) =>
          update.view === null ||
          !('developmentDeck' in update.view.publicGame.bank),
      ),
    ).toBe(true)
    expect(
      updates.every(
        (update) => update.view === null || !('random' in update.view.publicGame),
      ),
    ).toBe(true)
  })

  it('rejects stale Human commands without changing or saving state', async () => {
    const repository = new CountingRepository()
    const gateway = new LocalGameGateway({ saveRepository: repository })
    const view = await gateway.createGame(config(), findSeed(true))
    const vertexId = view.legalActions.legalInitialSettlementVertexIds?.[0]
    if (vertexId === undefined) throw new Error('Missing legal Human settlement.')
    const writesBefore = repository.writes
    const response = await gateway.submit({
      commandId: 'command:gateway:stale' as CommandId,
      actorId: TEST_PLAYER_IDS.human,
      expectedStateVersion: view.stateVersion + 1,
      command: { type: 'PLACE_INITIAL_SETTLEMENT', vertexId },
    })

    expect(response).toMatchObject({ ok: false, violation: { code: 'STALE_STATE_VERSION' } })
    expect(repository.writes).toBe(writesBefore)
    if (!response.ok) expect(response.view.stateVersion).toBe(view.stateVersion)
  })

  it('accepts Human commands, publishes ordered redacted events, and autosaves', async () => {
    const repository = new CountingRepository()
    const gateway = new LocalGameGateway({ saveRepository: repository })
    const updates: GameUpdate[] = []
    gateway.subscribe((update) => updates.push(update))
    const view = await gateway.createGame(config(), findSeed(true))
    const vertexId = view.legalActions.legalInitialSettlementVertexIds?.[0]
    if (vertexId === undefined) throw new Error('Missing legal Human settlement.')
    const response = await gateway.submit({
      commandId: 'command:gateway:human' as CommandId,
      actorId: TEST_PLAYER_IDS.human,
      expectedStateVersion: view.stateVersion,
      command: { type: 'PLACE_INITIAL_SETTLEMENT', vertexId },
    })

    expect(response.ok).toBe(true)
    if (response.ok) {
      expect(response.events[0]).toMatchObject({ type: 'SETTLEMENT_BUILT', ownerId: TEST_PLAYER_IDS.human })
      expect(response.view.stateVersion).toBe(view.stateVersion + 1)
    }
    expect(updates.flatMap((update) => update.events).some(
      (event) => event.type === 'SETTLEMENT_BUILT',
    )).toBe(true)
    expect(repository.writes).toBe(2)
  })

  it('pauses an AI turn for an AI-to-Human offer and resumes after Human rejection', async () => {
    const state = createGoldenDomesticTradeStart()
    const repository = new InMemoryGameSaveRepository(serializeGameSave(saveForState(state)))
    const gateway = new LocalGameGateway({
      saveRepository: repository,
      aiAgent: new ScriptedTradeAgent(),
    })
    const offeredView = await gateway.loadLatestGame()
    expect(offeredView.pendingDecision).toMatchObject({
      type: 'RESPOND_TO_TRADE',
      responderId: GOLDEN_PLAYER_IDS.human,
    })
    if (offeredView.pendingDecision?.type !== 'RESPOND_TO_TRADE') {
      throw new Error('Expected Human trade response.')
    }

    const response = await gateway.submit({
      commandId: 'command:gateway:reject-ai-offer' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.human,
      expectedStateVersion: offeredView.stateVersion,
      command: {
        type: 'REJECT_TRADE',
        tradeId: offeredView.pendingDecision.offer.tradeId,
      },
    })
    expect(response.ok).toBe(true)
    if (response.ok) {
      expect(response.view.pendingDecision).toBeNull()
      expect(response.view.publicGame.turn.currentPlayerId).toBe(GOLDEN_PLAYER_IDS.human)
      expect(response.view.publicGame.turn.phase).toBe('ROLL_REQUIRED')
    }
  })

  it('automatically resolves a non-current AI response to a Human offer', async () => {
    const base = createGoldenDomesticTradeStart()
    const state: GameState = {
      ...base,
      turn: { ...base.turn, currentPlayerId: GOLDEN_PLAYER_IDS.human },
    }
    const repository = new InMemoryGameSaveRepository(serializeGameSave(saveForState(state)))
    const gateway = new LocalGameGateway({
      saveRepository: repository,
      aiAgent: new ScriptedTradeAgent(),
    })
    const view = await gateway.loadLatestGame()
    const offer: TradeOffer = {
      tradeId: 'trade:gateway:human-ai' as TradeId,
      initiatorId: GOLDEN_PLAYER_IDS.human,
      counterpartyId: GOLDEN_PLAYER_IDS.sentinel,
      proposedById: GOLDEN_PLAYER_IDS.human,
      initiatorGives: { ...EMPTY_TRADE_BAG, BRICK: 1 },
      counterpartyGives: { ...EMPTY_TRADE_BAG, LUMBER: 1 },
      parentTradeId: null,
    }
    const response = await gateway.submit({
      commandId: 'command:gateway:human-offer' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.human,
      expectedStateVersion: view.stateVersion,
      command: { type: 'PROPOSE_TRADE', offer },
    })

    expect(response.ok).toBe(true)
    if (response.ok) {
      expect(response.view.pendingDecision).toBeNull()
      expect(response.view.publicGame.turn.currentPlayerId).toBe(GOLDEN_PLAYER_IDS.human)
      expect(response.events.some((event) => event.type === 'TRADE_REJECTED')).toBe(true)
    }
  })

  it('loads an equivalent valid save, deletes it, and reports corrupt saves recoverably', async () => {
    const repository = new InMemoryGameSaveRepository()
    const first = new LocalGameGateway({
      saveRepository: repository,
      now: () => '2026-09-02T12:00:00.000Z',
    })
    const created = await first.createGame(config(), findSeed(true))
    const second = new LocalGameGateway({ saveRepository: repository })
    const loaded = await second.loadGame(created.publicGame.gameId)
    expect(loaded).toEqual(created)
    expect(await second.hasSavedGame()).toBe(true)
    await second.deleteSavedGame()
    expect(await second.hasSavedGame()).toBe(false)

    const corruptRepository = new InMemoryGameSaveRepository('{broken')
    const corruptGateway = new LocalGameGateway({ saveRepository: corruptRepository })
    const updates: GameUpdate[] = []
    corruptGateway.subscribe((update) => updates.push(update))
    await expect(corruptGateway.loadLatestGame()).rejects.toThrow(/not valid JSON/)
    expect(updates.at(-1)).toMatchObject({ connectionStatus: 'ERROR', error: 'Saved game is not valid JSON.' })
  })
})
