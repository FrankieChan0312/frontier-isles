import type { CommandEnvelope } from '../../game/contracts/commands.ts'
import type { RuleViolation } from '../../game/contracts/errors.ts'
import type { PlayerEventView } from '../../game/contracts/player-events.ts'
import type { PlayerView } from '../../game/contracts/views.ts'
import type { GameConfig } from '../../game/model/game-config.ts'
import type { GameId } from '../../game/model/ids.ts'

export type GatewayConnectionStatus = 'IDLE' | 'READY' | 'ERROR'
export type GatewaySaveStatus = 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'

export interface GameUpdate {
  readonly view: PlayerView | null
  readonly events: readonly PlayerEventView[]
  readonly connectionStatus: GatewayConnectionStatus
  readonly aiThinking: boolean
  readonly saveStatus: GatewaySaveStatus
  readonly error: string | null
}

export type CommandResponse =
  | {
      readonly ok: true
      readonly view: PlayerView
      readonly events: readonly PlayerEventView[]
    }
  | {
      readonly ok: false
      readonly violation: RuleViolation
      readonly view: PlayerView
    }

export interface GameGateway {
  createGame(config: GameConfig, seed: string): Promise<PlayerView>
  submit(envelope: CommandEnvelope): Promise<CommandResponse>
  subscribe(listener: (update: GameUpdate) => void): () => void
  saveGame(): Promise<void>
  loadGame(gameId: GameId): Promise<PlayerView>
  loadLatestGame(): Promise<PlayerView>
  hasSavedGame(): Promise<boolean>
  deleteSavedGame(): Promise<void>
}
