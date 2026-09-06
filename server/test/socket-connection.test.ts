import type { AddressInfo } from 'node:net'
import { io as createClient, type Socket as ClientSocket } from 'socket.io-client'
import { describe, expect, it } from 'vitest'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@frontier-isles/realtime-contracts'
import type { ServerConfig } from '../src/config.js'
import { createFrontierHttpServer } from '../src/create-http-server.js'
import {
  createRealtimeServer,
  createRealtimeServerOptions,
} from '../src/create-realtime-server.js'
import { createGracefulShutdown } from '../src/graceful-shutdown.js'

const TEST_CONFIG: ServerConfig = {
  port: 3001,
  clientOrigin: 'http://127.0.0.1:5173',
  nodeEnv: 'test',
  reconnectGraceMs: 30_000,
  roomIdleTtlMs: 1_800_000,
}

type TypedClientSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>

function waitForConnection(client: TypedClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    client.once('connect', resolve)
    client.once('connect_error', reject)
  })
}

describe('Socket.IO foundation', () => {
  it('uses an explicit credentialed CORS allowlist', () => {
    const options = createRealtimeServerOptions(TEST_CONFIG)
    expect(options.cors).toEqual({
      origin: ['http://127.0.0.1:5173'],
      credentials: true,
      methods: ['GET', 'POST'],
    })
    expect(options.connectionStateRecovery).toEqual({
      maxDisconnectionDuration: 30_000,
      skipMiddlewares: false,
    })
  })

  it('connects, disconnects, and shuts down cleanly on an ephemeral port', async () => {
    const httpServer = createFrontierHttpServer()
    const realtimeServer = createRealtimeServer(httpServer, TEST_CONFIG)
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
    const address = httpServer.address() as AddressInfo
    const client: TypedClientSocket = createClient(
      `http://127.0.0.1:${address.port}`,
      {
      forceNew: true,
      reconnection: false,
      transports: ['websocket'],
      },
    )

    await waitForConnection(client)
    expect(client.connected).toBe(true)

    client.disconnect()
    expect(client.connected).toBe(false)

    const shutdown = createGracefulShutdown({ httpServer, realtimeServer })
    const firstShutdown = shutdown()
    const secondShutdown = shutdown()
    expect(secondShutdown).toBe(firstShutdown)
    await Promise.all([firstShutdown, secondShutdown])
    expect(httpServer.listening).toBe(false)
  })
})
