import type { GameState } from '../../game/model/game-state.ts'
import type { AiProfileId, GameId, PlayerId } from '../../game/model/ids.ts'
import { assertTradingState } from '../../game/engine/trading-invariants.ts'

export const GAME_SAVE_SCHEMA_VERSION = 1 as const

export interface SavedAiOrchestrationState {
  readonly commandCounter: number
  readonly commandCountThisGame: number
  readonly turnIdentity: string
  readonly commandKeysThisTurn: readonly string[]
}

export interface GameSaveEnvelope {
  readonly schemaVersion: typeof GAME_SAVE_SCHEMA_VERSION
  readonly savedAt: string
  readonly gameId: GameId
  readonly displaySeed: string
  readonly humanPlayerId: PlayerId
  readonly aiProfileAssignments: Readonly<Record<PlayerId, AiProfileId>>
  readonly orchestration: SavedAiOrchestrationState
  readonly state: GameState
}

export type GameSaveParseResult =
  | { readonly ok: true; readonly save: GameSaveEnvelope }
  | { readonly ok: false; readonly error: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function parseOrchestration(value: unknown): SavedAiOrchestrationState | null {
  if (!isObject(value)) return null
  if (
    !Number.isSafeInteger(value.commandCounter)
    || Number(value.commandCounter) < 0
    || !Number.isSafeInteger(value.commandCountThisGame)
    || Number(value.commandCountThisGame) < 0
    || !isNonEmptyString(value.turnIdentity)
    || !Array.isArray(value.commandKeysThisTurn)
    || !value.commandKeysThisTurn.every((entry) => typeof entry === 'string')
  ) return null
  return {
    commandCounter: Number(value.commandCounter),
    commandCountThisGame: Number(value.commandCountThisGame),
    turnIdentity: value.turnIdentity,
    commandKeysThisTurn: [...value.commandKeysThisTurn],
  }
}

function parseProfileAssignments(
  value: unknown,
  state: GameState,
  humanPlayerId: PlayerId,
): Readonly<Record<PlayerId, AiProfileId>> | null {
  if (!isObject(value)) return null
  const assignments = {} as Record<PlayerId, AiProfileId>
  for (const playerId of state.playerOrder) {
    if (playerId === humanPlayerId) continue
    const profileId = value[playerId]
    if (!isNonEmptyString(profileId)) return null
    assignments[playerId] = profileId as AiProfileId
  }
  const expectedKeys = state.playerOrder.filter((playerId) => playerId !== humanPlayerId)
  if (Object.keys(value).length !== expectedKeys.length) return null
  return assignments
}

export function serializeGameSave(save: GameSaveEnvelope): string {
  return JSON.stringify(save)
}

export function parseGameSave(serializedSave: string): GameSaveParseResult {
  let value: unknown
  try {
    value = JSON.parse(serializedSave)
  } catch {
    return { ok: false, error: 'Saved game is not valid JSON.' }
  }
  if (!isObject(value)) return { ok: false, error: 'Saved game envelope must be an object.' }
  if (value.schemaVersion !== GAME_SAVE_SCHEMA_VERSION) {
    return { ok: false, error: `Unsupported save schema version ${String(value.schemaVersion)}.` }
  }
  if (!isNonEmptyString(value.savedAt)) return { ok: false, error: 'Saved game timestamp is invalid.' }
  if (!isNonEmptyString(value.gameId)) return { ok: false, error: 'Saved game ID is invalid.' }
  if (!isNonEmptyString(value.displaySeed)) return { ok: false, error: 'Saved game seed is invalid.' }
  if (!isNonEmptyString(value.humanPlayerId)) return { ok: false, error: 'Saved Human player ID is invalid.' }
  if (!isObject(value.state)) return { ok: false, error: 'Saved authoritative state is missing.' }
  const state = value.state as unknown as GameState
  try {
    assertTradingState(state)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: `Saved authoritative state is invalid: ${message}` }
  }
  const humanPlayerId = value.humanPlayerId as PlayerId
  const human = state.players[humanPlayerId]
  if (human?.controller.type !== 'HUMAN') {
    return { ok: false, error: 'Saved Human player does not match authoritative state.' }
  }
  if (state.gameId !== value.gameId) return { ok: false, error: 'Saved game IDs do not match.' }
  const orchestration = parseOrchestration(value.orchestration)
  if (orchestration === null) return { ok: false, error: 'Saved AI orchestration metadata is invalid.' }
  const aiProfileAssignments = parseProfileAssignments(
    value.aiProfileAssignments,
    state,
    humanPlayerId,
  )
  if (aiProfileAssignments === null) {
    return { ok: false, error: 'Saved AI profile assignments are invalid.' }
  }
  return {
    ok: true,
    save: {
      schemaVersion: GAME_SAVE_SCHEMA_VERSION,
      savedAt: value.savedAt,
      gameId: state.gameId,
      displaySeed: value.displaySeed,
      humanPlayerId,
      aiProfileAssignments,
      orchestration,
      state,
    },
  }
}
