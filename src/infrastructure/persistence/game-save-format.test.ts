import type { AiProfileId, PlayerId } from '../../game/model/ids.ts'
import { createCompletedGoldenSetup, GOLDEN_PLAYER_IDS } from '../../game/engine/task-05-golden-fixture.test-helper.ts'
import {
  GAME_SAVE_SCHEMA_VERSION,
  parseGameSave,
  serializeGameSave,
  type GameSaveEnvelope,
} from './game-save-format.ts'

function validSave(): GameSaveEnvelope {
  const state = createCompletedGoldenSetup()
  return {
    schemaVersion: GAME_SAVE_SCHEMA_VERSION,
    savedAt: '2026-09-02T12:00:00.000Z',
    gameId: state.gameId,
    displaySeed: state.random.seed,
    humanPlayerId: GOLDEN_PLAYER_IDS.human,
    aiProfileAssignments: {
      [GOLDEN_PLAYER_IDS.sentinel]: 'SENTINEL' as AiProfileId,
      [GOLDEN_PLAYER_IDS.merchant]: 'MERCHANT' as AiProfileId,
      [GOLDEN_PLAYER_IDS.builder]: 'BUILDER' as AiProfileId,
    },
    orchestration: {
      commandCounter: 16,
      commandCountThisGame: 16,
      turnIdentity: `turn:1:${state.turn.currentPlayerId}`,
      commandKeysThisTurn: [],
    },
    state,
  }
}

describe('versioned game save format', () => {
  it('round-trips an invariant-valid deterministic authoritative save', () => {
    const save = validSave()
    const parsed = parseGameSave(serializeGameSave(save))
    expect(parsed).toEqual({ ok: true, save })
    if (parsed.ok) expect(parsed.save.state).toEqual(save.state)
  })

  it('rejects malformed JSON, unsupported versions, and corrupt authoritative state cleanly', () => {
    expect(parseGameSave('{')).toEqual({ ok: false, error: 'Saved game is not valid JSON.' })
    expect(parseGameSave(JSON.stringify({ ...validSave(), schemaVersion: 99 })))
      .toEqual({ ok: false, error: 'Unsupported save schema version 99.' })
    const save = validSave()
    const corrupt = {
      ...save,
      state: {
        ...save.state,
        bank: {
          ...save.state.bank,
          resources: { ...save.state.bank.resources, ORE: -1 },
        },
      },
    }
    const parsed = parseGameSave(JSON.stringify(corrupt))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toMatch(/Saved authoritative state is invalid/)
  })

  it('rejects mismatched Human identity and incomplete AI metadata', () => {
    const save = validSave()
    const wrongHuman = {
      ...save,
      humanPlayerId: GOLDEN_PLAYER_IDS.merchant,
    }
    expect(parseGameSave(JSON.stringify(wrongHuman))).toEqual({
      ok: false,
      error: 'Saved Human player does not match authoritative state.',
    })
    const missingProfile = {
      ...save,
      aiProfileAssignments: {
        [GOLDEN_PLAYER_IDS.sentinel]: 'SENTINEL',
        [GOLDEN_PLAYER_IDS.merchant]: 'MERCHANT',
      },
    }
    expect(parseGameSave(JSON.stringify(missingProfile))).toEqual({
      ok: false,
      error: 'Saved AI profile assignments are invalid.',
    })
  })

  it('does not accept an unknown player as the Human viewer', () => {
    const save = validSave()
    const unknownHuman = { ...save, humanPlayerId: 'player:unknown' as PlayerId }
    expect(parseGameSave(JSON.stringify(unknownHuman)).ok).toBe(false)
  })
})
