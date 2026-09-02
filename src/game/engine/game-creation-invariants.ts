import { assertStandardInitialBoard } from '../board/initial-board-invariants.ts'
import type { GameConfig, PlayerConfig } from '../model/game-config.ts'
import type { GameState } from '../model/game-state.ts'
import type { PlayerId } from '../model/ids.ts'
import type { PlayerColor } from '../model/player.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import {
  GAME_STATE_SCHEMA_VERSION,
  RANDOM_ALGORITHM_ID,
  RULESET_ID,
} from '../model/ruleset.ts'
import { STANDARD_BANK_RESOURCE_COUNT } from '../model/standard-bank.ts'
import { STANDARD_DEVELOPMENT_DECK_SOURCE } from '../model/standard-development-deck.ts'

const PLAYER_COLORS = ['RED', 'BLUE', 'ORANGE', 'WHITE'] as const satisfies readonly PlayerColor[]

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(`Invalid game creation state: ${message}`)
  }
}

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  assertInvariant(typeof value === 'string' && value.trim().length > 0, `${label} must be a non-empty string.`)
}

export function assertValidGameConfig(config: GameConfig): void {
  assertNonEmptyString(config.gameId, 'gameId')
  assertInvariant(config.rulesetId === RULESET_ID, `rulesetId must be ${RULESET_ID}.`)
  assertInvariant(Array.isArray(config.players) && config.players.length === 4, 'players must contain exactly four entries.')

  const ids = new Set<string>()
  const colorCounts = new Map<PlayerColor, number>()
  let humanCount = 0
  let aiCount = 0

  for (let index = 0; index < config.players.length; index += 1) {
    const player = config.players[index] as PlayerConfig | undefined
    assertInvariant(player !== undefined && player !== null && typeof player === 'object', `player ${index} must be an object.`)
    assertNonEmptyString(player.id, `player ${index} id`)
    assertInvariant(!ids.has(player.id), `player ID ${player.id} is duplicated.`)
    ids.add(player.id)
    assertNonEmptyString(player.name, `player ${index} name`)
    assertInvariant(PLAYER_COLORS.includes(player.color), `player ${player.id} has invalid color ${player.color}.`)
    colorCounts.set(player.color, (colorCounts.get(player.color) ?? 0) + 1)

    const controller: unknown = player.controller
    assertInvariant(controller !== null && typeof controller === 'object', `player ${player.id} controller must be an object.`)
    const controllerType = (controller as { readonly type?: unknown }).type
    if (controllerType === 'HUMAN') {
      humanCount += 1
    } else if (controllerType === 'AI') {
      aiCount += 1
      assertNonEmptyString(
        (controller as { readonly profileId?: unknown }).profileId,
        `AI player ${player.id} profileId`,
      )
    } else {
      throw new Error(`Invalid game creation state: player ${player.id} has an invalid controller.`)
    }
  }

  for (const color of PLAYER_COLORS) {
    assertInvariant(colorCounts.get(color) === 1, `color ${color} must appear exactly once.`)
  }
  assertInvariant(humanCount === 1, `exactly one HUMAN controller is required; found ${humanCount}.`)
  assertInvariant(aiCount === 3, `exactly three AI controllers are required; found ${aiCount}.`)
}

function assertPlainJson(value: unknown, path: string, seen: Set<object>): void {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    assertInvariant(Number.isFinite(value), `${path} contains a non-finite number.`)
    return
  }
  assertInvariant(typeof value === 'object', `${path} contains a non-JSON value.`)
  assertInvariant(!seen.has(value), `${path} contains a cycle.`)
  seen.add(value)
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPlainJson(entry, `${path}[${index}]`, seen))
  } else {
    const prototype = Object.getPrototypeOf(value)
    assertInvariant(prototype === Object.prototype || prototype === null, `${path} must use plain objects.`)
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) =>
      assertPlainJson(entry, `${path}.${key}`, seen),
    )
  }
  seen.delete(value)
}

export function assertCreatedGameState(state: GameState): void {
  assertInvariant(state.schemaVersion === GAME_STATE_SCHEMA_VERSION, 'schema version mismatch.')
  assertInvariant(state.rulesetId === RULESET_ID, 'ruleset mismatch.')
  assertInvariant(state.stateVersion === 0, 'new game stateVersion must be zero.')
  assertStandardInitialBoard(state.board)

  const playerIds = Object.keys(state.players) as PlayerId[]
  assertInvariant(playerIds.length === 4, 'new game must contain exactly four players.')
  assertInvariant(state.playerOrder.length === 4 && new Set(state.playerOrder).size === 4, 'playerOrder must contain four unique IDs.')
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId]
    assertInvariant(player !== undefined, `playerOrder references unknown player ${playerId}.`)
    assertInvariant(player.id === playerId, `player record ${playerId} stores a mismatched ID.`)
    for (const resource of RESOURCE_TYPES) {
      assertInvariant(player.resources[resource] === 0, `player ${playerId} must start with zero ${resource}.`)
    }
    assertInvariant(player.developmentCards.length === 0, `player ${playerId} must start without development cards.`)
    assertInvariant(player.playedKnights === 0, `player ${playerId} must start with zero played knights.`)
  }

  for (const resource of RESOURCE_TYPES) {
    assertInvariant(state.bank.resources[resource] === STANDARD_BANK_RESOURCE_COUNT, `bank must start with ${STANDARD_BANK_RESOURCE_COUNT} ${resource}.`)
  }
  assertInvariant(state.bank.developmentDeck.length === 25, 'development deck must contain 25 cards.')
  const expectedCardIds = new Set(STANDARD_DEVELOPMENT_DECK_SOURCE.map((card) => card.id))
  const actualCardIds = state.bank.developmentDeck.map((card) => card.id)
  assertInvariant(new Set(actualCardIds).size === 25, 'development deck IDs must be unique.')
  assertInvariant(actualCardIds.every((id) => expectedCardIds.has(id)), 'development deck contains an unknown card ID.')

  assertInvariant(state.turn.turnNumber === 0, 'setup must begin at turn number zero.')
  assertInvariant(state.turn.currentPlayerId === state.playerOrder[0], 'setup must begin with playerOrder[0].')
  assertInvariant(state.turn.phase === 'SETUP_SETTLEMENT', 'new game must begin in SETUP_SETTLEMENT.')
  assertInvariant(state.turn.setup?.round === 1 && state.turn.setup.placementIndex === 0, 'new setup must begin at round 1 index 0.')
  assertInvariant(state.turn.setup?.pendingSettlementVertexId === null, 'new setup must not have a pending settlement.')
  assertInvariant(state.turn.lastRoll === null, 'new game must not have a dice roll.')
  assertInvariant(!state.turn.developmentCardPlayedThisTurn, 'new game cannot have played a development card.')
  assertInvariant(state.awards.longestRoadHolderId === null && state.awards.largestArmyHolderId === null, 'awards must begin unheld.')
  assertInvariant(state.pendingDecision === null, 'new game must not have a pending decision.')
  assertInvariant(state.winnerId === null, 'new game must not have a winner.')
  assertInvariant(state.random.algorithm === RANDOM_ALGORITHM_ID, 'random algorithm mismatch.')
  assertInvariant(state.random.seed.length > 0, 'random seed must be non-empty.')
  assertInvariant(Number.isInteger(state.random.state) && state.random.state > 0 && state.random.state <= 0xffff_ffff, 'random state must be a non-zero uint32.')
  assertInvariant(Number.isSafeInteger(state.random.drawCount) && state.random.drawCount >= 0, 'random drawCount must be non-negative.')
  assertPlainJson(state, 'state', new Set())
}
