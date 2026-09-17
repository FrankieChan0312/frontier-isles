import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, describe, expect, it } from 'vitest'
import { InMemoryMultiplayerRepository, decodeMultiplayerRecord, encodeMultiplayerRecord, recordChecksum,
  type PersistenceDiagnostic, type MultiplayerRepository } from '../src/persistence/multiplayer-repository.js'
import { SqliteMultiplayerRepository } from '../src/persistence/sqlite-multiplayer-repository.js'
import { canonicalJson } from '../src/persistence/canonical-json.js'
import { persistentRoom, temporaryPersistenceDirectory } from './persistence-test-helpers.js'
import { requireValue } from './game-test-helpers.js'

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
function storage(): { readonly database: string; readonly repository: SqliteMultiplayerRepository } {
  const directory = temporaryPersistenceDirectory()
  cleanup.push(directory.remove)
  const repository = new SqliteMultiplayerRepository(directory.database)
  cleanup.push(async () => (await repository.close()))
  return { database: directory.database, repository }
}
describe('atomic multiplayer repository', () => {
  it.each(['memory', 'sqlite'] as const)('round-trips strict canonical records without persisting raw tokens (%s)', async (adapter) => {
    const durable = adapter === 'sqlite' ? storage() : null
    const repository: MultiplayerRepository = durable?.repository ?? new InMemoryMultiplayerRepository()
    const room = (await persistentRoom(repository))
    cleanup.push(() => room.service.dispose())
    await room.start()
    const record = requireValue((await repository.load())[0])
    const encoded = encodeMultiplayerRecord(record)
    expect(decodeMultiplayerRecord(encoded.payload, encoded.checksum)).toEqual(record)
    expect(canonicalJson({ b: 2, a: [3, 1] })).toBe('{"a":[3,1],"b":2}')
    for (const member of room.members) {
      expect(encoded.payload).not.toContain(member.credential.resumeToken)
      expect(record.sessions.some((session) => session.sessionId === member.credential.sessionId)).toBe(true)
      if (durable !== null) { await repository.flush(); expect(readFileSync(durable.database).includes(member.credential.resumeToken)).toBe(false) }
    }
    expect(encoded.payload).not.toMatch(/socketId|reconnectTask|idleTask|callback|savedAt|resumeToken"/u)
  })

  it('rejects malformed, future, extra/private, prototype and non-finite data before replacing good state', async () => {
    const { repository } = storage()
    const room = (await persistentRoom(repository))
    cleanup.push(() => room.service.dispose())
    await room.start()
    const before = requireValue((await repository.load())[0])
    for (const invalid of [
      { ...before, persistenceVersion: 2 }, { ...before, socketId: 'transport' },
      { ...before, rawResumeToken: room.members[0]?.credential.resumeToken },
      { ...before, revision: Number.NaN }, { ...before, hostSessionId: 'session_absent_0001' },
      { ...before, game: { ...before.game, state: { ...before.game?.state, future: true } } },
    ]) expect(() => encodeMultiplayerRecord(invalid)).toThrow('PERSISTENCE_INVALID_RECORD')
    expect(() => canonicalJson(JSON.parse('{"__proto__":{}}') as unknown)).toThrow('Unsafe')
    expect(() => canonicalJson({ date: new Date() })).toThrow('plain JSON')
    expect(() => decodeMultiplayerRecord('{', recordChecksum('{'))).toThrow('PERSISTENCE_INVALID_RECORD')
    expect(() => decodeMultiplayerRecord(canonicalJson(before), 'wrong')).toThrow('PERSISTENCE_INVALID_RECORD')
    expect((await repository.load())).toEqual([before])
  })

  it('rolls back an injected pre-COMMIT failure and emits diagnostics without secrets or paths', async () => {
    const directory = temporaryPersistenceDirectory()
    cleanup.push(directory.remove)
    let fail = false
    const diagnostics: PersistenceDiagnostic[] = []
    const repository = new SqliteMultiplayerRepository(directory.database, { beforeCommit: () => {
      if (fail) throw new Error('private internal failure')
    }, onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) })
    cleanup.push(async () => (await repository.close()))
    const room = (await persistentRoom(repository))
    cleanup.push(() => room.service.dispose())
    const before = requireValue((await repository.load())[0])
    fail = true
    expect((await room.service.setReady(requireValue(room.members[0]).credential.sessionId, room.snapshot().revision, false)))
      .toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    expect(room.service.roomCount).toBe(0)
    expect((await repository.load())).toEqual([before])
    expect(diagnostics).toContainEqual({ code: 'PERSISTENCE_WRITE_FAILED' })
    expect(JSON.stringify(diagnostics)).not.toMatch(/private internal|rooms\.sqlite|resumeToken|sessionId|checksum/u)
  })

  it('quarantines corrupt and unknown-future records while retaining unrelated valid Rooms', async () => {
    const { database, repository } = storage()
    const room = (await persistentRoom(repository))
    cleanup.push(() => room.service.dispose())
    const good = requireValue((await repository.load())[0])
    await repository.close()
    const writer = new DatabaseSync(database)
    writer.prepare('INSERT INTO rooms VALUES (?,?,?)').run('BAD234', '{truncated', recordChecksum('{truncated'))
    const future = canonicalJson({ ...good, roomCode: 'BAD235', persistenceVersion: 99 })
    writer.prepare('INSERT INTO rooms VALUES (?,?,?)').run('BAD235', future, recordChecksum(future))
    writer.close()
    const diagnostics: PersistenceDiagnostic[] = []
    const reopened = new SqliteMultiplayerRepository(database, { onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) })
    cleanup.push(async () => (await reopened.close()))
    expect((await reopened.load())).toEqual([good])
    expect(diagnostics).toContainEqual({ code: 'PERSISTENCE_QUARANTINED', records: 2 })
    await reopened.close()
    const inspect = new DatabaseSync(database)
    expect(inspect.prepare('SELECT count(*) AS total FROM quarantine').get()?.total).toBe(2)
    expect(inspect.prepare('SELECT count(*) AS total FROM rooms').get()?.total).toBe(1)
    inspect.close()
  })

  it('refuses an unreadable database and unsupported database version without resetting the file', () => {
    const directory = temporaryPersistenceDirectory()
    cleanup.push(directory.remove)
    const invalid = Buffer.from('not a sqlite database')
    writeFileSync(directory.database, invalid)
    expect(() => new SqliteMultiplayerRepository(directory.database)).toThrow('PERSISTENCE_OPEN_FAILED')
    expect(readFileSync(directory.database)).toEqual(invalid)
    const other = directory.database + '.sqlite'
    const writer = new DatabaseSync(other)
    writer.exec('PRAGMA user_version=99')
    writer.close()
    expect(() => new SqliteMultiplayerRepository(other)).toThrow('PERSISTENCE_OPEN_FAILED')
    const inspect = new DatabaseSync(other)
    expect(inspect.prepare('PRAGMA user_version').get()?.user_version).toBe(99)
    inspect.close()
  })

  it('isolates a cross-Room session collision instead of allowing one Room to overwrite another membership', async () => {
    const { database, repository } = storage()
    const room = (await persistentRoom(repository))
    cleanup.push(() => room.service.dispose())
    const original = requireValue((await repository.load())[0])
    await repository.close()
    const writer = new DatabaseSync(database)
    writer.exec('DELETE FROM rooms')
    for (const roomCode of ['AAA234', 'ZZZ234']) {
      const encoded = encodeMultiplayerRecord({ ...original, roomCode })
      writer.prepare('INSERT INTO rooms VALUES (?,?,?)').run(roomCode, encoded.payload, encoded.checksum)
    }
    writer.close()
    const reopened = new SqliteMultiplayerRepository(database)
    cleanup.push(async () => (await reopened.close()))
    expect((await reopened.load()).map((record) => record.roomCode)).toEqual(['AAA234'])
  })

  it('prevents a second process owner from opening the same durable store', () => {
    const { database } = storage()
    expect(() => new SqliteMultiplayerRepository(database)).toThrow('PERSISTENCE_OPEN_FAILED')
  })

  it('does not initialize over an unrelated SQLite database or silently recreate a missing accepted table', async () => {
    const directory = temporaryPersistenceDirectory()
    cleanup.push(directory.remove)
    const unrelated = new DatabaseSync(directory.database)
    unrelated.exec('CREATE TABLE valuable_data (value TEXT); INSERT INTO valuable_data VALUES (\'keep\')')
    unrelated.close()
    expect(() => new SqliteMultiplayerRepository(directory.database)).toThrow('PERSISTENCE_OPEN_FAILED')
    const inspect = new DatabaseSync(directory.database)
    expect(inspect.prepare('SELECT value FROM valuable_data').get()?.value).toBe('keep')
    expect(inspect.prepare('PRAGMA user_version').get()?.user_version).toBe(0)
    inspect.close()
    const brokenPath = directory.database + '.sqlite'
    const accepted = new SqliteMultiplayerRepository(brokenPath)
    await accepted.close()
    const writer = new DatabaseSync(brokenPath)
    writer.exec('DROP TABLE rooms')
    writer.close()
    expect(() => new SqliteMultiplayerRepository(brokenPath)).toThrow('PERSISTENCE_OPEN_FAILED')
  })

  it('recovers the previous committed generation after a writer is killed inside a transaction', async () => {
    const { database, repository } = storage()
    const room = (await persistentRoom(repository))
    cleanup.push(() => room.service.dispose())
    await room.start()
    const before = (await repository.load())
    await repository.close()
    const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('./persistence-crash-writer.ts', import.meta.url)), database], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
    })
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('message', (message: unknown) => message === 'TRANSACTION_OPEN' ? resolve() : reject(new Error('Unexpected crash writer message.')))
        child.once('error', reject)
        child.once('exit', () => reject(new Error('Crash writer exited before opening its transaction.')))
      })
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()))
      child.kill('SIGKILL')
      await exited
    } finally { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL') }
    const recovered = new SqliteMultiplayerRepository(database)
    cleanup.push(async () => (await recovered.close()))
    expect((await recovered.load())).toEqual(before)
  }, 15_000)
})
