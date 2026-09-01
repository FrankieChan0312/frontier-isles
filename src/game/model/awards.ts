import type { PlayerId } from './ids.ts'

export interface AwardState {
  readonly longestRoadHolderId: PlayerId | null
  readonly largestArmyHolderId: PlayerId | null
}

