import {
  sessionCredentialSchema,
  type SessionCredential,
} from '@frontier-isles/realtime-contracts'

export const LOBBY_CREDENTIAL_STORAGE_KEY = 'frontier-isles:realtime-session:v1'

export interface LobbyCredentialStore {
  load(): SessionCredential | null
  save(credential: SessionCredential): void
  clear(): void
}

export class SessionStorageLobbyCredentialStore implements LobbyCredentialStore {
  readonly #storage: Storage

  public constructor(storage: Storage) {
    this.#storage = storage
  }

  public load(): SessionCredential | null {
    try {
      const serialized = this.#storage.getItem(LOBBY_CREDENTIAL_STORAGE_KEY)
      if (serialized === null) return null
      const parsed = sessionCredentialSchema.safeParse(JSON.parse(serialized) as unknown)
      if (parsed.success) return parsed.data
    } catch {
      // Corrupt or unavailable session storage is treated as no resumable session.
    }
    this.clear()
    return null
  }

  public save(credential: SessionCredential): void {
    try {
      this.#storage.setItem(
        LOBBY_CREDENTIAL_STORAGE_KEY,
        JSON.stringify(sessionCredentialSchema.parse(credential)),
      )
    } catch {
      // The active in-memory credential remains usable when storage is unavailable.
    }
  }

  public clear(): void {
    try {
      this.#storage.removeItem(LOBBY_CREDENTIAL_STORAGE_KEY)
    } catch {
      // An unavailable storage implementation is already effectively empty.
    }
  }
}
