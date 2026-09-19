import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it, vi } from 'vitest'
import { InMemoryRoomService } from '../src/lobby/room-service.js'
import { createSystemRoomLifecycleRuntime } from '../src/lobby/lifecycle-runtime.js'
import { SqliteMultiplayerRepository } from '../src/persistence/sqlite-multiplayer-repository.js'
import { MAX_MULTIPLAYER_RECORD_BYTES } from '../src/persistence/multiplayer-record.js'
import { MAX_ROOMS } from '../src/security/network-limits.js'
import { persistentRoom, temporaryPersistenceDirectory } from './persistence-test-helpers.js'
import { requireValue, successData } from './game-test-helpers.js'

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.restoreAllMocks(); vi.useRealTimers() })
it('caps Room allocation at 64 and permits a new Room after an existing Room closes', async () => {
  const service = (await InMemoryRoomService.open()); cleanup.push(() => service.dispose())
  const first = successData((await service.createRoom('First')))
  for (let index = 1; index < MAX_ROOMS; index += 1) successData((await service.createRoom(`Host ${index}`)))
  expect((await service.createRoom('Over capacity'))).toMatchObject({ ok: false, error: { code: 'SERVER_BUSY' } })
  expect(service.roomCount).toBe(64)
  successData((await service.leaveRoom(first.credential.sessionId)))
  successData((await service.createRoom('New Host')))
  expect(service.roomCount).toBe(64)
})
it('quarantines oversized private rows without decoding them and preserves an unrelated valid Room', async () => {
  const directory = temporaryPersistenceDirectory(); cleanup.push(directory.remove)
  const initial = new SqliteMultiplayerRepository(directory.database)
  const room = (await persistentRoom(initial)); cleanup.push(() => room.service.dispose())
  const before = requireValue((await initial.load())[0]); await initial.close()
  const writer = new DatabaseSync(directory.database)
  writer.prepare('INSERT INTO rooms VALUES (?,?,?)').run('BAD234', 'x'.repeat(MAX_MULTIPLAYER_RECORD_BYTES + 1), '0'.repeat(64)); writer.close()
  const repository = new SqliteMultiplayerRepository(directory.database); cleanup.push(async () => (await repository.close()))
  expect((await repository.load())).toEqual([before]); await repository.close()
  const inspect = new DatabaseSync(directory.database)
  expect(inspect.prepare('SELECT length(payload) AS bytes FROM quarantine').get()?.bytes).toBe(MAX_MULTIPLAYER_RECORD_BYTES + 1)
  inspect.close()
})
it('refuses a database beyond the alpha Room cap without deleting or resetting any records', async () => {
  const directory = temporaryPersistenceDirectory(); cleanup.push(directory.remove)
  const initial = new SqliteMultiplayerRepository(directory.database); await initial.close()
  const writer = new DatabaseSync(directory.database)
  for (let index = 0; index <= MAX_ROOMS; index += 1) writer.prepare('INSERT INTO rooms VALUES (?,?,?)').run(`R${index}`, '{}', '0'.repeat(64))
  writer.close()
  const repository = new SqliteMultiplayerRepository(directory.database); cleanup.push(async () => (await repository.close()))
  await expect(repository.load()).rejects.toThrow('PERSISTENCE_OPEN_FAILED'); await repository.close()
  const inspect = new DatabaseSync(directory.database)
  expect(inspect.prepare('SELECT count(*) AS count FROM rooms').get()?.count).toBe(65)
  inspect.close()
})
it('bounds long lifecycle timers instead of overflowing Node to an immediate expiry', () => {
  vi.useFakeTimers()
  const callback = vi.fn()
  const task = createSystemRoomLifecycleRuntime().schedule(9_000_000_000, callback)
  vi.advanceTimersByTime(1)
  expect(callback).not.toHaveBeenCalled()
  task.cancel(); expect(vi.getTimerCount()).toBe(0)
})
it('releases database ownership after a checkpoint failure while preserving previously committed records', async () => {
  const directory = temporaryPersistenceDirectory(); cleanup.push(directory.remove)
  const repository = new SqliteMultiplayerRepository(directory.database)
  const room = (await persistentRoom(repository)); cleanup.push(() => room.service.dispose())
  const before = (await repository.load())
  vi.spyOn(repository, 'flush').mockImplementation(() => { throw new Error('PRIVATE_CHECKPOINT_FAILURE') })
  await expect(repository.close()).rejects.toThrow('PERSISTENCE_WRITE_FAILED')
  const reopened = new SqliteMultiplayerRepository(directory.database); cleanup.push(async () => (await reopened.close()))
  expect((await reopened.load())).toEqual(before)
})
