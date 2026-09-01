import type { DevelopmentCardDefinition } from './development-card.ts'
import type { ResourceBag } from './resource.ts'

export interface BankState {
  readonly resources: ResourceBag
  readonly developmentDeck: readonly DevelopmentCardDefinition[]
}

