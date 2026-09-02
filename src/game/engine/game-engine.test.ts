import type { GameCommand } from '../contracts/commands.ts'
import type { GameConfig } from '../model/game-config.ts'
import type {
  AiProfileId,
  CommandId,
  DevelopmentCardId,
  EdgeId,
  GameId,
  PlayerId,
  TileId,
  TradeId,
  VertexId,
} from '../model/ids.ts'
import { createEmptyResourceBag } from '../model/resource.ts'
import { RULESET_ID } from '../model/ruleset.ts'
import type { TradeOffer } from '../model/trade.ts'
import { executeGameCommand, gameEngine } from './game-engine.ts'

const PLAYER_IDS = {
  human: 'player:stage-12:human' as PlayerId,
  merchant: 'player:stage-12:merchant' as PlayerId,
  builder: 'player:stage-12:builder' as PlayerId,
  sentinel: 'player:stage-12:sentinel' as PlayerId,
}

function config(): GameConfig {
  return {
    gameId: 'game:stage-12' as GameId,
    rulesetId: RULESET_ID,
    players: [
      { id: PLAYER_IDS.human, name: 'Human', color: 'RED', controller: { type: 'HUMAN' } },
      {
        id: PLAYER_IDS.merchant,
        name: 'Merchant',
        color: 'BLUE',
        controller: { type: 'AI', profileId: 'MERCHANT' as AiProfileId },
      },
      {
        id: PLAYER_IDS.builder,
        name: 'Builder',
        color: 'ORANGE',
        controller: { type: 'AI', profileId: 'BUILDER' as AiProfileId },
      },
      {
        id: PLAYER_IDS.sentinel,
        name: 'Sentinel',
        color: 'WHITE',
        controller: { type: 'AI', profileId: 'SENTINEL' as AiProfileId },
      },
    ],
  }
}

const empty = createEmptyResourceBag()
const tradeId = 'trade:stage-12' as TradeId
const offer: TradeOffer = {
  tradeId,
  initiatorId: PLAYER_IDS.human,
  counterpartyId: PLAYER_IDS.merchant,
  proposedById: PLAYER_IDS.human,
  initiatorGives: { ...empty, LUMBER: 1 },
  counterpartyGives: { ...empty, BRICK: 1 },
  parentTradeId: null,
}

type CommandsByType = {
  readonly [Type in GameCommand['type']]: Extract<GameCommand, { readonly type: Type }>
}

const COMMANDS_BY_TYPE: CommandsByType = {
  PLACE_INITIAL_SETTLEMENT: {
    type: 'PLACE_INITIAL_SETTLEMENT',
    vertexId: 'vertex:stage-12' as VertexId,
  },
  PLACE_INITIAL_ROAD: { type: 'PLACE_INITIAL_ROAD', edgeId: 'edge:stage-12' as EdgeId },
  ROLL_DICE: { type: 'ROLL_DICE' },
  DISCARD_RESOURCES: { type: 'DISCARD_RESOURCES', resources: empty },
  MOVE_ROBBER: { type: 'MOVE_ROBBER', tileId: 'tile:stage-12' as TileId },
  STEAL_FROM_PLAYER: { type: 'STEAL_FROM_PLAYER', targetPlayerId: PLAYER_IDS.merchant },
  BUILD_ROAD: { type: 'BUILD_ROAD', edgeId: 'edge:stage-12' as EdgeId },
  BUILD_SETTLEMENT: { type: 'BUILD_SETTLEMENT', vertexId: 'vertex:stage-12' as VertexId },
  UPGRADE_CITY: { type: 'UPGRADE_CITY', vertexId: 'vertex:stage-12' as VertexId },
  BUY_DEVELOPMENT_CARD: { type: 'BUY_DEVELOPMENT_CARD' },
  PLAY_DEVELOPMENT_CARD: {
    type: 'PLAY_DEVELOPMENT_CARD',
    cardId: 'development-card:stage-12' as DevelopmentCardId,
  },
  CHOOSE_INVENTION_RESOURCES: { type: 'CHOOSE_INVENTION_RESOURCES', resources: empty },
  CHOOSE_MONOPOLY_RESOURCE: { type: 'CHOOSE_MONOPOLY_RESOURCE', resource: 'ORE' },
  FINISH_FREE_ROAD_PLACEMENT: { type: 'FINISH_FREE_ROAD_PLACEMENT' },
  PROPOSE_TRADE: { type: 'PROPOSE_TRADE', offer },
  ACCEPT_TRADE: { type: 'ACCEPT_TRADE', tradeId },
  REJECT_TRADE: { type: 'REJECT_TRADE', tradeId },
  COUNTER_TRADE: { type: 'COUNTER_TRADE', previousTradeId: tradeId, offer },
  MARITIME_TRADE: {
    type: 'MARITIME_TRADE',
    giveResource: 'LUMBER',
    receiveResource: 'ORE',
  },
  END_TURN: { type: 'END_TURN' },
}

