import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createConnection, type Connection } from 'mysql2/promise'
import { beforeEach, describe, expect, it } from 'vitest'
import { MysqlStore } from '../src/persistence/mysql-store.js'
import { mysqlTestConfig, mysqlTestConnection, resetMysqlTestSchema } from './mysql-test-helpers.js'
import { prepareRestrictedMysql, restrictedMysqlConfig } from './mysql-restricted-helpers.js'

beforeEach(prepareRestrictedMysql)
async function runtimeConnection(): Promise<Connection> {
  const { host, port, database, user, password } = restrictedMysqlConfig()
  return createConnection({ host, port, database, user, password, connectTimeout: 2000 })
}
async function ownedRootConnection(): Promise<Connection> {
  const config = mysqlTestConfig()
  const password = process.env.MYSQL_ROOT_PASSWORD
  if (password === undefined || !/^[0-9a-f]{48}$/u.test(password)) throw new Error('Owned root credential unavailable.')
  return createConnection({ host: config.host, port: config.port, database: config.database, user: 'root', password })
}
describe('deployment schema authority and restricted runtime', () => {
  it('audits with deployment authority and refuses incomplete runtime metadata visibility', async () => {
    await MysqlStore.prepareSchema({ ...mysqlTestConfig(), initialize: false })
    await expect(MysqlStore.prepareSchema(restrictedMysqlConfig())).rejects.toThrow('PERSISTENCE_OPEN_FAILED')
    const runtime = await MysqlStore.open(restrictedMysqlConfig())
    expect(await runtime.load()).toEqual([])
    await runtime.close()
  })
  it('permits the runtime admission row lock', async () => {
    const runtime = await runtimeConnection()
    try {
      await runtime.beginTransaction()
      await runtime.query('SELECT id FROM persistence_schema WHERE id=1 FOR UPDATE')
    } finally { await runtime.rollback(); await runtime.end() }
  })
  it('does not infer global authority when partial revokes can hide schema objects', async () => {
    const config = mysqlTestConfig()
    const root = await ownedRootConnection()
    const globalConfig = { ...config, user: 'frontier_metadata_global', initialize: false }
    try {
      await root.query('CREATE USER ?@? IDENTIFIED BY ?', [globalConfig.user, '%', config.password])
      await root.query("GRANT SELECT,TRIGGER,EVENT,ALTER ROUTINE ON *.* TO 'frontier_metadata_global'@'%'")
      await MysqlStore.prepareSchema(globalConfig)
      await root.query('SET GLOBAL partial_revokes=ON')
      await root.query("REVOKE TRIGGER ON frontier_isles_mysql_test.* FROM 'frontier_metadata_global'@'%'")
      await expect(MysqlStore.prepareSchema(globalConfig)).rejects.toThrow('PERSISTENCE_OPEN_FAILED')
      // Changing partial_revokes changes underscore interpretation of existing grants.
      await expect(MysqlStore.prepareSchema({ ...config, initialize: false })).rejects.toThrow('PERSISTENCE_OPEN_FAILED')
      await root.query("GRANT SELECT,TRIGGER,EVENT,ALTER ROUTINE ON frontier_isles_mysql_test.* TO 'frontier_test'@'%'")
      await MysqlStore.prepareSchema({ ...config, initialize: false })
    } finally {
      await root.query("DROP USER IF EXISTS 'frontier_metadata_global'@'%'")
      await root.query('SET GLOBAL partial_revokes=OFF')
      await root.end()
    }
  })
  it.each([
    ['trigger', 'CREATE TRIGGER unexpected_trigger BEFORE UPDATE ON rooms FOR EACH ROW SET NEW.revision=NEW.revision', 'DROP TRIGGER IF EXISTS unexpected_trigger'],
    ['routine', 'CREATE PROCEDURE unexpected_routine() SELECT 1', 'DROP PROCEDURE IF EXISTS unexpected_routine'],
    ['event', 'CREATE EVENT unexpected_event ON SCHEDULE EVERY 1 DAY DISABLE DO SELECT 1', 'DROP EVENT IF EXISTS unexpected_event'],
    ['view', 'CREATE VIEW unexpected_view AS SELECT id FROM persistence_schema', 'DROP VIEW IF EXISTS unexpected_view'],
  ])('rejects an unexpected %s using complete metadata authority', async (_kind, create, drop) => {
    const admin = await ownedRootConnection()
    try {
      await admin.query(create)
      await expect(MysqlStore.prepareSchema({ ...mysqlTestConfig(), initialize: false })).rejects.toThrow('PERSISTENCE_OPEN_FAILED')
    } finally { await admin.query(drop); await admin.end() }
  })
  it('refuses partial schema without repairing it', async () => {
    const admin = await mysqlTestConnection()
    try {
      await admin.query('DROP TABLE quarantine')
      await expect(MysqlStore.prepareSchema(mysqlTestConfig())).rejects.toThrow('PERSISTENCE_OPEN_FAILED')
      const [rows] = await admin.query("SHOW TABLES LIKE 'quarantine'")
      expect(rows).toEqual([])
    } finally { await admin.end() }
  })
  it('quarantines malformed data with runtime DML alone', async () => {
    const admin = await mysqlTestConnection()
    try {
      await admin.execute('INSERT INTO rooms (room_code,revision,incarnation,payload,checksum) VALUES (?,?,?,?,?)',
        [Buffer.from('ABC123'), '1', Buffer.alloc(16), Buffer.from('invalid'), Buffer.alloc(64)])
    } finally { await admin.end() }
    const repository = await MysqlStore.open(restrictedMysqlConfig())
    try { expect(await repository.load()).toEqual([]) } finally { await repository.close() }
    const runtime = await runtimeConnection()
    try {
      const [rows] = await runtime.query('SELECT reason FROM quarantine')
      expect(rows).toEqual([{ reason: 'INVALID_RECORD' }])
    } finally { await runtime.end() }
  })
  it('denies runtime DDL, triggers, events, file, grants and account administration', async () => {
    const runtime = await runtimeConnection()
    try {
      const [grants] = await runtime.query('SHOW GRANTS')
      expect(JSON.stringify(grants)).not.toMatch(/\b(?:CREATE|ALTER|DROP|TRIGGER|EVENT|FILE|GRANT OPTION|SUPER)\b/u)
      for (const sql of [
        'UPDATE persistence_schema SET version=version WHERE id=1',
        'CREATE TABLE forbidden_table (id INT)', 'ALTER TABLE rooms ADD COLUMN forbidden INT', 'DROP TABLE quarantine',
        'CREATE TRIGGER forbidden_trigger BEFORE UPDATE ON rooms FOR EACH ROW SET NEW.revision=NEW.revision',
        'CREATE EVENT forbidden_event ON SCHEDULE EVERY 1 DAY DISABLE DO SELECT 1',
        "SELECT 1 INTO OUTFILE '/var/lib/mysql-files/frontier-forbidden-export'",
        "GRANT SELECT ON frontier_isles_mysql_test.rooms TO 'frontier_runtime'@'%'",
        "CREATE USER 'frontier_forbidden'@'%'", 'CREATE PROCEDURE forbidden_routine() SELECT 1',
      ]) {
        let denied = false
        let code = 'SUCCEEDED'
        try { await runtime.query(sql) } catch (error: unknown) {
          code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'UNKNOWN'
          denied = typeof error === 'object' && error !== null && 'code' in error
            && ['ER_TABLEACCESS_DENIED_ERROR', 'ER_COLUMNACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'ER_SPECIFIC_ACCESS_DENIED_ERROR',
              'ER_BINLOG_CREATE_ROUTINE_NEED_SUPER'].includes(String(error.code))
        }
        expect(denied, `${sql.split(' ').slice(0, 2).join(' ')}: ${code}`).toBe(true)
      }
    } finally { await runtime.end() }
  })
  it('runs the built one-shot initializer and exits without starting a server or reflecting credentials', async () => {
    await resetMysqlTestSchema()
    const outcome = await new Promise<{ readonly code: number | null; readonly output: string }>((done, reject) => {
      const child = spawn(process.execPath, [resolve('dist/src/persistence/mysql-schema-command.js')], {
        env: { ...process.env, MYSQL_SCHEMA_MODE: 'initialize' }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
      })
      let output = ''
      const timeout = setTimeout(() => { child.kill(); reject(new Error('Schema command timeout.')) }, 40_000)
      child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
      child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
      child.once('error', () => { clearTimeout(timeout); reject(new Error('Schema command failed to start.')) })
      child.once('close', (code) => { clearTimeout(timeout); done({ code, output }) })
    })
    expect(outcome.code).toBe(0)
    expect(outcome.output.trim()).toBe('{"code":"MYSQL_SCHEMA_AUDIT_PASSED"}')
  })
})
