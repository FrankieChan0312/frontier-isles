import type { DevelopmentCardId } from './ids.ts'

export type DevelopmentCardType =
  | 'KNIGHT'
  | 'ROAD_BUILDING'
  | 'MONOPOLY'
  | 'INVENTION'
  | 'VICTORY_POINT'

export type DevelopmentCardStatus = 'IN_HAND' | 'PLAYED' | 'REVEALED'

export interface DevelopmentCardDefinition {
  readonly id: DevelopmentCardId
  readonly type: DevelopmentCardType
}

export interface OwnedDevelopmentCard {
  readonly id: DevelopmentCardId
  readonly type: DevelopmentCardType
  readonly acquiredTurnNumber: number
  readonly status: DevelopmentCardStatus
}

