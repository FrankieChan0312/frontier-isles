import type { GameId, PlayerId } from './ids.ts'
import type { PlayerColor, PlayerController } from './player.ts'
import { RULESET_ID } from './ruleset.ts'

export type FourPlayerTuple<Value> = readonly [Value, Value, Value, Value]

export interface PlayerConfig {
  readonly id: PlayerId
  readonly name: string
  readonly color: PlayerColor
  readonly controller: PlayerController
}

export interface GameConfig {
  readonly gameId: GameId
  readonly rulesetId: typeof RULESET_ID
  readonly players: FourPlayerTuple<PlayerConfig>
}

