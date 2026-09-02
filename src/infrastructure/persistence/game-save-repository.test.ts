import {
  InMemoryGameSaveRepository,
  LocalStorageGameSaveRepository,
  type KeyValueStorage,
} from './game-save-repository.ts'

class MemoryStorage implements KeyValueStorage {
  readonly values = new Map<string, string>()

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }
}

describe('game save repositories', () => {
  it('supports deterministic in-memory write, read, and delete', async () => {
    const repository = new InMemoryGameSaveRepository()
    expect(await repository.read()).toBeNull()
    await repository.write('{"save":1}')
    expect(await repository.read()).toBe('{"save":1}')
    await repository.delete()
    expect(await repository.read()).toBeNull()
  })

  it('isolates browser storage behind the repository interface and stable key', async () => {
    const storage = new MemoryStorage()
    const repository = new LocalStorageGameSaveRepository(storage, 'test-save')
    await repository.write('{"save":2}')
    expect(storage.values.get('test-save')).toBe('{"save":2}')
    expect(await repository.read()).toBe('{"save":2}')
    await repository.delete()
    expect(storage.values.has('test-save')).toBe(false)
  })
})
