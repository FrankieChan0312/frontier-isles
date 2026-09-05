export type ServerEnvironment = 'development' | 'test' | 'production'

export interface ServerConfig {
  readonly port: number
  readonly clientOrigin: string
  readonly nodeEnv: ServerEnvironment
}
const DEFAULT_PORT = '3001'
const DEFAULT_CLIENT_ORIGIN = 'http://127.0.0.1:5173'
const DEFAULT_NODE_ENV: ServerEnvironment = 'development'

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

export function parseServerConfig(environment: NodeJS.ProcessEnv): ServerConfig {
  return {
    port: parsePort(environment.PORT ?? DEFAULT_PORT),
    clientOrigin: parseClientOrigin(environment.CLIENT_ORIGIN ?? DEFAULT_CLIENT_ORIGIN),
    nodeEnv: parseNodeEnvironment(environment.NODE_ENV ?? DEFAULT_NODE_ENV),
  }
}
