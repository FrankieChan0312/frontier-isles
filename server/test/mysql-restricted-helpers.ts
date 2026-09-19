import { createConnection } from 'mysql2/promise'
import type { MysqlConfig } from '../src/persistence/mysql-config.js'
import { MysqlStore } from '../src/persistence/mysql-store.js'
import { mysqlTestConfig, resetMysqlTestSchema } from './mysql-test-helpers.js'

export function restrictedMysqlConfig(): MysqlConfig {
  const config = mysqlTestConfig()
  const password = process.env.FRONTIER_MYSQL_RUNTIME_PASSWORD
  if (password === undefined || !/^[0-9a-f]{48}$/u.test(password)) throw new Error('Owned runtime credential unavailable.')
  return { ...config, initialize: false, user: 'frontier_runtime', password }
}

export async function prepareRestrictedMysql(): Promise<void> {
  const config = mysqlTestConfig() // Ownership/loopback check before any privileged connection.
  const rootPassword = process.env.MYSQL_ROOT_PASSWORD
  if (rootPassword === undefined || !/^[0-9a-f]{48}$/u.test(rootPassword)) throw new Error('Owned bootstrap credential unavailable.')
  await resetMysqlTestSchema()
  await MysqlStore.prepareSchema({ ...config, initialize: true })
  const runtime = restrictedMysqlConfig()
  const root = await createConnection({ host: config.host, port: config.port, user: 'root', password: rootPassword, connectTimeout: 2000 })
  try {
    await root.query('CREATE USER IF NOT EXISTS ?@? IDENTIFIED BY ?', [runtime.user, '%', runtime.password])
    // Fixed identifiers belong exclusively to the harness-created database.
    await root.query("GRANT SELECT ON frontier_isles_mysql_test.persistence_schema TO 'frontier_runtime'@'%'")
    await root.query("GRANT UPDATE (id) ON frontier_isles_mysql_test.persistence_schema TO 'frontier_runtime'@'%'")
    await root.query("GRANT SELECT,INSERT,UPDATE,DELETE ON frontier_isles_mysql_test.rooms TO 'frontier_runtime'@'%'")
    await root.query("GRANT SELECT,INSERT ON frontier_isles_mysql_test.quarantine TO 'frontier_runtime'@'%'")
  } finally { await root.end() }
}
