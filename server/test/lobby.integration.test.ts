import type { Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import {
  io as createClient,
  type Socket as ClientSocket,
} from 'socket.io-client'
import { afterEach, describe, expect, it } from 'vitest'
import {
  REALTIME_PROTOCOL_VERSION,
  roomCreateAcknowledgementSchema,
  roomCreateRequestSchema,
  roomJoinRequestSchema,
  roomLeaveRequestSchema,
  roomRequestSnapshotRequestSchema,
  roomSetAiSeatRequestSchema,
  roomSetReadyRequestSchema,
  roomStartRequestSchema,
  sessionResumeRequestSchema,
  type Acknowledgement,
  type ClientToServerEvents,
  type RoomCreateAcknowledgement,
  type RoomJoinAcknowledgement,
  type RoomLeaveAcknowledgement,
  type RoomRequestSnapshotAcknowledgement,
  type RoomSetAiSeatAcknowledgement,
  type RoomSetReadyAcknowledgement,
  type RoomSnapshot,
  type RoomSessionData,
  type RoomStartAcknowledgement,
  type SessionResumeAcknowledgement,
  type ServerToClientEvents,
} from '@frontier-isles/realtime-contracts'
import type { ServerConfig } from '../src/config.js'
import { createFrontierHttpServer } from '../src/create-http-server.js'
import { createRealtimeServer } from '../src/create-realtime-server.js'
import { createGracefulShutdown } from '../src/graceful-shutdown.js'
import { InMemoryRoomService } from '../src/lobby/room-service.js'
import { FakeLifecycleRuntime } from './fake-lifecycle-runtime.js'

type LobbyClient = ClientSocket<ServerToClientEvents, ClientToServerEvents>

interface RunningLobbyServer {
  readonly httpServer: HttpServer
  readonly roomService: InMemoryRoomService
  readonly close: () => Promise<void>
  readonly url: string
}

const TEST_CONFIG: ServerConfig = {
  port: 3001,
  clientOrigin: 'http://127.0.0.1:5173',
  nodeEnv: 'test',
  reconnectGraceMs: 30_000,
  roomIdleTtlMs: 1_800_000,
}

const clients: LobbyClient[] = []
const servers: RunningLobbyServer[] = []

async function startLobbyServer(
  roomService: InMemoryRoomService = new InMemoryRoomService(),
): Promise<RunningLobbyServer> {
  const httpServer = createFrontierHttpServer()
  const realtimeServer = createRealtimeServer(httpServer, TEST_CONFIG, { roomService })
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve))
  const address = httpServer.address() as AddressInfo
  const running = {
    httpServer,
    roomService,
    close: createGracefulShutdown({ httpServer, realtimeServer }),
    url: `http://127.0.0.1:${address.port}`,
  }
  servers.push(running)
  return running
}

async function connectClient(url: string): Promise<LobbyClient> {
  const client: LobbyClient = createClient(url, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ['websocket'],
  })
  clients.push(client)
  const connected = new Promise<void>((resolve, reject) => {
    client.once('connect', resolve)
    client.once('connect_error', reject)
  })
  const hello = new Promise<void>((resolve) => {
    client.once('server:hello', (value) => {
      expect(value.protocolVersion).toBe(REALTIME_PROTOCOL_VERSION)
      resolve()
    })
  })
  client.connect()
  await Promise.all([connected, hello])
  return client
}

function successData<T>(acknowledgement: Acknowledgement<T>): T {
  expect(acknowledgement.ok).toBe(true)
  if (!acknowledgement.ok) throw new Error(acknowledgement.error.message)
  return acknowledgement.data
}

function createRoom(client: LobbyClient, displayName: string): Promise<RoomCreateAcknowledgement> {
  return new Promise((resolve) => {
    client.emit('room:create', roomCreateRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      displayName,
    }), resolve)
  })
}

function joinRoom(
  client: LobbyClient,
  roomCode: string,
  displayName: string,
): Promise<RoomJoinAcknowledgement> {
  return new Promise((resolve) => {
    client.emit('room:join', roomJoinRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      roomCode,
      displayName,
    }), resolve)
  })
}

function setReady(
  client: LobbyClient,
  expectedRevision: number,
  ready: boolean,
): Promise<RoomSetReadyAcknowledgement> {
  return new Promise((resolve) => {
    client.emit('room:set-ready', roomSetReadyRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      expectedRevision,
      ready,
    }), resolve)
  })
}

function setAiSeat(
  client: LobbyClient,
  expectedRevision: number,
  seatId: 'NORTH' | 'EAST' | 'SOUTH' | 'WEST',
  profileId: 'MERCHANT' | 'BUILDER' | 'SENTINEL' | null,
): Promise<RoomSetAiSeatAcknowledgement> {
  return new Promise((resolve) => {
    client.emit('room:set-ai-seat', roomSetAiSeatRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      expectedRevision,
      seatId,
      profileId,
    }), resolve)
  })
}

