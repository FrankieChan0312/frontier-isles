import type { CommandEnvelope } from '@frontier-isles/game-core/contracts/commands'
import type { RuleViolation } from '@frontier-isles/game-core/contracts/errors'
import type { PlayerEventView } from '@frontier-isles/game-core/contracts/player-events'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import type { GameConfig } from '@frontier-isles/game-core/model/game-config'
import type { GameId } from '@frontier-isles/game-core/model/ids'
import type { GameDeliveryState, GamePresence } from '@frontier-isles/realtime-contracts'

export type GatewayConnectionStatus = 'IDLE' | 'READY' | 'ERROR' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED'
export type GatewaySaveStatus = 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR'

export interface GameUpdate {
  readonly view: PlayerView | null
  readonly events: readonly PlayerEventView[]
  readonly connectionStatus: GatewayConnectionStatus
  readonly aiThinking: boolean
  readonly saveStatus: GatewaySaveStatus
  readonly error: string | null
  readonly submitting?: boolean
  readonly resynchronizing?: boolean
  readonly delivery?: GameDeliveryState
  readonly presence?: GamePresence
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

export interface OnlineGameGateway extends GameGateway {
  requestSnapshot(): Promise<void>
  dispose(): void
}
