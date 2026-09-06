import { expectTypeOf } from 'vitest'
import { assertNever } from '../model/assert-never.ts'
import type { BoardState } from '../model/board-state.ts'
import type { OwnedDevelopmentCard } from '../model/development-card.ts'
import type { GameState } from '../model/game-state.ts'
import type {
  AiProfileId,
  DevelopmentCardId,
  EdgeId,
  GameId,
  PlayerId,
  TileId,
  TradeId,
  VertexId,
} from '../model/ids.ts'
import type { PlayerController, PlayerState } from '../model/player.ts'
import { createEmptyResourceBag } from '../model/resource.ts'
import {
  BOARD_GENERATOR_VERSION,
  GAME_STATE_SCHEMA_VERSION,
  RANDOM_ALGORITHM_ID,
  RULESET_ID,
} from '../model/ruleset.ts'
import type { TradeOffer } from '../model/trade.ts'
import type { GameCommand } from './commands.ts'
import type { GameEvent } from './events.ts'
import type { PlayerView, PublicPlayerState } from './views.ts'

const gameId = 'game-contract-fixture' as GameId
const playerA = 'player-a' as PlayerId
const playerB = 'player-b' as PlayerId
const playerC = 'player-c' as PlayerId
const playerD = 'player-d' as PlayerId
const tileId = 'tile-contract-fixture' as TileId
const previousTileId = 'tile-previous-contract-fixture' as TileId
const vertexId = 'vertex-contract-fixture' as VertexId
const edgeId = 'edge-contract-fixture' as EdgeId
const cardId = 'card-contract-fixture' as DevelopmentCardId
const tradeId = 'trade-contract-fixture' as TradeId
const previousTradeId = 'trade-previous-contract-fixture' as TradeId
const aiProfileId = 'normal-contract-fixture' as AiProfileId

const emptyResources = createEmptyResourceBag()

const offer: TradeOffer = {
  tradeId,
  initiatorId: playerA,
  counterpartyId: playerB,
  proposedById: playerA,
  initiatorGives: { ...emptyResources, LUMBER: 1 },
  counterpartyGives: { ...emptyResources, BRICK: 1 },
  parentTradeId: null,
}

const commands: readonly GameCommand[] = [
  { type: 'PLACE_INITIAL_SETTLEMENT', vertexId },
  { type: 'PLACE_INITIAL_ROAD', edgeId },
  { type: 'ROLL_DICE' },
  { type: 'DISCARD_RESOURCES', resources: emptyResources },
  { type: 'MOVE_ROBBER', tileId },
  { type: 'STEAL_FROM_PLAYER', targetPlayerId: playerB },
  { type: 'BUILD_ROAD', edgeId },
  { type: 'BUILD_SETTLEMENT', vertexId },
  { type: 'UPGRADE_CITY', vertexId },
  { type: 'BUY_DEVELOPMENT_CARD' },
  { type: 'PLAY_DEVELOPMENT_CARD', cardId },
  { type: 'CHOOSE_INVENTION_RESOURCES', resources: emptyResources },
  { type: 'CHOOSE_MONOPOLY_RESOURCE', resource: 'ORE' },
  { type: 'FINISH_FREE_ROAD_PLACEMENT' },
  { type: 'PROPOSE_TRADE', offer },
  { type: 'ACCEPT_TRADE', tradeId },
  { type: 'REJECT_TRADE', tradeId },
  { type: 'COUNTER_TRADE', previousTradeId, offer: { ...offer, parentTradeId: previousTradeId } },
  { type: 'MARITIME_TRADE', giveResource: 'LUMBER', receiveResource: 'ORE' },
  { type: 'END_TURN' },
]

