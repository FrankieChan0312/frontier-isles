import { readFileSync } from 'node:fs'
import { isIP } from 'node:net'

export interface MysqlConfig {
  readonly host: string
  readonly port: number
  readonly database: string
  readonly user: string
  readonly password: string
  readonly ca: string | null
  readonly initialize: boolean
}

/** Backend-only configuration. Errors never interpolate supplied values. */
export function parseMysqlConfig(env: NodeJS.ProcessEnv): MysqlConfig {
  const fail = (): never => { throw new Error('Invalid MySQL configuration. Check the private recovery runbook.') }
  const required = (name: string): string => {
    const value = env[name]
    if (value === undefined || value.length === 0 || value.length > 4096 || value.includes('\0')) return fail()
    return value
  }
  const host = required('MYSQL_HOST')
  if (!/^[a-zA-Z0-9.-]+$/u.test(host)) return fail()
  const database = required('MYSQL_DATABASE')
  if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/u.test(database)) return fail()
  const portText = env.MYSQL_PORT ?? '3306'
  const port = Number(portText)
  if (!/^\d+$/u.test(portText) || !Number.isInteger(port) || port < 1 || port > 65535) return fail()
  const tls = env.MYSQL_TLS ?? 'required'
  let ca: string | null = null
  if (tls === 'disabled') {
    if (env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost'].includes(host)) return fail()
  } else if (tls === 'required') {
    // mysql2 hostname verification uses TLS servername; require a DNS name for verified TLS.
    if (isIP(host) !== 0) return fail()
    try { ca = readFileSync(required('MYSQL_TLS_CA_FILE'), 'utf8') } catch { return fail() }
    if (ca.length > 1_048_576 || !ca.includes('-----BEGIN CERTIFICATE-----')) return fail()
  } else return fail()
  const mode = env.MYSQL_SCHEMA_MODE ?? 'verify'
  if (mode !== 'verify' && mode !== 'initialize') return fail()
  return { host, port, database, user: required('MYSQL_USER'), password: required('MYSQL_PASSWORD'), ca, initialize: mode === 'initialize' }
}
