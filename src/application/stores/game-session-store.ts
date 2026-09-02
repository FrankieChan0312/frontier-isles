import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'
import type { PlayerEventView } from '../../game/contracts/player-events.ts'
import type { PlayerView } from '../../game/contracts/views.ts'
import type { GameUpdate, GatewayConnectionStatus, GatewaySaveStatus } from '../gateways/game-gateway.ts'

export interface GameSessionStoreState {
  readonly view: PlayerView | null
  readonly recentEvents: readonly PlayerEventView[]
  readonly connectionStatus: GatewayConnectionStatus
  readonly aiThinking: boolean
  readonly saveStatus: GatewaySaveStatus
  readonly error: string | null
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
}

export function createGameSessionStore(): StoreApi<GameSessionStoreState> {
  return createStore<GameSessionStoreState>((set) => ({
    ...INITIAL_SESSION_STATE,
    applyGatewayUpdate: (update): void => set((state) => ({
      view: update.view,
      recentEvents: [...state.recentEvents, ...update.events].slice(-100),
      connectionStatus: update.connectionStatus,
      aiThinking: update.aiThinking,
      saveStatus: update.saveStatus,
      error: update.error,
    })),
    clearError: (): void => set({ error: null }),
    reset: (): void => set(INITIAL_SESSION_STATE),
  }))
}

export type GameSessionStore = StoreApi<GameSessionStoreState>