const events: readonly GameEvent[] = [
  { type: 'DICE_ROLLED', playerId: playerA, roll: { dice: [3, 4], total: 7 } },
  {
    type: 'RESOURCE_PRODUCED',
    playerId: playerA,
    tileId,
    resource: 'LUMBER',
    quantity: 1,
  },
  {
    type: 'RESOURCE_PRODUCTION_BLOCKED',
    resource: 'ORE',
    affectedPlayerIds: [playerA, playerB],
    reason: 'BANK_SHORTAGE',
  },
  { type: 'RESOURCES_DISCARDED', playerId: playerA, resources: emptyResources },
  {
    type: 'ROBBER_MOVED',
    playerId: playerA,
    fromTileId: previousTileId,
    toTileId: tileId,
    cause: { type: 'DICE_SEVEN' },
  },
  { type: 'RESOURCE_STOLEN', fromPlayerId: playerB, toPlayerId: playerA, resource: 'WOOL' },
  { type: 'ROAD_BUILT', ownerId: playerA, edgeId, source: 'PAID_BUILD' },
  { type: 'SETTLEMENT_BUILT', ownerId: playerA, vertexId, source: 'PAID_BUILD' },
  { type: 'CITY_BUILT', ownerId: playerA, vertexId },
  {
    type: 'DEVELOPMENT_CARD_BOUGHT',
    ownerId: playerA,
    cardId,
    cardType: 'KNIGHT',
    acquiredTurnNumber: 1,
  },
  {
    type: 'DEVELOPMENT_CARD_PLAYED',
    ownerId: playerA,
    cardId,
    cardType: 'KNIGHT',
  },
  { type: 'TRADE_PROPOSED', offer },
  { type: 'TRADE_REJECTED', tradeId, rejectedById: playerB },
  { type: 'TRADE_COUNTERED', previousTradeId, offer },
  { type: 'TRADE_COMPLETED', offer },
  {
    type: 'MARITIME_TRADE_COMPLETED',
    playerId: playerA,
    giveResource: 'LUMBER',
    receiveResource: 'ORE',
    ratio: 4,
  },
  { type: 'LONGEST_ROAD_CHANGED', previousHolderId: null, newHolderId: playerA },
  { type: 'LARGEST_ARMY_CHANGED', previousHolderId: null, newHolderId: playerA },
  { type: 'TURN_STARTED', playerId: playerA, turnNumber: 1 },
  { type: 'TURN_ENDED', playerId: playerA, turnNumber: 1 },
  { type: 'GAME_WON', winnerId: playerA, actualVictoryPoints: 10 },
]

function readCommandType(command: GameCommand): GameCommand['type'] {
  switch (command.type) {
    case 'PLACE_INITIAL_SETTLEMENT':
    case 'PLACE_INITIAL_ROAD':
    case 'ROLL_DICE':
    case 'DISCARD_RESOURCES':
    case 'MOVE_ROBBER':
    case 'STEAL_FROM_PLAYER':
    case 'BUILD_ROAD':
    case 'BUILD_SETTLEMENT':
    case 'UPGRADE_CITY':
    case 'BUY_DEVELOPMENT_CARD':
    case 'PLAY_DEVELOPMENT_CARD':
    case 'CHOOSE_INVENTION_RESOURCES':
    case 'CHOOSE_MONOPOLY_RESOURCE':
    case 'FINISH_FREE_ROAD_PLACEMENT':
    case 'PROPOSE_TRADE':
    case 'ACCEPT_TRADE':
    case 'REJECT_TRADE':
    case 'COUNTER_TRADE':
    case 'MARITIME_TRADE':
    case 'END_TURN':
      return command.type
    default:
      return assertNever(command)
  }
}

