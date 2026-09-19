import type { AiProfileId } from '@frontier-isles/game-core/model/ids'

export type BuiltInAiProfileId = 'MERCHANT' | 'BUILDER' | 'SENTINEL'

export interface AiPersonalityProfile {
  readonly id: BuiltInAiProfileId
  readonly acceptanceThreshold: number
  readonly counterThreshold: number
  readonly initiationThreshold: number
  readonly maximumTradeAttempts: 1 | 2
  readonly tradeFrequencyWeight: number
  readonly productionWeight: number
  readonly expansionWeight: number
  readonly cityWeight: number
  readonly portWeight: number
  readonly threatWeight: number
  readonly sevenRiskWeight: number
}

export const AI_PROFILES: Readonly<Record<BuiltInAiProfileId, AiPersonalityProfile>> = Object.freeze({
  MERCHANT: Object.freeze({
    id: 'MERCHANT',
    acceptanceThreshold: -4,
    counterThreshold: -22,
    initiationThreshold: 2,
    maximumTradeAttempts: 2,
    tradeFrequencyWeight: 1.5,
    productionWeight: 1,
    expansionWeight: 1,
    cityWeight: 1,
    portWeight: 2,
    threatWeight: 0.9,
    sevenRiskWeight: 1.4,
  }),
  BUILDER: Object.freeze({
    id: 'BUILDER',
    acceptanceThreshold: 3,
    counterThreshold: -14,
    initiationThreshold: 10,
    maximumTradeAttempts: 1,
    tradeFrequencyWeight: 0.8,
    productionWeight: 1.5,
    expansionWeight: 1.6,
    cityWeight: 1.5,
    portWeight: 0.8,
    threatWeight: 1.1,
    sevenRiskWeight: 1,
  }),
  SENTINEL: Object.freeze({
    id: 'SENTINEL',
    acceptanceThreshold: 8,
    counterThreshold: -8,
    initiationThreshold: 16,
    maximumTradeAttempts: 1,
    tradeFrequencyWeight: 0.6,
    productionWeight: 1,
    expansionWeight: 0.9,
    cityWeight: 1.1,
    portWeight: 0.7,
    threatWeight: 2.4,
    sevenRiskWeight: 1.1,
  }),
})

export const BUILT_IN_AI_PROFILE_IDS = [
  'MERCHANT',
  'BUILDER',
  'SENTINEL',
] as const satisfies readonly BuiltInAiProfileId[]

export function resolveAiPersonality(profileId: AiProfileId | undefined): AiPersonalityProfile {
  const normalized = String(profileId ?? 'BUILDER').toUpperCase()
  if (normalized.includes('MERCHANT')) return AI_PROFILES.MERCHANT
  if (normalized.includes('SENTINEL')) return AI_PROFILES.SENTINEL
  return AI_PROFILES.BUILDER
}

export function asAiProfileId(profileId: BuiltInAiProfileId): AiProfileId {
  return profileId as AiProfileId
}
