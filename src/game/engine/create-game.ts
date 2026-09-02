import { createStandardInitialBoard } from '../board/standard-board-content.ts'
import type { FourPlayerTuple, GameConfig, PlayerConfig } from '../model/game-config.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerId } from '../model/ids.ts'
import type { PlayerController, PlayerState } from '../model/player.ts'
import { createEmptyResourceBag } from '../model/resource.ts'
import { GAME_STATE_SCHEMA_VERSION, RULESET_ID } from '../model/ruleset.ts'
import { createStandardBankResources } from '../model/standard-bank.ts'
import { STANDARD_DEVELOPMENT_DECK_SOURCE } from '../model/standard-development-deck.ts'
import {
  createInitialRandomState,
  nextRandomInt,
  shuffleWithRandom,
} from '../random/seeded-random.ts'
import { assertCreatedGameState, assertValidGameConfig } from './game-creation-invariants.ts'

function cloneController(controller: PlayerController): PlayerController {
  return controller.type === 'HUMAN'
    ? { type: 'HUMAN' }
    : { type: 'AI', profileId: controller.profileId }
}

function rotatePlayers(
  players: FourPlayerTuple<PlayerConfig>,
  firstIndex: number,
): FourPlayerTuple<PlayerConfig> {
  const rotated = [0, 1, 2, 3].map((offset) => players[(firstIndex + offset) % 4])
  const [first, second, third, fourth] = rotated
  if (first === undefined || second === undefined || third === undefined || fourth === undefined) {
    throw new Error(`Game creation could not rotate players from index ${firstIndex}.`)
  }
  return [first, second, third, fourth]
}

export function createGame(config: GameConfig, seed: string): GameState {
  assertValidGameConfig(config)
  const initialRandom = createInitialRandomState(seed)
  const boardResult = createStandardInitialBoard(initialRandom)
  const firstPlayerResult = nextRandomInt(boardResult.random, 0, 4)
  const rotatedPlayers = rotatePlayers(config.players, firstPlayerResult.value)
  const deckResult = shuffleWithRandom(STANDARD_DEVELOPMENT_DECK_SOURCE, firstPlayerResult.random)

  const players: Record<PlayerId, PlayerState> = {}
  for (const playerConfig of config.players) {
    players[playerConfig.id] = {
      id: playerConfig.id,
      name: playerConfig.name,
      color: playerConfig.color,
      controller: cloneController(playerConfig.controller),
      resources: createEmptyResourceBag(),
      developmentCards: [],
      playedKnights: 0,
    }
  }

  const playerOrder: FourPlayerTuple<PlayerId> = [
    rotatedPlayers[0].id,
    rotatedPlayers[1].id,
    rotatedPlayers[2].id,
    rotatedPlayers[3].id,
  ]
  const state: GameState = {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    gameId: config.gameId,
    stateVersion: 0,
    rulesetId: RULESET_ID,
    board: boardResult.value,
    players,
    playerOrder,
    bank: {
      resources: createStandardBankResources(),
      developmentDeck: deckResult.value.map((card) => ({ id: card.id, type: card.type })),
    },
    turn: {
      turnNumber: 0,
      currentPlayerId: playerOrder[0],
      phase: 'SETUP_SETTLEMENT',
      setup: { round: 1, placementIndex: 0, pendingSettlementVertexId: null },
      lastRoll: null,
      developmentCardPlayedThisTurn: false,
    },
    awards: { longestRoadHolderId: null, largestArmyHolderId: null },
    pendingDecision: null,
    random: deckResult.random,
    winnerId: null,
  }

  assertCreatedGameState(state)
  return state
}
