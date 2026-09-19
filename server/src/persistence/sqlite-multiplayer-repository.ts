import { chmodSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { MAX_ROOMS } from '../security/network-limits.js'
import { MAX_MULTIPLAYER_RECORD_BYTES } from './multiplayer-record.js'
import type { RoomCode } from '@frontier-isles/realtime-contracts'
import type { MultiplayerRecord } from './multiplayer-record.js'
import { decodeMultiplayerRecord, encodeMultiplayerRecord, PersistenceError,
  type MultiplayerRepository, type PersistenceDiagnostic } from './multiplayer-repository.js'

export interface SqliteRepositoryOptions {
  readonly onDiagnostic?: (diagnostic: PersistenceDiagnostic) => void
  /** Node composition only: deterministic fault injection; never configured over the wire. */
  readonly beforeCommit?: () => void
}

export class SqliteMultiplayerRepository implements MultiplayerRepository {
  readonly #database: DatabaseSync
  readonly #options: SqliteRepositoryOptions
  #closed = false

  public constructor(filename: string, options: SqliteRepositoryOptions = {}) {
    this.#options = options
    let database: DatabaseSync | null = null
    try {
      if (filename.length === 0 || filename === ':memory:') throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
      const path = resolve(filename)
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
      database = new DatabaseSync(path, { timeout: 1000, allowExtension: false, defensive: true,
        enableDoubleQuotedStringLiterals: false })
      const integrity = database.prepare('PRAGMA quick_check').all()
      if (integrity.length !== 1 || integrity[0]?.quick_check !== 'ok') throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
      const version = database.prepare('PRAGMA user_version').get()?.user_version
      if (version !== 0 && version !== 1) throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
      const tables = database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
      if (version === 0 && tables.length !== 0) throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
      if (version === 1) {
        if (tables.length !== 2 || tables[0]?.name !== 'quarantine' || tables[1]?.name !== 'rooms') throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
        const columns = database.prepare('PRAGMA table_info(rooms)').all()
        const quarantine = database.prepare('PRAGMA table_info(quarantine)').all()
        if (columns.map((column) => column.name).join(',') !== 'room_code,payload,checksum'
          || columns.some((column) => column.type !== 'TEXT' || column.notnull !== 1)
          || columns[0]?.pk !== 1
          || quarantine.map((column) => column.name).join(',') !== 'id,room_code,payload,checksum,reason'
          || quarantine[0]?.pk !== 1) throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
        if (database.prepare('PRAGMA table_list').all().some((table) =>
          (table.name === 'rooms' || table.name === 'quarantine') && table.strict !== 1)) throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
      }
      database.exec('PRAGMA locking_mode=EXCLUSIVE; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;')
      database.exec(`BEGIN IMMEDIATE;
        CREATE TABLE IF NOT EXISTS rooms (room_code TEXT PRIMARY KEY, payload TEXT NOT NULL, checksum TEXT NOT NULL) STRICT;
        CREATE TABLE IF NOT EXISTS quarantine (id INTEGER PRIMARY KEY, room_code TEXT NOT NULL, payload TEXT NOT NULL, checksum TEXT NOT NULL, reason TEXT NOT NULL) STRICT;
        PRAGMA user_version=1;
        COMMIT;`)
      chmodSync(path, 0o600)
      this.#database = database
    } catch {
      try { database?.close() } catch { /* Keep the original safe startup failure. */ }
      options.onDiagnostic?.({ code: 'PERSISTENCE_OPEN_FAILED' })
      throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
    }
  }

  public async load(): Promise<readonly MultiplayerRecord[]> {
    this.#requireOpen()
    const records: MultiplayerRecord[] = []
    const sessionIds = new Set<string>()
    let quarantined = 0
    try {
      const count = this.#database.prepare('SELECT count(*) AS count FROM rooms').get()?.count
      if (typeof count !== 'number' || count > MAX_ROOMS) throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
      // Bound allocations before bringing private payloads into JavaScript. Oversized records
      // remain available to an operator in quarantine without copying them through the logger.
      const oversized = 'length(CAST(payload AS BLOB)) > ? OR length(checksum) != 64 OR length(room_code) != 6'
      this.#transaction(() => {
        const moved = this.#database.prepare(`INSERT INTO quarantine (room_code,payload,checksum,reason)
          SELECT room_code,payload,checksum,'INVALID_RECORD' FROM rooms WHERE ${oversized}`).run(MAX_MULTIPLAYER_RECORD_BYTES)
        quarantined += Number(moved.changes)
        this.#database.prepare(`DELETE FROM rooms WHERE ${oversized}`).run(MAX_MULTIPLAYER_RECORD_BYTES)
      }, false)
      const keys = this.#database.prepare('SELECT room_code FROM rooms ORDER BY room_code').all()
      for (const key of keys) {
        if (typeof key.room_code !== 'string') throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
        const row = this.#database.prepare('SELECT room_code,payload,checksum FROM rooms WHERE room_code=?').get(key.room_code)
        if (row === undefined) throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
        if (typeof row.room_code !== 'string' || typeof row.payload !== 'string' || typeof row.checksum !== 'string') {
          throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
        }
        const { room_code: roomCode, payload, checksum } = row
        try {
          const record = decodeMultiplayerRecord(payload, checksum)
          if (record.roomCode !== roomCode) throw new PersistenceError('PERSISTENCE_INVALID_RECORD')
          if (record.sessions.some((session) => sessionIds.has(session.sessionId))) throw new PersistenceError('PERSISTENCE_INVALID_RECORD')
          for (const session of record.sessions) sessionIds.add(session.sessionId)
          records.push(record)
        } catch {
          this.#quarantine(roomCode)
          quarantined += 1
        }
      }
      if (quarantined > 0) this.#options.onDiagnostic?.({ code: 'PERSISTENCE_QUARANTINED', records: quarantined })
      this.#options.onDiagnostic?.({ code: 'PERSISTENCE_RECOVERED', records: records.length })
      return records
    } catch { throw new PersistenceError('PERSISTENCE_OPEN_FAILED') }
  }

  public async save(record: MultiplayerRecord): Promise<void> {
    const encoded = encodeMultiplayerRecord(record)
    this.#transaction(() => {
      const exists = this.#database.prepare('SELECT 1 AS found FROM rooms WHERE room_code=?').get(record.roomCode)
      const count = this.#database.prepare('SELECT count(*) AS count FROM rooms').get()?.count
      if (exists === undefined && (typeof count !== 'number' || count >= MAX_ROOMS)) throw new PersistenceError('PERSISTENCE_WRITE_FAILED')
      this.#database.prepare(`INSERT INTO rooms (room_code,payload,checksum) VALUES (?,?,?)
        ON CONFLICT(room_code) DO UPDATE SET payload=excluded.payload,checksum=excluded.checksum`)
        .run(encoded.record.roomCode, encoded.payload, encoded.checksum)
    })
  }
  public async remove(roomCode: RoomCode): Promise<void> {
    this.#transaction(() => { this.#database.prepare('DELETE FROM rooms WHERE room_code=?').run(roomCode) })
  }
  public async flush(): Promise<void> {
    this.#requireOpen()
    try { this.#database.exec('PRAGMA wal_checkpoint(TRUNCATE)') } catch { throw new PersistenceError('PERSISTENCE_WRITE_FAILED') }
  }
  public async close(): Promise<void> {
    if (this.#closed) return
    let failed = false
    try { await this.flush() } catch { failed = true }
    try { this.#database.close() } catch { failed = true }
    this.#closed = true
    if (failed) throw new PersistenceError('PERSISTENCE_WRITE_FAILED')
  }
  #requireOpen(): void { if (this.#closed) throw new PersistenceError('PERSISTENCE_WRITE_FAILED') }
  #quarantine(roomCode: string): void {
    this.#transaction(() => {
      this.#database.prepare(`INSERT INTO quarantine (room_code,payload,checksum,reason)
        SELECT room_code,payload,checksum,'INVALID_RECORD' FROM rooms WHERE room_code=?`).run(roomCode)
      this.#database.prepare('DELETE FROM rooms WHERE room_code=?').run(roomCode)
    }, false)
  }
  #transaction(operation: () => void, injectFault = true): void {
    this.#requireOpen()
    try {
      this.#database.exec('BEGIN IMMEDIATE')
      operation()
      if (injectFault) this.#options.beforeCommit?.()
      this.#database.exec('COMMIT')
    } catch {
      try { this.#database.exec('ROLLBACK') } catch { /* No transaction may have been admitted. */ }
      this.#options.onDiagnostic?.({ code: 'PERSISTENCE_WRITE_FAILED' })
      throw new PersistenceError('PERSISTENCE_WRITE_FAILED')
    }
  }
}
