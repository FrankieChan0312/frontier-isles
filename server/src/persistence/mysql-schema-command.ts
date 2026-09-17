import { parseMysqlConfig } from './mysql-config.js'
import { MysqlStore } from './mysql-store.js'

// Explicit operational entry point. No HTTP, Room recovery, payloads or credential output.
try {
  if (process.argv.length !== 2 || ['DEBUG', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE'].some((key) => (process.env[key] ?? '').trim().length > 0)) {
    throw new Error('Invalid schema command configuration.')
  }
  await MysqlStore.prepareSchema(parseMysqlConfig(process.env))
  console.log(JSON.stringify({ code: 'MYSQL_SCHEMA_AUDIT_PASSED' }))
} catch {
  console.error(JSON.stringify({ code: 'MYSQL_SCHEMA_AUDIT_FAILED' }))
  process.exitCode = 1
}
