import type { AddressInfo } from 'node:net'
import { io, type Socket } from 'socket.io-client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { REALTIME_PROTOCOL_VERSION, roomCreateAcknowledgementSchema, sessionResumeAcknowledgementSchema,
  type ClientToServerEvents, type ServerToClientEvents } from '@frontier-isles/realtime-contracts'
import { createFrontierHttpServer } from '../src/create-http-server.js'
import { createRealtimeServer, realtimeLimiterResources } from '../src/create-realtime-server.js'
import { createGracefulShutdown } from '../src/graceful-shutdown.js'
import { InMemoryRoomService } from '../src/lobby/room-service.js'
import { MAX_PACKET_BYTES } from '../src/security/network-limits.js'
import { safeLogRecord } from '../src/security/safe-log.js'
import { pendingGameReceipts } from '../src/lobby/register-lobby-handlers.js'
import { requireValue, successData } from './game-test-helpers.js'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
const cleanup: (() => Promise<void> | void)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.restoreAllMocks() })
const origin = 'https://isles.example.test'
const protocolVersion = REALTIME_PROTOCOL_VERSION

async function fixture(production = false) {
  const service = (await InMemoryRoomService.open())
  const http = createFrontierHttpServer({ isReady: () => service.isReady })
  const logs: string[] = []
  const server = createRealtimeServer(http, { port: 3001, clientOrigin: origin, clientOrigins: [origin],
    nodeEnv: production ? 'production' : 'test', reconnectGraceMs: 30_000, roomIdleTtlMs: 1_800_000 },
  { roomService: service, limiterNow: () => 0, onDiagnostic: (record) => logs.push(safeLogRecord(record)) })
  const shutdown = createGracefulShutdown({ httpServer: http, realtimeServer: server })
  cleanup.push(shutdown)
  await new Promise<void>((done) => http.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  const clients: Client[] = []
  cleanup.push(() => { for (const client of clients) client.disconnect() })
  async function connect(requestOrigin: string | undefined = origin): Promise<Client> {
    const client: Client = io(url, { autoConnect: false, reconnection: false, forceNew: true, transports: ['websocket'],
      ...(requestOrigin === undefined ? {} : { extraHeaders: { Origin: requestOrigin } }) })
    clients.push(client)
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error('Security test connection timed out.')), 3000)
      client.once('server:hello', () => { clearTimeout(timer); done() })
      client.once('connect_error', () => { clearTimeout(timer); reject(new Error('Connection rejected.')) })
      client.connect()
    })
    return client
  }
  return { service, server, url, connect, logs, shutdown }
}
function acknowledge(client: Client, event: string, payload: unknown): Promise<unknown> {
  return new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error('Security test acknowledgement timed out.')), 3000)
    Reflect.apply(client.emit, client, [event, payload, (result: unknown) => { clearTimeout(timer); done(result) }])
  })
}
function errorCode(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'object' && value.error !== null
    && 'code' in value.error ? value.error.code : undefined
}