function deterministicSetupAndRoll(seed: string): ReturnType<typeof gameEngine.createGame> {
  let state = gameEngine.createGame(config(), seed)
  let commandIndex = 0
  while (state.turn.phase === 'SETUP_SETTLEMENT' || state.turn.phase === 'SETUP_ROAD') {
    const actorId = state.turn.currentPlayerId
    const view = gameEngine.createPlayerView(state, actorId)
    const command: GameCommand = state.turn.phase === 'SETUP_SETTLEMENT'
      ? {
          type: 'PLACE_INITIAL_SETTLEMENT',
          vertexId: view.legalActions.legalInitialSettlementVertexIds?.[0]
            ?? (() => { throw new Error('Missing legal setup settlement.') })(),
        }
      : {
          type: 'PLACE_INITIAL_ROAD',
          edgeId: view.legalActions.legalInitialRoadEdgeIds?.[0]
            ?? (() => { throw new Error('Missing legal setup road.') })(),
        }
    const beforeVersion = state.stateVersion
    const result = gameEngine.execute(state, {
      commandId: `command:stage-12:${commandIndex}` as CommandId,
      actorId,
      expectedStateVersion: beforeVersion,
      command,
    })
    if (!result.ok) throw new Error(`Setup replay failed with ${result.violation.code}.`)
    expect(result.state.stateVersion).toBe(beforeVersion + 1)
    state = result.state
    commandIndex += 1
  }

  const roll = gameEngine.execute(state, {
    commandId: `command:stage-12:${commandIndex}` as CommandId,
    actorId: state.turn.currentPlayerId,
    expectedStateVersion: state.stateVersion,
    command: { type: 'ROLL_DICE' },
  })
  if (!roll.ok) throw new Error(`Roll replay failed with ${roll.violation.code}.`)
  expect(roll.state.stateVersion).toBe(state.stateVersion + 1)
  return roll.state
}

describe('unified game engine', () => {
  it('routes every frozen command discriminant without widening the command contract', () => {
    const state = gameEngine.createGame(config(), 'STAGE-12-ROUTER')
    const commandTypes = Object.keys(COMMANDS_BY_TYPE) as GameCommand['type'][]
    expect(commandTypes).toHaveLength(20)
    for (const type of commandTypes) {
      const result = executeGameCommand(state, {
        commandId: `command:stage-12:router:${type}` as CommandId,
        actorId: state.turn.currentPlayerId,
        expectedStateVersion: state.stateVersion,
        command: COMMANDS_BY_TYPE[type],
      })
      expect(result.ok).toBe(false)
    }
  })

  it('replays setup and the first roll deterministically through only the unified boundary', () => {
    const first = deterministicSetupAndRoll('STAGE-12-DETERMINISTIC-REPLAY')
    const second = deterministicSetupAndRoll('STAGE-12-DETERMINISTIC-REPLAY')
    expect(first).toEqual(second)
    expect(first.stateVersion).toBe(17)
    expect(first.random).toEqual(second.random)
  })

  it('preserves focused-executor validation precedence for stale and unknown actors', () => {
    const state = gameEngine.createGame(config(), 'STAGE-12-VALIDATION')
    const stale = gameEngine.execute(state, {
      commandId: 'command:stage-12:stale' as CommandId,
      actorId: 'player:missing' as PlayerId,
      expectedStateVersion: state.stateVersion + 1,
      command: { type: 'ROLL_DICE' },
    })
    expect(stale).toEqual({
      ok: false,
      violation: {
        code: 'STALE_STATE_VERSION',
        details: { expected: 1, actual: 0 },
      },
    })
  })

  it('fails corrupt authoritative state with an actionable invariant error', () => {
    const state = gameEngine.createGame(config(), 'STAGE-12-CORRUPT')
    const corrupt = {
      ...state,
      bank: {
        ...state.bank,
        resources: { ...state.bank.resources, LUMBER: state.bank.resources.LUMBER - 1 },
      },
    }
    expect(() => gameEngine.execute(corrupt, {
      commandId: 'command:stage-12:corrupt' as CommandId,
      actorId: state.turn.currentPlayerId,
      expectedStateVersion: state.stateVersion,
      command: { type: 'ROLL_DICE' },
    })).toThrow(/LUMBER bank-plus-player total/)
  })
})
