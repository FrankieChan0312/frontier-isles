import { LocalGameGateway } from '../application/gateways/local-game-gateway.ts'
import { SocketLobbyGateway } from '../application/gateways/socket-lobby-gateway.ts'
import { LocalStorageGameSaveRepository } from '../infrastructure/persistence/game-save-repository.ts'
import { readRealtimeClientConfig } from '../infrastructure/realtime/realtime-config.ts'

export function createBrowserGateway(): LocalGameGateway {
  return new LocalGameGateway({
    saveRepository: new LocalStorageGameSaveRepository(globalThis.localStorage),
  })
}

export function createBrowserLobbyGateway(): SocketLobbyGateway {
  return new SocketLobbyGateway(readRealtimeClientConfig().url)
}
