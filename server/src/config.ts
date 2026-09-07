export type ServerEnvironment = 'development' | 'test' | 'production'

export interface ServerConfig {
  readonly port: number
  readonly clientOrigin: string
  readonly nodeEnv: ServerEnvironment
  readonly reconnectGraceMs: number
  readonly roomIdleTtlMs: number
  readonly gameAbandonedTtlMs?: number
  readonly persistenceFile?: string
  readonly restartRecoveryGraceMs?: number
}
const DEFAULT_PORT = '3001'
const DEFAULT_CLIENT_ORIGIN = 'http://127.0.0.1:5173'
const DEFAULT_NODE_ENV: ServerEnvironment = 'development'
const DEFAULT_RECONNECT_GRACE_MS = '30000'
const DEFAULT_ROOM_IDLE_TTL_MS = '1800000'
const MAX_TIMER_DELAY_MS = 2_147_483_647

function parsePort(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new Error('PORT must be a whole number between 1 and 65535.')
  }

  const port = Number(value)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be a whole number between 1 and 65535.')
  }

  return port
}

function parseClientOrigin(value: string): string {
  if (value.length === 0 || value === '*') {
    throw new Error('CLIENT_ORIGIN must be one explicit HTTP or HTTPS origin.')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('CLIENT_ORIGIN must be one explicit HTTP or HTTPS origin.')
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    || parsed.username.length > 0
    || parsed.password.length > 0
    || parsed.pathname !== '/'
    || parsed.search.length > 0
    || parsed.hash.length > 0
  ) {
    throw new Error('CLIENT_ORIGIN must be one explicit HTTP or HTTPS origin.')
  }

  return parsed.origin
}

function parseNodeEnvironment(value: string): ServerEnvironment {
  if (value === 'development' || value === 'test' || value === 'production') {
    return value
  }
  throw new Error('NODE_ENV must be development, test, or production.')
}

function parseTimerDelay(value: string, label: string): number {
  if (!/^\d+$/u.test(value)) {
    throw new Error(`${label} must be a whole number between 1 and ${MAX_TIMER_DELAY_MS}.`)
  }
  const delay = Number(value)
  if (!Number.isSafeInteger(delay) || delay < 1 || delay > MAX_TIMER_DELAY_MS) {
    throw new Error(`${label} must be a whole number between 1 and ${MAX_TIMER_DELAY_MS}.`)
  }
  return delay
}

export function parseServerConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  const persistenceFile = environment.PERSISTENCE_FILE ?? 'data/frontier-isles.sqlite'
  if (persistenceFile.trim() !== persistenceFile || persistenceFile.length === 0 || persistenceFile.length > 4096
    || persistenceFile.includes('\0') || persistenceFile.startsWith('\\\\') || !persistenceFile.endsWith('.sqlite')) {
    throw new Error('PERSISTENCE_FILE must name a local SQLite file ending in .sqlite.')
  }
  return {
    port: parsePort(environment.PORT ?? DEFAULT_PORT),
    clientOrigin: parseClientOrigin(environment.CLIENT_ORIGIN ?? DEFAULT_CLIENT_ORIGIN),
    nodeEnv: parseNodeEnvironment(environment.NODE_ENV ?? DEFAULT_NODE_ENV),
    reconnectGraceMs: parseTimerDelay(
      environment.RECONNECT_GRACE_MS ?? DEFAULT_RECONNECT_GRACE_MS,
      'RECONNECT_GRACE_MS',
    ),
    roomIdleTtlMs: parseTimerDelay(
      environment.ROOM_IDLE_TTL_MS ?? DEFAULT_ROOM_IDLE_TTL_MS,
      'ROOM_IDLE_TTL_MS',
    ),
    gameAbandonedTtlMs: parseTimerDelay(environment.GAME_ABANDONED_TTL_MS ?? DEFAULT_ROOM_IDLE_TTL_MS, 'GAME_ABANDONED_TTL_MS'),
    persistenceFile,
    restartRecoveryGraceMs: parseTimerDelay(environment.RESTART_RECOVERY_GRACE_MS ?? '120000', 'RESTART_RECOVERY_GRACE_MS'),
  }
}