function readEventType(event: GameEvent): GameEvent['type'] {
  switch (event.type) {
    case 'DICE_ROLLED':
    case 'RESOURCE_PRODUCED':
    case 'RESOURCE_PRODUCTION_BLOCKED':
    case 'RESOURCES_DISCARDED':
    case 'ROBBER_MOVED':
    case 'RESOURCE_STOLEN':
    case 'ROAD_BUILT':
    case 'SETTLEMENT_BUILT':
    case 'CITY_BUILT':
    case 'DEVELOPMENT_CARD_BOUGHT':
    case 'DEVELOPMENT_CARD_PLAYED':
    case 'TRADE_PROPOSED':
    case 'TRADE_REJECTED':
    case 'TRADE_COUNTERED':
    case 'TRADE_COMPLETED':
    case 'MARITIME_TRADE_COMPLETED':
    case 'LONGEST_ROAD_CHANGED':
    case 'LARGEST_ARMY_CHANGED':
    case 'TURN_STARTED':
    case 'TURN_ENDED':
    case 'GAME_WON':
      return event.type
    default:
      return assertNever(event)
  }
}

function createPlayerState(
  id: PlayerId,
  name: string,
  controller: PlayerController,
): PlayerState {
  return {
    id,
    name,
    color: id === playerA ? 'RED' : id === playerB ? 'BLUE' : id === playerC ? 'ORANGE' : 'WHITE',
    controller,
    resources: emptyResources,
    developmentCards: [],
    playedKnights: 0,
  }
}

const board: BoardState = {
  generatorVersion: BOARD_GENERATOR_VERSION,
  topology: { tiles: {}, vertices: {}, edges: {}, ports: {} },
  tileContents: {},
  vertexOccupancy: {},
  edgeOccupancy: {},
  robberTileId: tileId,
}

const humanController: PlayerController = { type: 'HUMAN' }
const aiController: PlayerController = { type: 'AI', profileId: aiProfileId }

const playerStateA = createPlayerState(playerA, 'Player A', humanController)
const playerStateB = createPlayerState(playerB, 'Player B', aiController)
const playerStateC = createPlayerState(playerC, 'Player C', aiController)
const playerStateD = createPlayerState(playerD, 'Player D', aiController)

const contractGameStateFixture: GameState = {
  schemaVersion: GAME_STATE_SCHEMA_VERSION,
  gameId,
  stateVersion: 0,
  rulesetId: RULESET_ID,
  board,
  players: {
    [playerA]: playerStateA,
    [playerB]: playerStateB,
    [playerC]: playerStateC,
    [playerD]: playerStateD,
  },
  playerOrder: [playerA, playerB, playerC, playerD],
  bank: { resources: emptyResources, developmentDeck: [] },
  turn: {
    turnNumber: 0,
    currentPlayerId: playerA,
    phase: 'SETUP_SETTLEMENT',
    setup: { round: 1, placementIndex: 0, pendingSettlementVertexId: null },
    lastRoll: null,
    developmentCardPlayedThisTurn: false,
  },
  awards: { longestRoadHolderId: null, largestArmyHolderId: null },
  pendingDecision: null,
  random: { algorithm: RANDOM_ALGORITHM_ID, seed: 'contract-seed', state: 1, drawCount: 0 },
  winnerId: null,
}

const ownedCard: OwnedDevelopmentCard = {
  id: cardId,
  type: 'VICTORY_POINT',
  acquiredTurnNumber: 1,
  status: 'IN_HAND',
}

const publicOpponent: PublicPlayerState = {
  id: playerB,
  name: 'Player B',
  color: 'BLUE',
  controller: aiController,
  resourceCardCount: 2,
  developmentCardCount: 1,
  playedKnights: 0,
  publicVictoryPoints: 2,
}

const contractPlayerViewFixture: PlayerView = {
  stateVersion: 0,
  publicGame: {
    gameId,
    stateVersion: 0,
    rulesetId: RULESET_ID,
    board,
    bank: { resources: emptyResources, developmentDeckCount: 24 },
    turn: contractGameStateFixture.turn,
    awards: contractGameStateFixture.awards,
    winnerId: null,
  },
  self: {
    id: playerA,
    name: 'Player A',
    color: 'RED',
    controller: humanController,
    resources: { ...emptyResources, ORE: 2 },
    developmentCards: [ownedCard],
    playedKnights: 0,
    publicVictoryPoints: 2,
    actualVictoryPoints: 3,
  },
  opponents: [publicOpponent],
  pendingDecision: null,
  legalActions: {
    canRollDice: false,
    canEndTurn: false,
    canBuyDevelopmentCard: false,
    canProposeTrade: false,
    legalRoadEdgeIds: [],
    legalSettlementVertexIds: [vertexId],
    legalCityUpgradeVertexIds: [],
    legalRobberTileIds: [],
    eligibleRobberTargetPlayerIds: [],
    requiredDiscardCount: null,
    playableDevelopmentCardIds: [],
    legalMaritimeTradeOptions: [],
  },
}

