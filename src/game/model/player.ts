import type { OwnedDevelopmentCard } from './development-card.ts'
import type { AiProfileId, PlayerId } from './ids.ts'
import type { ResourceBag } from './resource.ts'

export type PlayerColor = 'RED' | 'BLUE' | 'ORANGE' | 'WHITE'

export type PlayerController =
  | { readonly type: 'HUMAN' }
  | { readonly type: 'AI'; readonly profileId: AiProfileId }

export interface PlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly color: PlayerColor
  readonly controller: PlayerController
  readonly resources: ResourceBag
  readonly developmentCards: readonly OwnedDevelopmentCard[]
  readonly playedKnights: number
}

