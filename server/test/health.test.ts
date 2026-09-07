import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { parseServerConfig } from '../src/config.js'
import { createFrontierHttpServer } from '../src/create-http-server.js'

const openServers: ReturnType<typeof createFrontierHttpServer>[] = []

async function listen(): Promise<{ readonly baseUrl: string }> {
  const server = createFrontierHttpServer()
  openServers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${address.port}` }
}

afterEach(async () => {
  await Promise.all(openServers.splice(0).map(async (server) => {
    if (!server.listening) return
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error === undefined ? resolve() : reject(error))
    })
  }))
})

describe('server configuration', () => {
  it('uses the accepted local defaults', () => {
    expect(parseServerConfig({})).toEqual({
      port: 3001,
      clientOrigin: 'http://127.0.0.1:5173',
      nodeEnv: 'development',
      reconnectGraceMs: 30_000,
      roomIdleTtlMs: 1_800_000,
      gameAbandonedTtlMs: 1_800_000,
      persistenceFile: 'data/frontier-isles.sqlite',
      restartRecoveryGraceMs: 120_000,
    })
  })

  it.each(['', '0', '65536', '3.5', 'not-a-port'])('rejects invalid PORT %j', (port) => {
    expect(() => parseServerConfig({ PORT: port })).toThrow('PORT')
  })

  it.each(['', '0', '-1', '3.5', '2147483648'])('rejects invalid lifecycle delay %j', (value) => {
    expect(() => parseServerConfig({ RECONNECT_GRACE_MS: value })).toThrow('RECONNECT_GRACE_MS')
    expect(() => parseServerConfig({ ROOM_IDLE_TTL_MS: value })).toThrow('ROOM_IDLE_TTL_MS')
    expect(() => parseServerConfig({ GAME_ABANDONED_TTL_MS: value })).toThrow('GAME_ABANDONED_TTL_MS')
    expect(() => parseServerConfig({ RESTART_RECOVERY_GRACE_MS: value })).toThrow('RESTART_RECOVERY_GRACE_MS')
  })

  it.each([
    '',
    '*',
    'ftp://example.test',
    'http://user@example.test',
    'http://example.test/path',
  ])('rejects invalid CLIENT_ORIGIN %j', (clientOrigin) => {
      expect(() => parseServerConfig({ CLIENT_ORIGIN: clientOrigin })).toThrow('CLIENT_ORIGIN')
  })

  it('rejects an unsupported NODE_ENV', () => {
    expect(() => parseServerConfig({ NODE_ENV: 'staging' })).toThrow('NODE_ENV')
  })

  it.each(['', ':memory:', ' file.sqlite', 'database.json', '\\\\server\\share\\game.sqlite', 'bad\0.sqlite'])('rejects a non-local or malformed persistence filename', (value) => {
    expect(() => parseServerConfig({ PERSISTENCE_FILE: value })).toThrow('PERSISTENCE_FILE')
  })
})

describe('HTTP server', () => {
  it('returns the exact health response from an ephemeral port', async () => {
    const { baseUrl } = await listen()

    const response = await fetch(`${baseUrl}/health`)

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(await response.json()).toEqual({
      status: 'ok',
      service: 'frontier-isles-realtime',
      protocolVersion: 'V2_REALTIME_PROTOCOL_V1',
    })
  })

  it('returns a safe JSON 404 for unknown paths', async () => {
    const { baseUrl } = await listen()

    const response = await fetch(`${baseUrl}/unknown`)

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ error: 'NOT_FOUND' })
  })
})