describe('domain contracts', () => {
  it('keeps branded identifiers distinct at compile time', () => {
    expectTypeOf<GameId>().not.toEqualTypeOf<PlayerId>()

    const trustedGameId = 'trusted-game-id' as GameId
    // @ts-expect-error A GameId cannot be assigned to a PlayerId.
    const invalidPlayerId: PlayerId = trustedGameId

    expect(invalidPlayerId).toBe(trustedGameId)
  })

  it('represents and exhaustively handles every command discriminant', () => {
    expect(commands.map(readCommandType)).toEqual([
      'PLACE_INITIAL_SETTLEMENT',
      'PLACE_INITIAL_ROAD',
      'ROLL_DICE',
      'DISCARD_RESOURCES',
      'MOVE_ROBBER',
      'STEAL_FROM_PLAYER',
      'BUILD_ROAD',
      'BUILD_SETTLEMENT',
      'UPGRADE_CITY',
      'BUY_DEVELOPMENT_CARD',
      'PLAY_DEVELOPMENT_CARD',
      'CHOOSE_INVENTION_RESOURCES',
      'CHOOSE_MONOPOLY_RESOURCE',
      'FINISH_FREE_ROAD_PLACEMENT',
      'PROPOSE_TRADE',
      'ACCEPT_TRADE',
      'REJECT_TRADE',
      'COUNTER_TRADE',
      'MARITIME_TRADE',
      'END_TURN',
    ])
  })

  it('represents and exhaustively handles every event discriminant', () => {
    expect(events.map(readEventType)).toEqual([
      'DICE_ROLLED',
      'RESOURCE_PRODUCED',
      'RESOURCE_PRODUCTION_BLOCKED',
      'RESOURCES_DISCARDED',
      'ROBBER_MOVED',
      'RESOURCE_STOLEN',
      'ROAD_BUILT',
      'SETTLEMENT_BUILT',
      'CITY_BUILT',
      'DEVELOPMENT_CARD_BOUGHT',
      'DEVELOPMENT_CARD_PLAYED',
      'TRADE_PROPOSED',
      'TRADE_REJECTED',
      'TRADE_COUNTERED',
      'TRADE_COMPLETED',
      'MARITIME_TRADE_COMPLETED',
      'LONGEST_ROAD_CHANGED',
      'LARGEST_ARMY_CHANGED',
      'TURN_STARTED',
      'TURN_ENDED',
      'GAME_WON',
    ])
  })

  it('serializes the synthetic contract GameState fixture as plain JSON', () => {
    const serialized = JSON.stringify(contractGameStateFixture)
    const parsed: unknown = JSON.parse(serialized)

    expect(parsed).toEqual(contractGameStateFixture)
  })

  it('keeps opponent private composition out of PlayerView', () => {
    expect(contractPlayerViewFixture.opponents[0]).toEqual(publicOpponent)
    expect(contractPlayerViewFixture.opponents[0]).not.toHaveProperty('resources')
    expect(contractPlayerViewFixture.opponents[0]).not.toHaveProperty('developmentCards')
    expect(contractPlayerViewFixture.self.resources.ORE).toBe(2)
    expect(contractPlayerViewFixture.self.developmentCards).toEqual([ownedCard])
    expect(contractPlayerViewFixture.publicGame.bank).not.toHaveProperty('developmentDeck')
  })
})
