import { createConnection, type Connection } from 'mysql2/promise'
import { parseMysqlConfig, type MysqlConfig } from '../src/persistence/mysql-config.js'

export function mysqlTestConfig(): MysqlConfig {
  if (!/^frontier-isles-mysql-[0-9a-f-]{36}$/u.test(process.env.FRONTIER_MYSQL_TEST_OWNER ?? '')
    || process.env.MYSQL_HOST !== '127.0.0.1' || process.env.MYSQL_DATABASE !== 'frontier_isles_mysql_test'
    || process.env.NODE_ENV !== 'test') throw new Error('Run through the owned local MySQL harness.')
  return parseMysqlConfig(process.env)
}
export async function mysqlTestConnection(): Promise<Connection> {
  const config = mysqlTestConfig()
  return createConnection({ host: config.host, port: config.port, user: config.user,
    password: config.password, database: config.database, connectTimeout: 2000, multipleStatements: false })
}
export async function resetMysqlTestSchema(): Promise<void> {
  const connection = await mysqlTestConnection()
  try {
    // These exact tables belong to the unique harness-owned container, never an existing DB.
    await connection.execute('DROP TABLE IF EXISTS rooms')
    await connection.execute('DROP TABLE IF EXISTS quarantine')
    await connection.execute('DROP TABLE IF EXISTS persistence_schema')
  } finally { await connection.end() }
}
