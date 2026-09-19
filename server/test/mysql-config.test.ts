import { describe, expect, it } from 'vitest'
import { parseMysqlConfig } from '../src/persistence/mysql-config.js'
import { parseServerConfig } from '../src/config.js'

const local = { NODE_ENV: 'test', MYSQL_HOST: '127.0.0.1', MYSQL_PORT: '3306', MYSQL_DATABASE: 'frontier_isles_test',
  MYSQL_USER: 'test_user', MYSQL_PASSWORD: 'synthetic-config-only', MYSQL_TLS: 'disabled' }
describe('backend persistence provider configuration', () => {
  it('preserves SQLite default and validates explicit provider selection', () => {
    expect(parseServerConfig({}).persistenceProvider).toBe('sqlite')
    expect(() => parseServerConfig({ PERSISTENCE_PROVIDER: 'other' })).toThrow('PERSISTENCE_PROVIDER')
    const config = parseServerConfig({ ...local, PERSISTENCE_PROVIDER: 'mysql' })
    expect(config.persistenceProvider).toBe('mysql')
    expect(config.mysql?.initialize).toBe(false)
    expect(parseMysqlConfig({ ...local, MYSQL_SCHEMA_MODE: 'initialize' }).initialize).toBe(true)
  })
  it('requires verified TLS for production or non-loopback hosts and never reflects secrets in errors', () => {
    for (const change of [{ NODE_ENV: 'production' }, { MYSQL_HOST: 'remote.example' }, { MYSQL_TLS: 'other' },
      { MYSQL_PORT: '0' }, { MYSQL_PORT: '3306suffix' }, { MYSQL_DATABASE: 'unsafe;drop' }, { MYSQL_HOST: 'mysql://secret@host' },
      { MYSQL_USER: '' }, { MYSQL_PASSWORD: '' }, { MYSQL_TLS: 'required', MYSQL_TLS_CA_FILE: 'missing-secret-file' },
      { MYSQL_SCHEMA_MODE: 'reset' }]) {
      expect(() => parseMysqlConfig({ ...local, ...change })).toThrow('Invalid MySQL configuration. Check the private recovery runbook.')
    }
  })
})
