import { LocalGameGateway } from '../application/gateways/local-game-gateway.ts'
import { LocalStorageGameSaveRepository } from '../infrastructure/persistence/game-save-repository.ts'

export function createBrowserGateway(): LocalGameGateway {
  return new LocalGameGateway({
    saveRepository: new LocalStorageGameSaveRepository(globalThis.localStorage),
  })
}
