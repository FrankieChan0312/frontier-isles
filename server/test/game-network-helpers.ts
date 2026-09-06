import type { AddressInfo } from 'node:net'
import { io, type Socket } from 'socket.io-client'
import {
  REALTIME_PROTOCOL_VERSION, gameIdSchema, gameUpdateSchema,
  roomCreateAcknowledgementSchema, roomJoinAcknowledgementSchema, gameRequestSnapshotAcknowledgementSchema,
  type ClientToServerEvents, type ServerToClientEvents, type GameUpdate,
  type RoomSessionData, type RoomSnapshot,
} from '@frontier-isles/realtime-contracts'
import { createFrontierHttpServer } from '../src/create-http-server.js'
import { createRealtimeServer } from '../src/create-realtime-server.js'
import { createGracefulShutdown } from '../src/graceful-shutdown.js'
import { InMemoryRoomService } from '../src/lobby/room-service.js'
import type { GameSessionDependencies } from '../src/game/game-session.js'
import { FakeLifecycleRuntime } from './fake-lifecycle-runtime.js'
import { requireValue, successData } from './game-test-helpers.js'

export type GameClient = Socket<ServerToClientEvents, ClientToServerEvents>
export interface NetworkGame {
  readonly service: InMemoryRoomService
  readonly clients: readonly GameClient[]
  readonly members: readonly RoomSessionData[]
  readonly updates: readonly GameUpdate[][]
  readonly connect: () => Promise<GameClient>
  readonly snapshot: () => RoomSnapshot
  readonly recoveryPackets: () => readonly unknown[]
  readonly close: () => Promise<void>
}

export async function networkGame(humans = 2, dependencies: GameSessionDependencies = {}): Promise<NetworkGame> {
  const service = new InMemoryRoomService({ runtime: new FakeLifecycleRuntime(),
    // NORTH starts with this fixed seed; AI-first and private-response pauses have separate tests.
    nextGameIdentity: () => ({ gameId: gameIdSchema.parse('game:network-test'), seed: 'NETWORK-GAME-TEST-0' }),
    gameDependencies: dependencies })
  const httpServer = createFrontierHttpServer()
  const realtimeServer = createRealtimeServer(httpServer, { port: 3001, clientOrigin: 'http://127.0.0.1:5173',
    nodeEnv: 'test', reconnectGraceMs: 30_000, roomIdleTtlMs: 1_800_000 }, { roomService: service })
  const shutdown = createGracefulShutdown({ httpServer, realtimeServer })
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const address = httpServer.address() as AddressInfo
  const connected: GameClient[] = []
  async function connect(): Promise<GameClient> {
    const client: GameClient = io(`http://127.0.0.1:${address.port}`, {
      autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'],
    })
    connected.push(client)
    const hello = new Promise<void>((resolve, reject) => {
      client.once('server:hello', () => resolve())
      client.once('connect_error', reject)
    })
    client.connect()
    await hello
    return client
  }
  const clients: GameClient[] = []
  const members: RoomSessionData[] = []
  const updates: GameUpdate[][] = []
  for (let index = 0; index < humans; index += 1) {
    const client = await connect()
    clients.push(client)
    const captured: GameUpdate[] = []
    updates.push(captured)
    client.on('game:update', (update, received) => {
      captured.push(gameUpdateSchema.parse(update))
      received()
    })
    const first = members[0]
    const member = first === undefined
      ? successData(roomCreateAcknowledgementSchema.parse(await client.timeout(5_000).emitWithAck('room:create', { protocolVersion: REALTIME_PROTOCOL_VERSION, displayName: 'Host' })))
      : successData(roomJoinAcknowledgementSchema.parse(await client.timeout(5_000).emitWithAck('room:join', {
          protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: first.credential.roomCode, displayName: `Human ${index}` })))
    members.push(member)
  }
  const first = requireValue(members[0])
  function snapshot(): RoomSnapshot { return requireValue(service.getSnapshot(first.credential.roomCode)) }
  const host = requireValue(clients[0])
  for (const seat of snapshot().seats) {
    if (seat.occupancy === 'EMPTY') successData(await host.timeout(5_000).emitWithAck('room:set-ai-seat', {
      protocolVersion: REALTIME_PROTOCOL_VERSION, expectedRevision: snapshot().revision,
      seatId: seat.seatId, profileId: seat.seatId === 'SOUTH' ? 'BUILDER' : 'MERCHANT',
    }))
  }
  for (const client of clients) successData(await client.timeout(5_000).emitWithAck('room:set-ready', {
    protocolVersion: REALTIME_PROTOCOL_VERSION, expectedRevision: snapshot().revision, ready: true,
  }))
  return { service, clients, members, updates, connect, snapshot,
    recoveryPackets: () => {
      // Inspect the real adapter in tests only; no production introspection endpoint exists.
      const packets: unknown = Object.getOwnPropertyDescriptor(realtimeServer.of('/').adapter, 'packets')?.value
      if (!Array.isArray(packets)) throw new Error('Expected the configured recovery adapter.')
      return packets as readonly unknown[]
    },
    close: async () => { for (const client of connected) client.disconnect(); service.dispose(); await shutdown() } }
}

export async function startNetworkGame(network: NetworkGame): Promise<void> {
  successData(await requireValue(network.clients[0]).timeout(5_000).emitWithAck('room:start', {
    protocolVersion: REALTIME_PROTOCOL_VERSION, expectedRevision: network.snapshot().revision,
  }))
  await requireValue(network.service.getGameSession(network.snapshot().roomCode)).advanceAi()
}

export async function networkSnapshot(network: NetworkGame, client: GameClient): Promise<GameUpdate> {
  return successData(gameRequestSnapshotAcknowledgementSchema.parse(await client.timeout(5_000).emitWithAck('game:request-snapshot', {
    protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: network.snapshot().roomCode,
    gameId: requireValue(network.snapshot().gameId),
  })))
}
