// @vitest-environment node

import type { Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RoomSnapshot } from '@frontier-isles/realtime-contracts'
import type { ServerConfig } from '../../../server/src/config.ts'
import { createFrontierHttpServer } from '../../../server/src/create-http-server.ts'
import { createRealtimeServer } from '../../../server/src/create-realtime-server.ts'
import { createGracefulShutdown } from '../../../server/src/graceful-shutdown.ts'
import type { LobbyGatewayState } from './lobby-gateway.ts'
import { SocketLobbyGateway } from './socket-lobby-gateway.ts'

interface RunningServer {
  readonly close: () => Promise<void>
  readonly httpServer: HttpServer
  readonly url: string
}

const TEST_CONFIG: ServerConfig = {
  port: 3001,
  clientOrigin: 'http://127.0.0.1:5173',
  nodeEnv: 'test',
}

const gateways: SocketLobbyGateway[] = []
const servers: RunningServer[] = []

async function startServer(): Promise<RunningServer> {
  const httpServer = createFrontierHttpServer()
  const realtimeServer = createRealtimeServer(httpServer, TEST_CONFIG)
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const address = httpServer.address() as AddressInfo
  const server = {
    close: createGracefulShutdown({ httpServer, realtimeServer }),
    httpServer,
    url: `http://127.0.0.1:${address.port}`,
  }
  servers.push(server)
  return server
}

function track(gateway: SocketLobbyGateway): LobbyGatewayState[] {
  gateways.push(gateway)
  const states: LobbyGatewayState[] = []
  gateway.subscribe((state) => states.push(state))
  return states
}

function latestSnapshot(states: readonly LobbyGatewayState[]): RoomSnapshot {
  const snapshot = states.at(-1)?.snapshot
  if (snapshot === null || snapshot === undefined) throw new Error('Expected a Lobby snapshot.')
  return snapshot
}

afterEach(async () => {
  for (const gateway of gateways.splice(0)) gateway.dispose()
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe('SocketLobbyGateway with a real ephemeral server', () => {
  it('creates, joins, and synchronizes Ready and Host AI changes', async () => {
    const server = await startServer()
    const host = new SocketLobbyGateway(server.url)
    const joiner = new SocketLobbyGateway(server.url)
    const hostStates = track(host)
    const joinerStates = track(joiner)

    await host.createRoom('  Ada  ')
    const roomCode = latestSnapshot(hostStates).roomCode
    await joiner.joinRoom('Grace', roomCode.toLowerCase())
    await vi.waitFor(() => expect(latestSnapshot(hostStates).revision).toBe(1))

    expect(hostStates.at(-1)).toMatchObject({ connectionState: 'CONNECTED', selfSeatId: 'NORTH' })
    expect(joinerStates.at(-1)).toMatchObject({ connectionState: 'CONNECTED', selfSeatId: 'EAST' })
    expect(latestSnapshot(hostStates)).toEqual(latestSnapshot(joinerStates))
    expect(latestSnapshot(hostStates).seats[0]).toMatchObject({ displayName: 'Ada' })

    await joiner.setReady(true)
    await vi.waitFor(() => expect(latestSnapshot(hostStates).revision).toBe(2))
    await host.setAiSeat('SOUTH', 'BUILDER')
    await vi.waitFor(() => expect(latestSnapshot(joinerStates).revision).toBe(3))

    expect(latestSnapshot(hostStates)).toEqual(latestSnapshot(joinerStates))
    expect(latestSnapshot(joinerStates).seats[1]).toMatchObject({ ready: true })
    expect(latestSnapshot(joinerStates).seats[2]).toMatchObject({
      occupancy: 'AI',
      profileId: 'BUILDER',
    })
  })

  it('surfaces a server public-safe join error without adopting Room state', async () => {
    const server = await startServer()
    const gateway = new SocketLobbyGateway(server.url)
    const states = track(gateway)

    await expect(gateway.createRoom('   ')).rejects.toThrow('Enter a valid display name.')
    await expect(gateway.joinRoom('Grace', 'ZZZ999')).rejects.toThrow('Room not found.')
    expect(states.at(-1)).toMatchObject({ selfSeatId: null, snapshot: null })
  })
})
