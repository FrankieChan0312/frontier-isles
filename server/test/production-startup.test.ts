import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseServerConfig } from '../src/config.js'
import { createFrontierHttpServer } from '../src/create-http-server.js'
import { SqliteMultiplayerRepository } from '../src/persistence/sqlite-multiplayer-repository.js'
import { temporaryPersistenceDirectory } from './persistence-test-helpers.js'

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
function fixture(): { readonly root: string; readonly database: string; readonly environment: NodeJS.ProcessEnv } {
  const directory = temporaryPersistenceDirectory()
  cleanup.push(directory.remove)
  const root = join(directory.path, 'public')
  mkdirSync(root)
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Public build</title>')
  // Configuration parser sentinel only; not a usable certificate or TLS qualification.
  const ca = join(directory.path, 'parser-only.pem')
  writeFileSync(ca, '-----BEGIN CERTIFICATE-----\nPARSER_ONLY\n-----END CERTIFICATE-----')
  return { root, database: directory.database, environment: { NODE_ENV: 'production',
    CLIENT_ORIGINS: 'https://play.example.test', STATIC_ROOT: root, PERSISTENCE_PROVIDER: 'mysql',
    MYSQL_HOST: 'database.example.test', MYSQL_DATABASE: 'frontier_test', MYSQL_USER: 'runtime_test',
    MYSQL_PASSWORD: 'synthetic-parser-only', MYSQL_TLS: 'required', MYSQL_TLS_CA_FILE: ca, MYSQL_SCHEMA_MODE: 'verify' } }
}

describe('production persistence-aware startup', () => {
  it('accepts SQLite with a real private file and a valid production static root', async () => {
    const value = fixture()
    const repository = new SqliteMultiplayerRepository(value.database)
    cleanup.push(() => repository.close())
    const config = parseServerConfig({ ...value.environment, PERSISTENCE_PROVIDER: 'sqlite', PERSISTENCE_FILE: value.database })
    const server = createFrontierHttpServer({ staticRoot: value.root, privateDataFile: config.persistenceFile ?? '' })
    cleanup.push(() => { server.close() })
    expect(existsSync(value.database)).toBe(true)
  })
  it('retains both lexical and resolved SQLite confinement inside the public build', () => {
    const value = fixture()
    const privatePath = join(value.root, 'private.sqlite')
    writeFileSync(privatePath, 'PRIVATE_SENTINEL')
    expect(() => parseServerConfig({ ...value.environment, PERSISTENCE_PROVIDER: 'sqlite', PERSISTENCE_FILE: privatePath })).toThrow('outside STATIC_ROOT')
    expect(() => createFrontierHttpServer({ staticRoot: value.root, privateDataFile: privatePath })).toThrow('public frontend build')
  })
  it('does not configure or create a SQLite file for MySQL, even if an inherited path is invalid', () => {
    const value = fixture()
    for (const extra of [{}, { PERSISTENCE_FILE: 'not-a-sqlite-path' }]) {
      const config = parseServerConfig({ ...value.environment, ...extra })
      expect(config.persistenceProvider).toBe('mysql')
      expect(config.persistenceFile).toBeUndefined()
      expect(config.mysql).toBeDefined()
    }
    expect(existsSync(value.database)).toBe(false)
  })
  it('fails closed on missing MySQL credentials rather than selecting SQLite', () => {
    const value = fixture()
    expect(() => parseServerConfig({ ...value.environment, MYSQL_USER: '' })).toThrow('Invalid MySQL configuration')
    expect(existsSync(value.database)).toBe(false)
  })
  it('requires a valid static root for MySQL and rejects runtime bootstrap', () => {
    const value = fixture()
    const { STATIC_ROOT: omitted, ...missing } = value.environment
    expect(omitted).toBe(value.root)
    expect(() => parseServerConfig(missing)).toThrow('STATIC_ROOT')
    expect(() => parseServerConfig({ ...value.environment, STATIC_ROOT: 'relative' })).toThrow('STATIC_ROOT')
    expect(() => createFrontierHttpServer({ staticRoot: join(value.root, 'absent') })).toThrow('public frontend build')
    expect(() => parseServerConfig({ ...value.environment, MYSQL_SCHEMA_MODE: 'initialize' })).toThrow('one-shot schema command')
  })
})