describe('real Socket.IO security boundary', () => {
  it('rejects disallowed and absent production Origins on websocket and polling handshakes', async () => {
    const network = await fixture(true)
    await network.connect()
    for (const value of ['null', 'https://evil.test', 'https://isles.example.test.evil.test']) await expect(network.connect(value)).rejects.toThrow('Connection rejected')
    // Passing undefined would use the helper default; use a direct originless client instead.
    const missing: Client = io(network.url, { reconnection: false, forceNew: true, transports: ['websocket'] })
    cleanup.push(() => { missing.disconnect() })
    await new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error('Originless rejection timed out.')), 3000)
      missing.once('connect_error', () => { clearTimeout(timer); done() })
    })
    for (const headers of [{ Origin: 'https://evil.test' }, {}]) {
      const response = await fetch(`${network.url}/socket.io/?EIO=4&transport=polling`, { headers })
      expect(response.status).toBeGreaterThanOrEqual(400)
      expect((await response.text()).includes('stack')).toBe(false)
    }
    expect((await fetch(`${network.url}/health`)).status).toBe(200)
  })
  it('rejects deep, polluted and malformed messages and ignores bounded missing-ack intents without mutation', async () => {
    const network = await fixture()
    const client = await network.connect()
    let deep: unknown = 0
    for (let count = 0; count < 14; count += 1) deep = { nested: deep }
    for (const payload of [deep, JSON.parse('{"protocolVersion":"V2_REALTIME_PROTOCOL_V1","__proto__":{"polluted":true}}'),
      { protocolVersion, displayName: 'Host', actorId: 'FORGED_PRIVATE_ACTOR' }]) {
      expect(errorCode(await acknowledge(client, 'room:create', payload))).toBe('INVALID_REQUEST')
    }
    Reflect.apply(client.emit, client, ['room:create', { protocolVersion, displayName: 'No ack' }])
    expect(errorCode(await acknowledge(client, 'unrecognized:event', { protocolVersion }))).toBe('INVALID_REQUEST')
    expect(network.service.roomCount).toBe(0)
    expect(network.logs.some((line) => /FORGED_PRIVATE|polluted|resumeToken|stack/u.test(line))).toBe(false)
  })
  it('bounds rapid Room creation and attaches once before asynchronous joins can race', async () => {
    const network = await fixture()
    const client = await network.connect()
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => acknowledge(client, 'room:create', { protocolVersion, displayName: `Host ${index}` })))
    expect(results.filter((value) => typeof value === 'object' && value !== null && 'ok' in value && value.ok === true).length).toBe(1)
    expect(results.filter((value) => errorCode(value) === 'RATE_LIMITED').length).toBe(2)
    expect(network.service.roomCount).toBe(1)
  })
  it('keeps the Human rate budget after resume while another Room can still act', async () => {
    const network = await fixture()
    const first = await network.connect()
    const member = successData(roomCreateAcknowledgementSchema.parse(await acknowledge(first, 'room:create', { protocolVersion, displayName: 'First' })))
    const command = { protocolVersion, roomCode: member.credential.roomCode, gameId: 'game:security-test', commandId: 'human:security',
      expectedStateVersion: 0, command: { type: 'END_TURN' } }
    const outcomes = await Promise.all(Array.from({ length: 257 }, () => acknowledge(first, 'game:command', command)))
    expect(outcomes.filter((value) => errorCode(value) === 'RATE_LIMITED').length).toBe(1)
    const replacement = await network.connect()
    successData(sessionResumeAcknowledgementSchema.parse(await acknowledge(replacement, 'session:resume', member.credential)))
    expect(errorCode(await acknowledge(replacement, 'game:command', command))).toBe('RATE_LIMITED')
    const second = await network.connect()
    const other = successData(roomCreateAcknowledgementSchema.parse(await acknowledge(second, 'room:create', { protocolVersion, displayName: 'Other Room' })))
    expect(errorCode(await acknowledge(second, 'game:command', { ...command, roomCode: other.credential.roomCode }))).toBe('GAME_NOT_FOUND')
    expect(network.service.roomCount).toBe(2)
  })
  it('sanitizes unexpected synchronous handler failures and stays available', async () => {
    const network = await fixture()
    const client = await network.connect()
    const spy = vi.spyOn(network.service, 'createRoom').mockImplementation(() => { throw new Error('SYNTHETIC_PRIVATE_HANDLER_FAILURE') })
    const result = await acknowledge(client, 'room:create', { protocolVersion, displayName: 'Host' })
    expect(result).toEqual({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'The server could not complete the request.' } })
    expect(network.logs).toEqual(['{"code":"INTERNAL_ERROR"}'])
    spy.mockRestore()
    expect((await fetch(`${network.url}/health`)).status).toBe(200)
  })
  it('rolls back a Room when the channel adapter throws synchronously during attachment', async () => {
    const network = await fixture()
    const client = await network.connect()
    const socket = requireValue(network.server.sockets.sockets.get(requireValue(client.id)))
    vi.spyOn(socket, 'join').mockImplementation(() => { throw new Error('PRIVATE_ADAPTER_FAILURE') })
    expect(errorCode(await acknowledge(client, 'room:create', { protocolVersion, displayName: 'Host' }))).toBe('INTERNAL_ERROR')
    expect(network.service.roomCount).toBe(0)
    expect(socket.data.sessionId).toBeUndefined()
    expect(network.logs.join('').includes('PRIVATE_ADAPTER_FAILURE')).toBe(false)
  })
  it('an older held resume completion cannot displace the latest valid transport', async () => {
    const network = await fixture()
    const first = await network.connect()
    const member = successData(roomCreateAcknowledgementSchema.parse(await acknowledge(first, 'room:create', { protocolVersion, displayName: 'Host' })))
    const oldResume = await network.connect()
    const oldSocket = requireValue(network.server.sockets.sockets.get(requireValue(oldResume.id)))
    let release: () => void = () => {}
    const held = new Promise<void>((done) => { release = done })
    vi.spyOn(oldSocket, 'join').mockImplementation(() => held)
    const abandoned = acknowledge(oldResume, 'session:resume', member.credential).catch(() => undefined)
    await vi.waitFor(() => expect(oldSocket.data.sessionId === member.credential.sessionId).toBe(true))
    const latest = await network.connect()
    successData(sessionResumeAcknowledgementSchema.parse(await acknowledge(latest, 'session:resume', member.credential)))
    release()
    expect(errorCode(await acknowledge(latest, 'room:request-snapshot', { protocolVersion }))).toBeUndefined()
    expect(oldSocket.data.sessionId).toBeUndefined()
    expect(requireValue(network.service.getSnapshot(member.credential.roomCode)).seats[0]).toMatchObject({ connectionStatus: 'CONNECTED' })
    await abandoned
  })
  it('disconnects oversized packets before Room allocation and releases limiter state on shutdown', async () => {
    const network = await fixture()
    const client = await network.connect()
    const disconnected = new Promise<void>((done, reject) => {
      const timer = setTimeout(() => reject(new Error('Oversized packet was not disconnected.')), 3000)
      client.once('disconnect', () => { clearTimeout(timer); done() })
    })
    Reflect.apply(client.emit, client, ['room:create', { protocolVersion, displayName: 'x'.repeat(MAX_PACKET_BYTES + 1) }])
    await disconnected
    expect(network.service.roomCount).toBe(0)
    await network.shutdown()
    expect(realtimeLimiterResources(network.server)).toEqual({ transports: 0, sessions: 0 })
  })
  it('bounds a slow private-view consumer, pauses the game and releases its timed receipts', async () => {
    const network = await fixture()
    const host = successData((await network.service.createRoom('Host')))
    const members = [host]
    for (let index = 1; index < 4; index += 1) members.push(successData((await network.service.joinRoom(host.credential.roomCode, `Human ${index}`))))
    const clients: Client[] = []
    let received = 0
    for (const [index, member] of members.entries()) {
      const client = await network.connect(); clients.push(client)
      if (index > 0) client.on('game:update', (_view, acknowledge) => { received += 1; acknowledge() })
      successData(sessionResumeAcknowledgementSchema.parse(await acknowledge(client, 'session:resume', member.credential)))
      successData((await network.service.setReady(member.credential.sessionId, requireValue(network.service.getSnapshot(host.credential.roomCode)).revision, true)))
    }
    successData((await network.service.requestStart(host.credential.sessionId, requireValue(network.service.getSnapshot(host.credential.roomCode)).revision)))
    const game = requireValue(network.service.getGameSession(host.credential.roomCode))
    const before = game.exportPersistence().state
    for (let index = 0; index < 64; index += 1) {
      await game.publish()
      await vi.waitFor(() => expect(received).toBeGreaterThanOrEqual((index + 1) * 3), { interval: 1 })
    }
    await game.publish()
    await vi.waitFor(() => expect(requireValue(clients[0]).connected).toBe(false))
    expect(game.lifecycleStatus).toBe('PAUSED_RECONNECTING')
    expect(game.exportPersistence().state).toEqual(before)
    expect(clients.slice(1).every((client) => client.connected)).toBe(true)
    await network.shutdown()
    await vi.waitFor(() => expect(pendingGameReceipts(network.server)).toBe(0), { timeout: 6500 })
  }, 10_000)
})
