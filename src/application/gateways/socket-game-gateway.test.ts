// @vitest-environment node
import type { AddressInfo } from 'node:net'
import { io, type Socket } from 'socket.io-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CommandEnvelope } from '@frontier-isles/game-core/contracts/commands'
import type { CommandId } from '@frontier-isles/game-core/model/ids'
import {
  gameCommandRequestSchema, gameIdSchema, type ClientToServerEvents, type ServerToClientEvents,
  type SessionCredential, type GameUpdate as WireUpdate,
} from '@frontier-isles/realtime-contracts'
import { createFrontierHttpServer } from '../../../server/src/create-http-server.ts'
import { createRealtimeServer, type RealtimeServer } from '../../../server/src/create-realtime-server.ts'
import { createGracefulShutdown } from '../../../server/src/graceful-shutdown.ts'
import { InMemoryRoomService } from '../../../server/src/lobby/room-service.ts'
import { FakeLifecycleRuntime } from '../../../server/test/fake-lifecycle-runtime.ts'
import { actionFixture, requireValue } from '../../../server/test/game-test-helpers.ts'
import type { LobbyCredentialStore } from '../../infrastructure/realtime/lobby-credential-store.ts'
import type { GameUpdate } from './game-gateway.ts'
import type { LobbyGatewayState } from './lobby-gateway.ts'
import { SocketLobbyGateway } from './socket-lobby-gateway.ts'

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>
class MemoryCredentialStore implements LobbyCredentialStore {
  public credential: SessionCredential | null = null
  public load(): SessionCredential | null { return this.credential }
  public save(credential: SessionCredential): void { this.credential = credential }
  public clear(): void { this.credential = null }
}

interface TestClient {
  readonly lobby: SocketLobbyGateway
  readonly socket: GameSocket
  readonly credentialStore: MemoryCredentialStore
  readonly gameUpdates: GameUpdate[]
  readonly lobbyUpdates: LobbyGatewayState[]
}
interface Harness {
  readonly host: TestClient
  readonly joiner: TestClient
  readonly server: RealtimeServer
  readonly rooms: InMemoryRoomService
  readonly addClient: (namespace: string, store?: MemoryCredentialStore) => TestClient
  readonly close: () => Promise<void>
}
const harnesses: Harness[] = []
function last(client: TestClient): GameUpdate { return requireValue(client.gameUpdates.at(-1)) }
function lobbyState(client: TestClient): LobbyGatewayState { return requireValue(client.lobbyUpdates.at(-1)) }

async function startedHarness(): Promise<Harness> {
  const rooms = new InMemoryRoomService({ runtime: new FakeLifecycleRuntime(),
    nextGameIdentity: () => ({ gameId: gameIdSchema.parse('game:gateway-test'), seed: 'GATEWAY-TEST' }),
    gameDependencies: { createState: actionFixture } })
  const http = createFrontierHttpServer()
  const server = createRealtimeServer(http, { port: 3001, clientOrigin: 'http://127.0.0.1:5173',
    nodeEnv: 'test', reconnectGraceMs: 30_000, roomIdleTtlMs: 1_800_000 }, { roomService: rooms })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  const clients: TestClient[] = []
  function addClient(namespace: string, store = new MemoryCredentialStore()): TestClient {
    const socket: GameSocket = io(url, { autoConnect: false, forceNew: true, transports: ['websocket'] })
    const lobby = new SocketLobbyGateway(url, { socket, credentialStore: store, commandNamespaceFactory: () => namespace })
    const client: TestClient = { lobby, socket, credentialStore: store, gameUpdates: [], lobbyUpdates: [] }
    lobby.subscribe((state) => client.lobbyUpdates.push(state))
    lobby.gameGateway.subscribe((update) => client.gameUpdates.push(update))
    clients.push(client)
    return client
  }
  const host = addClient('test-host')
  const joiner = addClient('test-joiner')
  const harness: Harness = { host, joiner, server, rooms, addClient, close: async () => {
    for (const client of clients) client.lobby.dispose()
    rooms.dispose()
    await createGracefulShutdown({ httpServer: http, realtimeServer: server })()
  } }
  harnesses.push(harness)
  await host.lobby.createRoom('Host')
  await joiner.lobby.joinRoom('Joiner', requireValue(lobbyState(host).snapshot).roomCode)
  await vi.waitFor(() => expect(lobbyState(host).snapshot?.revision).toBe(1))
  await host.lobby.setAiSeat('SOUTH', 'BUILDER')
  await host.lobby.setAiSeat('WEST', 'MERCHANT')
  await vi.waitFor(() => expect(lobbyState(joiner).snapshot?.revision).toBe(3))
  await joiner.lobby.setReady(true)
  await vi.waitFor(() => expect(lobbyState(host).snapshot?.revision).toBe(4))
  await host.lobby.setReady(true)
  await host.lobby.startGame()
  await vi.waitFor(() => {
    for (const client of [host, joiner]) {
      expect(last(client).view?.stateVersion).toBe(16)
      expect(last(client).resynchronizing).toBe(false)
    }
  })
  return harness
}

