import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'
import type { PlayerEventView } from '@frontier-isles/game-core/contracts/player-events'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import type { GameUpdate, GatewayConnectionStatus, GatewaySaveStatus } from '../gateways/game-gateway.ts'

export interface GameSessionStoreState {
  readonly view: PlayerView | null
  readonly recentEvents: readonly PlayerEventView[]
  readonly connectionStatus: GatewayConnectionStatus
  readonly aiThinking: boolean
  readonly saveStatus: GatewaySaveStatus
  readonly error: string | null
  readonly submitting: boolean
  readonly resynchronizing: boolean
  readonly applyGatewayUpdate: (update: GameUpdate) => void
  readonly clearError: () => void
  readonly reset: () => void
}

const INITIAL_SESSION_STATE = {
  view: null,
  recentEvents: [] as readonly PlayerEventView[],
  connectionStatus: 'IDLE' as GatewayConnectionStatus,
  aiThinking: false,
  saveStatus: 'IDLE' as GatewaySaveStatus,
  error: null,
  submitting: false,
  resynchronizing: false,
}

export function createGameSessionStore(): StoreApi<GameSessionStoreState> {
  return createStore<GameSessionStoreState>((set) => ({
    ...INITIAL_SESSION_STATE,
    applyGatewayUpdate: (update): void => set((state) => ({
      view: update.view,
      recentEvents: [...(update.view === null || state.view?.self.id !== update.view.self.id
        || state.view.publicGame.gameId !== update.view.publicGame.gameId ? [] : state.recentEvents), ...update.events].slice(-100),
      connectionStatus: update.connectionStatus,
      aiThinking: update.aiThinking,
      saveStatus: update.saveStatus,
      error: update.error,
      submitting: update.submitting ?? false,
      resynchronizing: update.resynchronizing ?? false,
    })),
    clearError: (): void => set({ error: null }),
    reset: (): void => set(INITIAL_SESSION_STATE),
  }))
}

export type GameSessionStore = StoreApi<GameSessionStoreState>
