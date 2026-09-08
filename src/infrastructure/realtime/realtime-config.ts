export interface RealtimeClientConfig {
  readonly url: string
}

export const DEFAULT_REALTIME_URL = 'http://127.0.0.1:3001'

export function parseRealtimeUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('VITE_REALTIME_URL must be a non-empty HTTP or HTTPS origin.')
  }

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('VITE_REALTIME_URL must be a valid HTTP or HTTPS origin.')
  }

  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    || parsed.username.length > 0
    || parsed.password.length > 0
    || parsed.pathname !== '/'
    || parsed.search.length > 0
    || parsed.hash.length > 0
  ) {
    throw new Error('VITE_REALTIME_URL must be an HTTP or HTTPS origin without credentials or a path.')
  }

  return parsed.origin
}

export function readRealtimeClientConfig(
  environmentValue: unknown = import.meta.env.VITE_REALTIME_URL ?? (import.meta.env.PROD ? 'same-origin' : DEFAULT_REALTIME_URL),
  browserOrigin: string = window.location.origin,
): RealtimeClientConfig {
  return Object.freeze({ url: parseRealtimeUrl(environmentValue === 'same-origin' ? browserOrigin : environmentValue) })
}