function buy(client: TestClient, id: string, version = requireValue(last(client).view).stateVersion): CommandEnvelope {
  return { commandId: id as CommandId, actorId: requireValue(last(client).view).self.id,
    expectedStateVersion: version, command: { type: 'BUY_DEVELOPMENT_CARD' } }
}

async function emitView(harness: Harness, client: TestClient, update: WireUpdate): Promise<void> {
  const socket = requireValue(harness.server.sockets.sockets.get(requireValue(client.socket.id)))
  await new Promise<void>((resolve, reject) => socket.timeout(2_000).emit('game:update', update, (error: unknown) => {
    if (error !== null) reject(new Error('Client did not acknowledge receipt.'))
    else resolve()
  }))
}

afterEach(async () => { for (const harness of harnesses.splice(0)) await harness.close() })

describe('SocketGameGateway through the shared Lobby connection', () => {
  it('shares two sockets, wraps IDs stably, strips the caller actor and renders only server results', async () => {
    const { host, joiner, server } = await startedHarness()
    expect(server.engine.clientsCount).toBe(2)
    expect(last(host).view?.publicGame).toEqual(last(joiner).view?.publicGame)
    const outgoing = vi.spyOn(host.socket, 'emit')
    const envelope = { ...buy(host, 'command:ui:16:0'), actorId: requireValue(last(joiner).view).self.id }
    const pending = host.lobby.gameGateway.submit(envelope)
    expect(last(host).submitting).toBe(true)
    expect(last(host).view?.stateVersion).toBe(16)
    await expect(host.lobby.gameGateway.submit(buy(host, 'command:overlap'))).rejects.toThrow(/Wait for/)
    expect((await pending).ok).toBe(true)
    expect(last(host).view?.stateVersion).toBe(17)
    expect(last(host).submitting).toBe(false)
    expect((await host.lobby.gameGateway.submit(envelope)).ok).toBe(true)
    expect(last(host).view?.stateVersion).toBe(17)
    const requests = outgoing.mock.calls.filter((call) => call[0] === 'game:command')
      .map((call) => gameCommandRequestSchema.parse(call[1]))
    expect(requests).toHaveLength(2)
    expect(requests[0]?.commandId).toBe('human:test-host:command:ui:16:0')
    expect(requests[0]).toEqual(requests[1])
    expect(requests.every((request) => !('actorId' in request) && !('sessionId' in request))).toBe(true)
    await vi.waitFor(() => expect(last(joiner).view?.stateVersion).toBe(17))
    expect(host.gameUpdates.flatMap((update) => update.events)).toContainEqual(expect.objectContaining({
      type: 'DEVELOPMENT_CARD_BOUGHT', cardId: expect.any(String), cardType: expect.any(String),
    }))
    expect(joiner.gameUpdates.flatMap((update) => update.events)).toContainEqual(expect.objectContaining({
      type: 'DEVELOPMENT_CARD_BOUGHT', cardId: null, cardType: null,
    }))
  })

  it('resynchronizes stale rejections and exposes no browser save or local creation path', async () => {
    const { host } = await startedHarness()
    await host.lobby.gameGateway.submit(buy(host, 'command:buy'))
    const outgoing = vi.spyOn(host.socket, 'emit')
    expect(await host.lobby.gameGateway.submit(buy(host, 'command:stale', 0))).toMatchObject({
      ok: false, violation: { code: 'STALE_STATE_VERSION' }, view: { stateVersion: 17 },
    })
    expect(outgoing.mock.calls.some((call) => call[0] === 'game:request-snapshot')).toBe(true)
    await expect(host.lobby.gameGateway.hasSavedGame()).resolves.toBe(false)
    for (const operation of [() => host.lobby.gameGateway.createGame(), () => host.lobby.gameGateway.saveGame(),
      () => host.lobby.gameGateway.loadLatestGame(), () => host.lobby.gameGateway.deleteSavedGame()]) {
      await expect(operation()).rejects.toThrow(/Single Player/)
    }
  })

  it('ignores old snapshots, requests a full snapshot on a missed publication and rejects another viewer', async () => {
    const harness = await startedHarness()
    const { host, joiner, rooms } = harness
    const credential = requireValue(host.credentialStore.credential)
    const game = requireValue(rooms.getGameSession(credential.roomCode))
    const original = game.snapshot(credential.sessionId)
    await host.lobby.gameGateway.submit(buy(host, 'command:first'))
    const outgoing = vi.spyOn(host.socket, 'emit')
    await emitView(harness, host, original)
    expect(last(host).view?.stateVersion).toBe(17)
    // Deliberately miss three real publications while still acknowledging their transport
    // receipts. Then reconnect this subscriber to the actual current server revision.
    const handler = requireValue(host.socket.listeners('game:update')[0])
    host.socket.off('game:update', handler)
    for (let index = 0; index < 3; index += 1) {
      const delivered = new Promise<void>((resolve) => host.socket.once('game:update', (_update, received) => {
        received()
        resolve()
      }))
      game.publish()
      await delivered
    }
    host.socket.on('game:update', handler)
    await emitView(harness, host, game.snapshot(credential.sessionId))
    await vi.waitFor(() => expect(outgoing.mock.calls.some((call) => call[0] === 'game:request-snapshot')).toBe(true))
    const ownId = requireValue(last(host).view).self.id
    await emitView(harness, host, game.snapshot(requireValue(joiner.credentialStore.credential).sessionId))
    await vi.waitFor(() => expect(last(host).resynchronizing).toBe(false))
    expect(host.gameUpdates.every((update) => update.view === null || update.view.self.id === ownId)).toBe(true)
    expect(last(host).view?.stateVersion).toBe(17)
  })

  it('resumes the same active view after disconnect and removes the replaced gateway authority', async () => {
    const harness = await startedHarness()
    const { host } = harness
    await host.lobby.gameGateway.submit(buy(host, 'command:before-resume'))
    const before = requireValue(last(host).view)
    host.socket.disconnect()
    expect(last(host).connectionStatus).toBe('DISCONNECTED')
    await expect(host.lobby.gameGateway.submit(buy(host, 'command:disconnected'))).rejects.toThrow(/Reconnect/)
    host.socket.connect()
    await vi.waitFor(() => {
      expect(last(host).connectionStatus).toBe('READY')
      expect(last(host).resynchronizing).toBe(false)
    })
    expect(last(host).view).toEqual(before)
    const store = new MemoryCredentialStore()
    store.credential = requireValue(host.credentialStore.credential)
    const replacement = harness.addClient('new-tab', store)
    await replacement.lobby.resumeSession()
    await vi.waitFor(() => expect(last(replacement).view?.stateVersion).toBe(17))
    await vi.waitFor(() => expect(last(host).connectionStatus).toBe('DISCONNECTED'))
    expect(host.credentialStore.credential).toBeNull()
    await expect(host.lobby.gameGateway.submit(buy(host, 'command:old-tab'))).rejects.toThrow(/Reconnect/)
    expect(last(replacement).view?.self.id).toBe(before.self.id)
    replacement.lobby.gameGateway.dispose()
    expect(replacement.socket.listeners('game:update')).toHaveLength(0)
  })
})
