import type { GameConfig } from '../game/model/game-config.ts'
import type { AiProfileId, GameId, PlayerId } from '../game/model/ids.ts'
import { RULESET_ID } from '../game/model/ruleset.ts'

export const BROWSER_PLAYER_IDS = {
  human: 'player:browser:human' as PlayerId,
  merchant: 'player:browser:merchant' as PlayerId,
  builder: 'player:browser:builder' as PlayerId,
  sentinel: 'player:browser:sentinel' as PlayerId,
} as const

export type SeedFactory = () => string

export function createBrowserSeed(): string {
  const bytes = new Uint8Array(6)
  globalThis.crypto.getRandomValues(bytes)
  const materialized = [...bytes]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
  return `ISLES-${materialized}`
}

export function createBrowserGameConfig(humanName: string, seed: string): GameConfig {
  const normalizedName = humanName.trim() || 'Explorer'
  const normalizedSeed = seed.trim()
  return {
    gameId: `game:browser:${normalizedSeed}` as GameId,
    rulesetId: RULESET_ID,
    players: [
      {
        id: BROWSER_PLAYER_IDS.human,
        name: normalizedName,
        color: 'RED',
        controller: { type: 'HUMAN' },
      },
      {
        id: BROWSER_PLAYER_IDS.merchant,
        name: 'Mara the Merchant',
        color: 'BLUE',
        controller: { type: 'AI', profileId: 'MERCHANT' as AiProfileId },
      },
      {
        id: BROWSER_PLAYER_IDS.builder,
        name: 'Bram the Builder',
        color: 'ORANGE',
        controller: { type: 'AI', profileId: 'BUILDER' as AiProfileId },
      },
      {
        id: BROWSER_PLAYER_IDS.sentinel,
        name: 'Sela the Sentinel',
        color: 'WHITE',
        controller: { type: 'AI', profileId: 'SENTINEL' as AiProfileId },
      },
    ],
  }
}
