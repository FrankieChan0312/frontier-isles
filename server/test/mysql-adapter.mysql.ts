import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import type { RowDataPacket } from 'mysql2/promise'
import { MysqlMultiplayerRepository } from '../src/persistence/mysql-multiplayer-repository.js'
import { MysqlStore } from '../src/persistence/mysql-store.js'
import { InMemoryMultiplayerRepository, recordChecksum, type PersistenceDiagnostic } from '../src/persistence/multiplayer-repository.js'
import { canonicalJson } from '../src/persistence/canonical-json.js'
import { MAX_MULTIPLAYER_RECORD_BYTES } from '../src/persistence/multiplayer-record.js'
import { persistentRoom, restoredService, resumeEveryHuman } from './persistence-test-helpers.js'
import { FakeLifecycleRuntime } from './fake-lifecycle-runtime.js'
import { requireValue, requestFor, successData } from './game-test-helpers.js'
import { mysqlTestConfig, mysqlTestConnection, resetMysqlTestSchema } from './mysql-test-helpers.js'

const cleanup: (() => void | Promise<void>)[] = []
beforeEach(resetMysqlTestSchema)
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
function recordFixture(start = true) {
  const repository = new InMemoryMultiplayerRepository()
  const room = persistentRoom(repository)
  cleanup.push(() => room.service.dispose())
  if (start) room.start()
  return { room, record: requireValue(repository.load()[0]) }
}
async function store(options: Parameters<typeof MysqlStore.open>[1] = {}) {
  const result = await MysqlStore.open(mysqlTestConfig(), options)
  cleanup.push(() => result.close())
  return result
}
describe('real MySQL aggregate storage', () => {
  it('boots empty, creates, updates, preserves canonical bytes and token privacy, deletes and closes', () => {
    const diagnostics: PersistenceDiagnostic[] = []
    const repository = new MysqlMultiplayerRepository(mysqlTestConfig(), { onDiagnostic: (value) => diagnostics.push(value) })
    cleanup.push(() => repository.close())
    expect(repository.load()).toEqual([])
    const { room, record } = recordFixture()
    repository.save(record)
    expect(canonicalJson(repository.load()[0]) === canonicalJson(record)).toBe(true)
    const next = { ...record, idleDeadlineMs: record.idleDeadlineMs + 1 }
    repository.save(next)
    const stored = canonicalJson(repository.load()[0])
    expect(stored === canonicalJson(next)).toBe(true)
    for (const member of room.members) expect(stored.includes(member.credential.resumeToken)).toBe(false)
    repository.remove(record.roomCode)
    expect(repository.load()).toEqual([])
    repository.flush()
    repository.close()
    repository.close()
    expect(() => repository.flush()).toThrow('PERSISTENCE_WRITE_FAILED')
    expect(JSON.stringify(diagnostics)).not.toMatch(/password|payload|checksum|sessionId|resumeToken|random|mysql:\/\//u)
  })

  it('rejects a stale writer and stale delete without overwriting the newer aggregate', async () => {
    const first = await store()
    const { record } = recordFixture()
    await first.save(record)
    const stale = await store()
    await stale.load()
    const staleDelete = await store()
    await staleDelete.load()
    const next = { ...record, idleDeadlineMs: record.idleDeadlineMs + 1 }
    await first.save(next)
    await expect(stale.save(record)).rejects.toThrow('PERSISTENCE_WRITE_FAILED')
    await expect(staleDelete.remove(record.roomCode)).rejects.toThrow('PERSISTENCE_WRITE_FAILED')
    expect(canonicalJson((await first.load())[0]) === canonicalJson(next)).toBe(true)
  })

  it('rejects stale ownership after deletion and recreation of the exact same aggregate key', async () => {
    const first = await store()
    const { record } = recordFixture()
    await first.save(record)
    const stale = await store()
    await stale.load()
    await first.remove(record.roomCode)
    await first.save(record)
    await expect(stale.save(record)).rejects.toThrow('PERSISTENCE_WRITE_FAILED')
    expect(canonicalJson((await first.load())[0]) === canonicalJson(record)).toBe(true)
  })

  it('allows exactly one of two simultaneous expected-revision writes', async () => {
    const first = await store()
    const { record } = recordFixture()
    await first.save(record)
    const second = await store()
    await second.load()
    const outcomes = await Promise.allSettled([first.save(record), second.save(record)])
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    const recovered = await store()
    expect(canonicalJson((await recovered.load())[0]) === canonicalJson(record)).toBe(true)
  })

  it('fails safely when a local endpoint cannot provide MySQL at startup', async () => {
    const unavailable = createServer((socket) => socket.destroy())
    await new Promise<void>((resolve) => unavailable.listen(0, '127.0.0.1', resolve))
    cleanup.push(() => new Promise<void>((resolve) => unavailable.close(() => resolve())))
    await expect(MysqlStore.open({ ...mysqlTestConfig(), port: (unavailable.address() as AddressInfo).port })).rejects.toThrow('PERSISTENCE_OPEN_FAILED')
  })

  it('refuses an untrusted TLS certificate instead of falling back to plaintext', async () => {
    await expect(MysqlStore.open({ ...mysqlTestConfig(), host: 'localhost',
      ca: '-----BEGIN CERTIFICATE-----\ninvalid-test-certificate\n-----END CERTIFICATE-----' })).rejects.toThrow('PERSISTENCE_OPEN_FAILED')
  })

  it('does not acknowledge or publish a failed database mutation and retries once after recovery', async () => {
    const repository = new MysqlMultiplayerRepository(mysqlTestConfig())
    cleanup.push(() => repository.close())
    const room = persistentRoom(repository)
    cleanup.push(() => room.service.dispose())
    const game = room.start()
    const before = canonicalJson(repository.load())
    const actor = requireValue(room.members[0]).credential.sessionId
    const request = requestFor(game, actor, { type: 'BUY_DEVELOPMENT_CARD' })
    const writer = await mysqlTestConnection()
    cleanup.push(() => writer.end())
    await writer.execute('RENAME TABLE rooms TO rooms_held')
    let publications = 0
    room.service.subscribeToGames(() => { publications += 1 })
    expect(await room.service.submitGameCommand(actor, request)).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    expect(publications).toBe(0)
    expect(room.service.isReady).toBe(false)
    await writer.execute('RENAME TABLE rooms_held TO rooms')
    const restored = new MysqlMultiplayerRepository(mysqlTestConfig())
    cleanup.push(() => restored.close())
    expect(canonicalJson(restored.load()) === before).toBe(true)
    const service = restoredService(restored, new FakeLifecycleRuntime())
    cleanup.push(() => service.dispose())
    resumeEveryHuman(service, room.members)
    const accepted = await service.submitGameCommand(actor, request)
    expect(successData(accepted).accepted).toBe(true)
    expect(await service.submitGameCommand(actor, request)).toEqual(accepted)
    expect(requireValue(service.getGameSession(game.roomCode)).exportPersistence().state.stateVersion)
      .toBe(game.exportPersistence().state.stateVersion)
  })

  it.each(['beforeCommit', 'afterCommit'] as const)('fails closed on %s failure and recovers the actual durable generation', async (boundary) => {
    let fail = false
    const writer = await store({ [boundary]: () => { if (fail) throw new Error('private password payload') } })
    const { record } = recordFixture()
    await writer.save(record)
    fail = true
    const next = { ...record, idleDeadlineMs: record.idleDeadlineMs + 1 }
    await expect(writer.save(next)).rejects.toThrow('PERSISTENCE_WRITE_FAILED')
    await expect(writer.save(next)).rejects.toThrow('PERSISTENCE_WRITE_FAILED')
    const recovered = await store()
    expect(canonicalJson((await recovered.load())[0]) === canonicalJson(boundary === 'beforeCommit' ? record : next)).toBe(true)
  })

  it('rolls back when the actual database connection is lost inside a transaction', async () => {
    const killer = await mysqlTestConnection()
    cleanup.push(() => killer.end())
    let fail = false
    const writer = await store({ beforeCommit: async () => {
      if (!fail) return
      const [connections] = await killer.execute<(RowDataPacket & { readonly id: number })[]>(
        'SELECT ID AS id FROM information_schema.PROCESSLIST WHERE DB=DATABASE() AND ID<>CONNECTION_ID()')
      expect(connections).toHaveLength(1)
      // Test-only parameter binding: KILL, like BEGIN, is not a preparable MySQL statement.
      await killer.query('KILL CONNECTION ?', [requireValue(connections[0]).id])
    } })
    const { record } = recordFixture()
    await writer.save(record)
    fail = true
    await expect(writer.save({ ...record, idleDeadlineMs: record.idleDeadlineMs + 1 })).rejects.toThrow('PERSISTENCE_WRITE_FAILED')
    const recovered = await store()
    expect(canonicalJson((await recovered.load())[0]) === canonicalJson(record)).toBe(true)
  })

  it('bounds a blocked row write, poisons the failed adapter and retains the previous commit', async () => {
    const writer = await store()
    const { record } = recordFixture()
    await writer.save(record)
    const locker = await mysqlTestConnection()
    cleanup.push(() => locker.end())
    await locker.beginTransaction()
    await locker.execute('SELECT room_code FROM rooms WHERE room_code=? FOR UPDATE', [record.roomCode])
    await expect(writer.save(record)).rejects.toThrow('PERSISTENCE_WRITE_FAILED')
    await locker.rollback()
    const recovered = await store()
    expect(canonicalJson((await recovered.load())[0]) === canonicalJson(record)).toBe(true)
  })

  it('quarantines checksum, malformed, future, oversized and colliding-session records without private diagnostics', async () => {
    const diagnostics: PersistenceDiagnostic[] = []
    const repository = await store({ onDiagnostic: (value) => diagnostics.push(value) })
    const { record } = recordFixture(false)
    const writer = await mysqlTestConnection()
    cleanup.push(() => writer.end())
    const good = { ...record, roomCode: 'AAA234' }
    const payloads = [canonicalJson(good), '{', canonicalJson({ ...record, roomCode: 'BAD234', persistenceVersion: 99 }),
      'x'.repeat(MAX_MULTIPLAYER_RECORD_BYTES + 1), canonicalJson({ ...record, roomCode: 'ZZZ234' }), '{}']
    for (const [index, key] of ['AAA234', 'BAD233', 'BAD234', 'BAD235', 'ZZZ234', 'BAD236'].entries()) {
      const payload = requireValue(payloads[index])
      await writer.execute('INSERT INTO rooms (room_code,revision,incarnation,payload,checksum) VALUES (?,?,?,?,?)',
        [key, 1, Buffer.alloc(16), payload, index === 5 ? '0'.repeat(64) : recordChecksum(payload)])
    }
    expect(canonicalJson(await repository.load()) === canonicalJson([good])).toBe(true)
    expect(diagnostics).toContainEqual({ code: 'PERSISTENCE_QUARANTINED', records: 5 })
    expect(JSON.stringify(diagnostics)).not.toMatch(/payload|password|checksum|resumeToken|sessionId/u)
  })

  it('rejects invalid or oversized writes without weakening the accepted record limit', async () => {
    const repository = await store()
    const { record } = recordFixture()
    await repository.save(record)
    await expect(repository.save({ ...record, persistenceVersion: 99 } as unknown as typeof record)).rejects.toThrow('PERSISTENCE_INVALID_RECORD')
    await expect(repository.save({ ...record, extra: 'x'.repeat(MAX_MULTIPLAYER_RECORD_BYTES) } as typeof record)).rejects.toThrow('PERSISTENCE_INVALID_RECORD')
    expect(canonicalJson((await repository.load())[0]) === canonicalJson(record)).toBe(true)
  })

  it('rejects noncanonical binary keys and checksum bytes instead of masking their high bits', async () => {
    const repository = await store()
    const { record } = recordFixture(false)
    const writer = await mysqlTestConnection()
    cleanup.push(() => writer.end())
    for (const damage of ['key', 'checksum']) {
      const payload = canonicalJson(record)
      const key = Buffer.from(record.roomCode)
      const checksum = Buffer.from(recordChecksum(payload))
      const target = damage === 'key' ? key : checksum
      target[0] = requireValue(target[0]) | 0x80
      await writer.execute('INSERT INTO rooms (room_code,revision,incarnation,payload,checksum) VALUES (?,?,?,?,?)',
        [key, 1, Buffer.alloc(16), Buffer.from(payload), checksum])
    }
    expect(await repository.load()).toEqual([])
  })

  it('refuses verify-only empty startup, future versions and missing tables without repair', async () => {
    await expect(MysqlStore.open({ ...mysqlTestConfig(), initialize: false })).rejects.toThrow('PERSISTENCE_OPEN_FAILED')
    const repository = await store()
    await repository.close()
    const writer = await mysqlTestConnection()
    cleanup.push(() => writer.end())
    await writer.execute('UPDATE persistence_schema SET version=?', [99])
    await expect(store()).rejects.toThrow('PERSISTENCE_OPEN_FAILED')
    await writer.execute('UPDATE persistence_schema SET version=?', [1])
    await writer.execute('DROP TABLE rooms')
    await expect(store()).rejects.toThrow('PERSISTENCE_OPEN_FAILED')
  })
})
