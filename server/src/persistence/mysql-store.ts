import { createPool, type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise'
import { randomBytes } from 'node:crypto'
import type { RoomCode } from '@frontier-isles/realtime-contracts'
import type { MysqlConfig } from './mysql-config.js'
import type { MultiplayerRecord } from './multiplayer-record.js'
import { MAX_MULTIPLAYER_RECORD_BYTES } from './multiplayer-record.js'
import { decodeMultiplayerRecord, encodeMultiplayerRecord, PersistenceError, type PersistenceDiagnostic } from './multiplayer-repository.js'
import { MYSQL_COLUMNS, MYSQL_SCHEMA_SQL } from './mysql-schema.js'
import { MAX_ROOMS } from '../security/network-limits.js'

const QUERY_TIMEOUT_MS = 2000
interface Row extends RowDataPacket { readonly [key: string]: unknown }
type SqlValue = string | number | Buffer
interface StorageRevision { readonly version: string; readonly incarnation: Buffer }
function rowCount(row: Row | undefined): number {
  const value = row?.total
  if ((typeof value !== 'number' && typeof value !== 'string') || !/^\d+$/u.test(String(value))) throw new Error('Invalid count.')
  const count = Number(value)
  if (!Number.isSafeInteger(count)) throw new Error('Invalid count.')
  return count
}
export interface MysqlStoreOptions {
  readonly onDiagnostic?: (diagnostic: PersistenceDiagnostic) => void
  /** Node-only test injection; never selected by environment or protocol. */
  readonly beforeCommit?: () => void | Promise<void>
  readonly afterCommit?: () => void
}

/** Private async driver implementation. The authority uses the synchronous worker adapter. */
export class MysqlStore {
  readonly #pool: Pool
  readonly #options: MysqlStoreOptions
  readonly #revisions = new Map<RoomCode, StorageRevision>()
  #closed = false
  #failed = false

  private constructor(config: MysqlConfig, options: MysqlStoreOptions) {
    this.#options = options
    this.#pool = createPool({ host: config.host, port: config.port, database: config.database,
      user: config.user, password: config.password, connectTimeout: QUERY_TIMEOUT_MS,
      connectionLimit: 2, maxIdle: 2, idleTimeout: 30_000, waitForConnections: false,
      multipleStatements: false, enableKeepAlive: true, supportBigNumbers: true, bigNumberStrings: true,
      ...(config.ca === null ? {} : { ssl: { ca: config.ca, rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' } }),
    })
  }

  public static async open(config: MysqlConfig, options: MysqlStoreOptions = {}): Promise<MysqlStore> {
    const store = new MysqlStore(config, options)
    try { await store.#withConnection((connection) => store.#schema(connection, config.initialize)); return store }
    catch {
      await store.close().catch(() => {})
      options.onDiagnostic?.({ code: 'PERSISTENCE_OPEN_FAILED' })
      throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
    }
  }

  async #schema(connection: PoolConnection, initialize: boolean): Promise<void> {
    const durability = await this.#rows(connection,
      'SELECT @@innodb_flush_log_at_trx_commit AS durable, @@sync_binlog AS binlog')
    if (String(durability[0]?.durable) !== '1' || String(durability[0]?.binlog) !== '1') throw new Error('Durability configuration unsupported.')
    const tables = await this.#rows(connection,
      'SELECT TABLE_NAME AS name, ENGINE AS engine FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME')
    if (tables.length === 0 && initialize) {
      // MySQL DDL commits separately. An interrupted bootstrap leaves a partial schema that
      // subsequent opens refuse; only an operator may investigate/remove an empty partial store.
      for (const sql of MYSQL_SCHEMA_SQL) await this.#execute(connection, sql)
      await this.#execute(connection, 'INSERT INTO persistence_schema (id,version) VALUES (?,?)', [1, 1])
    } else if (tables.map((row) => row.name).join(',') !== 'persistence_schema,quarantine,rooms'
      || tables.some((row) => row.engine !== 'InnoDB')) throw new Error('Unsupported schema.')
    const columns = await this.#rows(connection, `SELECT TABLE_NAME AS t, COLUMN_NAME AS c, COLUMN_TYPE AS y,
      IS_NULLABLE AS n, COLUMN_KEY AS k, EXTRA AS e FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA=DATABASE() ORDER BY TABLE_NAME,ORDINAL_POSITION`)
    if (columns.map((row) => `${String(row.t)}:${String(row.c)}:${String(row.y)}:${String(row.n)}:${String(row.k)}:${String(row.e)}`).join('|')
      !== MYSQL_COLUMNS.join('|')) throw new Error('Unsupported columns.')
    const versions = await this.#rows(connection, 'SELECT id,version FROM persistence_schema')
    if (versions.length !== 1 || versions[0]?.id !== 1 || versions[0]?.version !== 1) throw new Error('Unsupported version.')
    const triggers = await this.#rows(connection, 'SELECT COUNT(*) AS total FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE()')
    if (rowCount(triggers[0]) !== 0) throw new Error('Unsupported triggers.')
  }

  public async load(): Promise<readonly MultiplayerRecord[]> {
    try {
      return await this.#transaction(async (connection) => {
        const count = await this.#rows(connection, 'SELECT COUNT(*) AS total FROM rooms')
        if (rowCount(count[0]) > MAX_ROOMS) throw new Error('Room limit exceeded.')
        const oversized = await this.#execute(connection, `INSERT INTO quarantine (room_code,revision,incarnation,payload,checksum,reason)
          SELECT room_code,revision,incarnation,payload,checksum,? FROM rooms WHERE OCTET_LENGTH(payload)>? OR OCTET_LENGTH(room_code)<>?`,
        ['INVALID_RECORD', MAX_MULTIPLAYER_RECORD_BYTES, 6])
        await this.#execute(connection, 'DELETE FROM rooms WHERE OCTET_LENGTH(payload)>? OR OCTET_LENGTH(room_code)<>?', [MAX_MULTIPLAYER_RECORD_BYTES, 6])
        let quarantined = oversized.affectedRows
        const keys = await this.#rows(connection, 'SELECT room_code FROM rooms ORDER BY room_code')
        const records: MultiplayerRecord[] = []
        const revisions = new Map<RoomCode, StorageRevision>()
        const sessions = new Set<string>()
        for (const key of keys) {
          if (!Buffer.isBuffer(key.room_code)) throw new Error('Invalid key.')
          const rows = await this.#rows(connection, 'SELECT room_code,revision,incarnation,payload,checksum FROM rooms WHERE room_code=? FOR UPDATE', [key.room_code])
          const row = rows[0]
          let record: MultiplayerRecord
          try {
            if (row === undefined || !Buffer.isBuffer(row.payload) || !Buffer.isBuffer(row.checksum)
              || !Buffer.isBuffer(row.incarnation) || row.incarnation.length !== 16
              || typeof row.revision !== 'string' || !/^[1-9]\d*$/u.test(row.revision)) throw new Error('Invalid row.')
            record = decodeMultiplayerRecord(row.payload.toString('utf8'), row.checksum.toString('utf8'))
            // Reject invalid UTF-8 rather than accepting a lossy byte conversion.
            if (!Buffer.from(encodeMultiplayerRecord(record).payload).equals(row.payload)
              || !Buffer.from(record.roomCode).equals(key.room_code)
              || record.sessions.some((session) => sessions.has(session.sessionId))) throw new Error('Invalid record.')
          } catch {
            await this.#execute(connection, `INSERT INTO quarantine (room_code,revision,incarnation,payload,checksum,reason)
              SELECT room_code,revision,incarnation,payload,checksum,? FROM rooms WHERE room_code=?`, ['INVALID_RECORD', key.room_code])
            await this.#execute(connection, 'DELETE FROM rooms WHERE room_code=?', [key.room_code])
            quarantined += 1
            continue
          }
          for (const session of record.sessions) sessions.add(session.sessionId)
          if (!Buffer.isBuffer(row?.incarnation)) throw new Error('Invalid incarnation.')
          revisions.set(record.roomCode, { version: String(row.revision), incarnation: row.incarnation })
          records.push(record)
        }
        return { records, revisions, quarantined }
      }, false).then(({ records, revisions, quarantined }) => {
        this.#revisions.clear()
        for (const [code, revision] of revisions) this.#revisions.set(code, revision)
        if (quarantined > 0) this.#options.onDiagnostic?.({ code: 'PERSISTENCE_QUARANTINED', records: quarantined })
        this.#options.onDiagnostic?.({ code: 'PERSISTENCE_RECOVERED', records: records.length })
        return records
      })
    } catch { throw new PersistenceError('PERSISTENCE_OPEN_FAILED') }
  }

  public async save(record: MultiplayerRecord): Promise<void> {
    const encoded = encodeMultiplayerRecord(record)
    const expected = this.#revisions.get(record.roomCode)
    // Storage-only entropy prevents an old writer from overwriting a deleted/recreated key.
    // It never enters the canonical aggregate, game RNG, views or authoritative ordering.
    const incarnation = expected?.incarnation ?? randomBytes(16)
    await this.#transaction(async (connection) => {
      if (expected === undefined) {
        // Serialize only capacity admission, never ordinary updates of unrelated Rooms.
        await this.#rows(connection, 'SELECT id FROM persistence_schema WHERE id=? FOR UPDATE', [1])
        const count = await this.#rows(connection, 'SELECT COUNT(*) AS total FROM rooms')
        if (rowCount(count[0]) >= MAX_ROOMS) throw new Error('Room limit exceeded.')
        await this.#execute(connection, 'INSERT INTO rooms (room_code,revision,incarnation,payload,checksum) VALUES (?,?,?,?,?)',
          [Buffer.from(record.roomCode), '1', incarnation, Buffer.from(encoded.payload), Buffer.from(encoded.checksum)])
      } else {
        const changed = await this.#execute(connection, `UPDATE rooms SET revision=revision+1,payload=?,checksum=?
          WHERE room_code=? AND revision=? AND incarnation=?`, [Buffer.from(encoded.payload), Buffer.from(encoded.checksum), Buffer.from(record.roomCode), expected.version, incarnation])
        if (changed.affectedRows !== 1) throw new Error('Stale storage revision.')
      }
    })
    this.#revisions.set(record.roomCode, { version: expected === undefined ? '1' : String(BigInt(expected.version) + 1n), incarnation })
  }

  public async remove(roomCode: RoomCode): Promise<void> {
    const expected = this.#revisions.get(roomCode)
    await this.#transaction(async (connection) => {
      if (expected === undefined) {
        const rows = await this.#rows(connection, 'SELECT revision FROM rooms WHERE room_code=? FOR UPDATE', [Buffer.from(roomCode)])
        if (rows.length !== 0) throw new Error('Unowned deletion.')
      } else {
        const result = await this.#execute(connection, 'DELETE FROM rooms WHERE room_code=? AND revision=? AND incarnation=?', [Buffer.from(roomCode), expected.version, expected.incarnation])
        if (result.affectedRows !== 1) throw new Error('Stale deletion.')
      }
    })
    this.#revisions.delete(roomCode)
  }

  public flush(): void { this.#requireOpen() } // Every save/remove has already committed.
  public async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    await this.#pool.end()
  }
  #requireOpen(): void {
    if (this.#closed || this.#failed) throw new PersistenceError('PERSISTENCE_WRITE_FAILED')
  }
  async #withConnection<T>(operation: (connection: PoolConnection) => Promise<T>): Promise<T> {
    this.#requireOpen()
    let expired = false
    let timer: NodeJS.Timeout | undefined
    const acquisition = this.#pool.getConnection().then((connection) => {
      if (expired) { connection.destroy(); throw new Error('Connection deadline.') }
      return connection
    })
    let connection: PoolConnection
    try {
      connection = await Promise.race([acquisition, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { expired = true; reject(new Error('Connection deadline.')) }, QUERY_TIMEOUT_MS)
      })])
    } finally { clearTimeout(timer) }
    try {
      await this.#execute(connection, 'SET SESSION innodb_lock_wait_timeout=2')
      return await operation(connection)
    } finally { connection.release() }
  }
  async #bounded<T>(connection: PoolConnection, operation: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    try {
      return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => { connection.destroy(); reject(new Error('Query deadline.')) }, QUERY_TIMEOUT_MS)
      })])
    } finally { clearTimeout(timer) }
  }
  async #execute(connection: PoolConnection, sql: string, values: readonly SqlValue[] = []): Promise<ResultSetHeader> {
    const [result] = await this.#bounded(connection, connection.execute<ResultSetHeader>(sql, [...values]))
    return result
  }
  async #rows(connection: PoolConnection, sql: string, values: readonly SqlValue[] = []): Promise<readonly Row[]> {
    const [result] = await this.#bounded(connection, connection.execute<Row[]>(sql, [...values]))
    return result
  }
  async #transaction<T>(operation: (connection: PoolConnection) => Promise<T>, injectFault = true): Promise<T> {
    try {
      return await this.#withConnection(async (connection) => {
        try {
          await this.#bounded(connection, connection.beginTransaction())
          const result = await operation(connection)
          if (injectFault) await this.#options.beforeCommit?.()
          await this.#bounded(connection, connection.commit())
          if (injectFault) this.#options.afterCommit?.()
          return result
        } catch {
          try { await this.#bounded(connection, connection.rollback()) } catch { connection.destroy() }
          throw new Error('Transaction failed.')
        }
      })
    } catch {
      // A lost COMMIT response is uncertain. Never reconnect and replay a write automatically.
      this.#failed = true
      this.#options.onDiagnostic?.({ code: 'PERSISTENCE_WRITE_FAILED' })
      throw new PersistenceError('PERSISTENCE_WRITE_FAILED')
    }
  }
}
