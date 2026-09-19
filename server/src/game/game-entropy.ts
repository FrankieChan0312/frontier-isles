import { randomBytes, randomUUID } from 'node:crypto'
import { gameIdSchema } from '@frontier-isles/realtime-contracts'
import type { GameId } from '@frontier-isles/game-core/model/ids'

export interface GameIdentity {
  readonly gameId: GameId
  readonly seed: string
}

/** Network entropy chooses the seed once; all subsequent game draws remain in game-core. */
export function createGameIdentity(): GameIdentity {
  return { gameId: gameIdSchema.parse(`game:${randomUUID()}`), seed: randomBytes(32).toString('hex') }
}
