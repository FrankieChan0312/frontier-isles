import type {
  AiProfileId,
  RoomSnapshot,
  SafeError,
  SeatId,
} from '@frontier-isles/realtime-contracts'

export type LobbyConnectionState =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTED'

export interface LobbyGatewayState {
  readonly connectionState: LobbyConnectionState
  readonly error: SafeError | null
  readonly selfSeatId: SeatId | null
  readonly snapshot: RoomSnapshot | null
}

export type LobbyGatewayListener = (state: LobbyGatewayState) => void

export interface LobbyGateway {
  subscribe(listener: LobbyGatewayListener): () => void
  createRoom(displayName: string): Promise<void>
  joinRoom(displayName: string, roomCode: string): Promise<void>
  setReady(ready: boolean): Promise<void>
  setAiSeat(seatId: SeatId, profileId: AiProfileId | null): Promise<void>
  requestSnapshot(): Promise<void>
  leaveRoom(): Promise<void>
  dispose(): void
}