function leaveRoom(client: LobbyClient): Promise<RoomLeaveAcknowledgement> {
  return new Promise((resolve) => {
    client.emit('room:leave', roomLeaveRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
    }), resolve)
  })
}

function startRoom(client: LobbyClient, expectedRevision: number): Promise<RoomStartAcknowledgement> {
  return new Promise((resolve) => {
    client.emit('room:start', roomStartRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      expectedRevision,
    }), resolve)
  })
}

function resumeSession(
  client: LobbyClient,
  credential: RoomSessionData['credential'],
): Promise<SessionResumeAcknowledgement> {
  return new Promise((resolve) => {
    client.emit('session:resume', sessionResumeRequestSchema.parse(credential), resolve)
  })
}

function requestSnapshot(client: LobbyClient): Promise<RoomRequestSnapshotAcknowledgement> {
  return new Promise((resolve) => {
    client.emit('room:request-snapshot', roomRequestSnapshotRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
    }), resolve)
  })
}

function nextSnapshot(client: LobbyClient, revision: number): Promise<RoomSnapshot> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Snapshot revision ${revision} was not received.`)), 2_000)
    const listener = (snapshot: RoomSnapshot): void => {
      if (snapshot.revision !== revision) return
      clearTimeout(timeout)
      client.off('room:snapshot', listener)
      resolve(snapshot)
    }
    client.on('room:snapshot', listener)
  })
}

afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  await Promise.all(servers.splice(0).map((server) => server.close()))
})

describe('realtime Lobby integration', () => {
  it('synchronizes create, join, Ready, Host AI, safe rejection, start refusal, and leave', async () => {
    const server = await startLobbyServer()
    const host = await connectClient(server.url)
    const joiner = await connectClient(server.url)

    const created = successData(await createRoom(host, 'Ada'))
    const hostJoinSnapshot = nextSnapshot(host, 1)
    const joined = successData(await joinRoom(joiner, created.credential.roomCode, 'Grace'))
    expect(await hostJoinSnapshot).toEqual(joined.snapshot)

    const hostReadySnapshot = nextSnapshot(host, 2)
    const joinerReadySnapshot = nextSnapshot(joiner, 2)
    const ready = successData(await setReady(joiner, joined.snapshot.revision, true))
    expect(await hostReadySnapshot).toEqual(ready.snapshot)
    expect(await joinerReadySnapshot).toEqual(ready.snapshot)

    const hostAiSnapshot = nextSnapshot(host, 3)
    const joinerAiSnapshot = nextSnapshot(joiner, 3)
    const ai = successData(await setAiSeat(host, ready.snapshot.revision, 'SOUTH', 'BUILDER'))
    expect(await hostAiSnapshot).toEqual(ai.snapshot)
    expect(await joinerAiSnapshot).toEqual(ai.snapshot)

    const rejected = await setAiSeat(joiner, ai.snapshot.revision, 'WEST', 'MERCHANT')
    expect(rejected).toMatchObject({ ok: false, error: { code: 'NOT_HOST' } })
    expect(JSON.stringify(rejected)).not.toContain('stack')

    const start = await startRoom(host, ai.snapshot.revision)
    expect(start).toMatchObject({ ok: false, error: { code: 'GAME_START_NOT_AVAILABLE' } })

    const hostLeaveSnapshot = nextSnapshot(host, 4)
    const leave = successData(await leaveRoom(joiner))
    expect(leave.roomCode).toBe(created.snapshot.roomCode)
    expect(await hostLeaveSnapshot).toMatchObject({ revision: 4, hostSeatId: 'NORTH' })
  })

  it('isolates broadcasts between Room codes', async () => {
    const server = await startLobbyServer()
    const firstHost = await connectClient(server.url)
    const secondHost = await connectClient(server.url)
    const first = successData(await createRoom(firstHost, 'Ada'))
    const second = successData(await createRoom(secondHost, 'Grace'))
    expect(first.snapshot.roomCode).not.toBe(second.snapshot.roomCode)

    const leakedSnapshots: RoomSnapshot[] = []
    secondHost.on('room:snapshot', (snapshot) => {
      if (snapshot.roomCode === first.snapshot.roomCode) leakedSnapshots.push(snapshot)
    })
    const firstUpdate = nextSnapshot(firstHost, 1)
    successData(await setReady(firstHost, first.snapshot.revision, true))
    await firstUpdate
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(leakedSnapshots).toEqual([])
  })

  it('returns a strict public-safe protocol error for an untrusted payload', async () => {
    const server = await startLobbyServer()
    const client = await connectClient(server.url)
    const rawClient = client as ClientSocket

    const acknowledgement = await new Promise<unknown>((resolve) => {
      rawClient.emit('room:create', {
        protocolVersion: 'OLD_PROTOCOL',
        displayName: 'Ada',
        actorId: 'spoofed',
      }, resolve)
    })
    const parsed = roomCreateAcknowledgementSchema.parse(acknowledgement)
    expect(parsed).toMatchObject({
      ok: false,
      error: { code: 'PROTOCOL_VERSION_MISMATCH' },
    })
    expect(JSON.stringify(parsed)).not.toMatch(/stack|socket|token/iu)
  })

  it('marks a disconnect reconnecting, resumes the same Ready seat, and resynchronizes explicitly', async () => {
    const server = await startLobbyServer()
    const host = await connectClient(server.url)
    const joiner = await connectClient(server.url)
    const created = successData(await createRoom(host, 'Ada'))
    const joined = successData(await joinRoom(joiner, created.credential.roomCode, 'Grace'))
    const ready = successData(await setReady(joiner, joined.snapshot.revision, true))
    const reconnectingSnapshot = nextSnapshot(host, ready.snapshot.revision + 1)

    joiner.disconnect()
    const reconnecting = await reconnectingSnapshot
    expect(reconnecting.seats[1]).toMatchObject({
      seatId: 'EAST',
      ready: true,
      connectionStatus: 'RECONNECTING',
    })
    expect(reconnecting.startReadiness.blockers).toContain('HUMANS_NOT_CONNECTED')

    const resumedClient = await connectClient(server.url)
    const resumedSnapshot = nextSnapshot(host, reconnecting.revision + 1)
    const resumed = successData(await resumeSession(resumedClient, joined.credential))
    expect(resumed.credential).toEqual(joined.credential)
    expect(resumed.snapshot.seats[1]).toMatchObject({
      seatId: 'EAST',
      ready: true,
      connectionStatus: 'CONNECTED',
    })
    expect(await resumedSnapshot).toEqual(resumed.snapshot)

    const resynchronized = successData(await requestSnapshot(resumedClient))
    expect(resynchronized.snapshot).toEqual(resumed.snapshot)
    expect(JSON.stringify(resynchronized.snapshot)).not.toContain(joined.credential.resumeToken)
  })

  it('lets the newest valid duplicate resume win and prevents the replaced socket from mutating', async () => {
    const server = await startLobbyServer()
    const host = await connectClient(server.url)
    const original = await connectClient(server.url)
    const created = successData(await createRoom(host, 'Ada'))
    const joined = successData(await joinRoom(original, created.credential.roomCode, 'Grace'))
    const replacement = await connectClient(server.url)
    const replacedNotice = new Promise<void>((resolve) => {
      original.once('session:replaced', (notice) => {
        expect(notice).toEqual({
          code: 'SESSION_REPLACED',
          message: 'This session continued in a newer tab.',
        })
        resolve()
      })
    })

    const resumed = successData(await resumeSession(replacement, joined.credential))
    await replacedNotice
    expect(original.connected).toBe(false)
    expect(resumed.snapshot.revision).toBe(joined.snapshot.revision)

    original.emit('room:set-ready', roomSetReadyRequestSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      expectedRevision: resumed.snapshot.revision,
      ready: true,
    }), () => { throw new Error('A replaced socket received an acknowledgement.') })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(server.roomService.getSnapshot(created.credential.roomCode)?.revision).toBe(
      resumed.snapshot.revision,
    )

    const accepted = successData(await setReady(replacement, resumed.snapshot.revision, true))
    expect(accepted.snapshot.revision).toBe(resumed.snapshot.revision + 1)
  })

  it('rejects a forged resume token without revealing credential details', async () => {
    const server = await startLobbyServer()
    const host = await connectClient(server.url)
    const attacker = await connectClient(server.url)
    const created = successData(await createRoom(host, 'Ada'))

    const rejected = await resumeSession(attacker, {
      ...created.credential,
      resumeToken: 'Z'.repeat(43) as RoomSessionData['credential']['resumeToken'],
    })
    expect(rejected).toMatchObject({ ok: false, error: { code: 'SESSION_INVALID' } })
    expect(JSON.stringify(rejected)).not.toContain(created.credential.resumeToken)
    expect(JSON.stringify(rejected)).not.toMatch(/digest|stack|socket/iu)
  })

  it('notifies and disconnects clients when fake-time idle cleanup closes a Room', async () => {
    const runtime = new FakeLifecycleRuntime()
    const roomService = new InMemoryRoomService({
      reconnectGraceMs: 100,
      roomIdleTtlMs: 1_000,
      runtime,
    })
    const server = await startLobbyServer(roomService)
    const host = await connectClient(server.url)
    const created = successData(await createRoom(host, 'Ada'))
    const closedNotice = new Promise<unknown>((resolve) => host.once('room:closed', resolve))
    const disconnected = new Promise<void>((resolve) => host.once('disconnect', () => resolve()))

    runtime.advanceBy(1_000)

    await expect(closedNotice).resolves.toMatchObject({
      roomCode: created.credential.roomCode,
      reason: 'IDLE_TIMEOUT',
    })
    await disconnected
    expect(host.connected).toBe(false)
    expect(roomService.roomCount).toBe(0)
    expect(roomService.hasSession(created.credential.sessionId)).toBe(false)
    expect(JSON.stringify(await closedNotice)).not.toContain(created.credential.resumeToken)
  })
})
