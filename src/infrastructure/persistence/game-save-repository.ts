export interface GameSaveRepository {
  read(): Promise<string | null>
  write(serializedSave: string): Promise<void>
  delete(): Promise<void>
}

export class InMemoryGameSaveRepository implements GameSaveRepository {
  #serializedSave: string | null

  constructor(initialSave: string | null = null) {
    this.#serializedSave = initialSave
  }

  read(): Promise<string | null> {
    return Promise.resolve(this.#serializedSave)
  }

  write(serializedSave: string): Promise<void> {
    this.#serializedSave = serializedSave
    return Promise.resolve()
  }

  delete(): Promise<void> {
    this.#serializedSave = null
    return Promise.resolve()
  }
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export class LocalStorageGameSaveRepository implements GameSaveRepository {
  readonly #storage: KeyValueStorage
  readonly #key: string

  constructor(storage: KeyValueStorage, key = 'frontier-isles:v1:latest-save') {
    this.#storage = storage
    this.#key = key
  }

  read(): Promise<string | null> {
    return Promise.resolve(this.#storage.getItem(this.#key))
  }

  write(serializedSave: string): Promise<void> {
    this.#storage.setItem(this.#key, serializedSave)
    return Promise.resolve()
  }

  delete(): Promise<void> {
    this.#storage.removeItem(this.#key)
    return Promise.resolve()
  }
}
