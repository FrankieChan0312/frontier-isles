import { afterEach, beforeEach, expect, it } from 'vitest'
import { setTimeout as delay } from 'node:timers/promises'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { RowDataPacket } from 'mysql2/promise'
import { io } from 'socket.io-client'
import { REALTIME_PROTOCOL_VERSION, type RoomSessionData, type RoomSnapshot } from '@frontier-isles/realtime-contracts'
import { MysqlMultiplayerRepository } from '../src/persistence/mysql-multiplayer-repository.js'
import { InMemoryRoomService } from '../src/lobby/room-service.js'
import { createFrontierHttpServer } from '../src/create-http-server.js'
import { createRealtimeServer } from '../src/create-realtime-server.js'
import { createGracefulShutdown } from '../src/graceful-shutdown.js'
import { mysqlTestConfig, mysqlTestConnection, resetMysqlTestSchema } from './mysql-test-helpers.js'
import { actionFixture, requireValue, requestFor, successData } from './game-test-helpers.js'
import type { GameClient } from './game-network-helpers.js'

const cleanup: (() => void | Promise<void>)[] = []
beforeEach(resetMysqlTestSchema)
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => { throw new Error('Deferred initialization failed.') }
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
async function room(service: InMemoryRoomService): Promise<{
  readonly host: RoomSessionData; readonly snapshot: () => RoomSnapshot
}> {
  const host = successData(await service.createRoom('North'))
  const members = [host]
  for (const name of ['East', 'South', 'West']) members.push(successData(await service.joinRoom(host.credential.roomCode, name)))
  const snapshot = (): RoomSnapshot => requireValue(service.getSnapshot(host.credential.roomCode))
  for (const member of members) successData(await service.setReady(member.credential.sessionId, snapshot().revision, true))
  successData(await service.requestStart(host.credential.sessionId, snapshot().revision))
  return { host, snapshot }
}

it('awaits real MySQL without blocking timers, HTTP, Socket.IO heartbeat or another serialized Room', async () => {
  const entered = deferred()
  const release = deferred()
  let holdNext = false
  const repository = await MysqlMultiplayerRepository.open(mysqlTestConfig(), { beforeCommit: async () => {
    if (!holdNext) return
    holdNext = false
    entered.resolve()
    await release.promise
  } })
  cleanup.push(() => repository.close())
  const service = await InMemoryRoomService.open({ repository, gameDependencies: { createState: actionFixture } })
  const a = await room(service)
  const b = await room(service)
  const gameA = requireValue(service.getGameSession(a.host.credential.roomCode))
  const gameB = requireValue(service.getGameSession(b.host.credential.roomCode))
  const http = createFrontierHttpServer({ isReady: () => service.isReady })
  const realtime = createRealtimeServer(http, { port: 3001, nodeEnv: 'test', clientOrigin: 'http://localhost:5173',
    reconnectGraceMs: 30_000, roomIdleTtlMs: 1_800_000 }, { roomService: service })
  // Test-only heartbeat cadence; production defaults and protocol are unchanged.
  realtime.engine.opts.pingInterval = 30
  realtime.engine.opts.pingTimeout = 1000
  const shutdown = createGracefulShutdown({ httpServer: http, realtimeServer: realtime })
  cleanup.push(shutdown)
  cleanup.push(() => release.resolve())
  await new Promise<void>((done) => http.listen(0, '127.0.0.1', done))
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  async function connect(member: RoomSessionData): Promise<GameClient> {
    const client: GameClient = io(url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'] })
    cleanup.push(() => { client.disconnect() })
    client.on('game:update', (_update, received) => received())
    const connected = new Promise<void>((done, reject) => { client.once('server:hello', () => done()); client.once('connect_error', reject) })
    client.connect()
    await connected
    successData(await client.timeout(3000).emitWithAck('session:resume', member.credential))
    return client
  }
  const clientA = await connect(a.host)
  const clientB = await connect(b.host)
  const before = gameA.snapshot(a.host.credential.sessionId)
  const order: string[] = []
  let heartbeats = 0
  clientA.io.engine.on('packet', (packet) => { if (packet.type === 'ping') heartbeats += 1 })
  let aPublications = 0
  service.subscribeToGames(({ update }) => {
    if (update.roomCode === gameA.roomCode && update.view.stateVersion > before.view.stateVersion) {
      aPublications += 1; order.push('A_PUBLICATION')
    }
  })
  const originalSave = repository.save.bind(repository)
  repository.save = async (record): Promise<void> => {
    await originalSave(record)
    if (record.roomCode === gameA.roomCode) order.push('A_COMMIT')
  }
  const requestA = requestFor(gameA, a.host.credential.sessionId, { type: 'BUY_DEVELOPMENT_CARD' })
  const requestB = requestFor(gameB, b.host.credential.sessionId, { type: 'BUY_DEVELOPMENT_CARD' })
  holdNext = true
  let acknowledged = false
  const pendingA = clientA.timeout(4000).emitWithAck('game:command', requestA).then((result) => {
    acknowledged = true; order.push('A_ACK'); return result
  })
  await entered.promise
  const started = performance.now()
  // An exact retry queues behind A; it cannot execute its RNG transition again.
  let retryAcknowledged = false
  const retryA = clientA.timeout(4000).emitWithAck('game:command', requestA).then((result) => { retryAcknowledged = true; return result })
  const timer = delay(20).then(() => performance.now() - started)
  const health = fetch(`${url}/health`).then((response) => { expect(response.status).toBe(200); return performance.now() - started })
  const progressB = (async (): Promise<number> => {
    const results = await Promise.all([
      clientB.timeout(3000).emitWithAck('game:command', requestB),
      clientB.timeout(3000).emitWithAck('game:command', { ...requestB, commandId: `${requestB.commandId}:second` as typeof requestB.commandId }),
    ])
    expect(results[0]).toMatchObject({ ok: true, data: { accepted: true } })
    expect(results[1]).toMatchObject({ ok: true, data: { accepted: false, violation: { code: 'STALE_STATE_VERSION' } } })
    return performance.now() - started
  })()
  const [timerMs, httpMs, roomBMs] = await Promise.all([timer, health, progressB])
  const during = successData(await clientA.timeout(3000).emitWithAck('game:request-snapshot', {
    protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: gameA.roomCode, gameId: gameA.gameId,
  }))
  expect(during).toEqual(before)
  expect(gameA.snapshot(a.host.credential.sessionId)).toEqual(before)
  expect(acknowledged || retryAcknowledged).toBe(false)
  expect(aPublications).toBe(0)
  await delay(Math.max(0, 800 - (performance.now() - started)))
  expect(heartbeats).toBeGreaterThan(0)
  expect(clientA.connected && clientB.connected).toBe(true)
  const injectedMs = performance.now() - started
  release.resolve()
  const [accepted, retried] = await Promise.all([pendingA, retryA])
  expect(accepted).toMatchObject({ ok: true, data: { accepted: true } })
  expect(retried).toEqual(accepted)
  expect(gameA.snapshot(a.host.credential.sessionId).view.stateVersion).toBe(before.view.stateVersion + 1)
  expect(aPublications).toBe(4)
  expect(order[0]).toBe('A_COMMIT')
  expect(order.at(-1)).toBe('A_ACK')
  expect(order.filter((value) => value === 'A_COMMIT')).toHaveLength(1)
  expect(timerMs).toBeLessThan(400)
  expect(httpMs).toBeLessThan(600)
  expect(roomBMs).toBeLessThan(600)
  expect(injectedMs).toBeGreaterThanOrEqual(790)
  const report = { code: 'LOCAL_ASYNC_MYSQL_LATENCY', injectedMs: Math.round(injectedMs),
    timerRequestedMs: 20, timerMs: Math.round(timerMs), httpMs: Math.round(httpMs), roomBMs: Math.round(roomBMs), heartbeats,
    commitBeforePublicationBeforeAck: true, roomACommits: 1, roomASerializedRetry: true, roomBSerializedStaleRejection: true }
  mkdirSync('logs', { recursive: true })
  writeFileSync('logs/mysql-async-latency-summary.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
})

it('exposes Promise operations and closes every connection in its bounded production pool', async () => {
  const inspector = await mysqlTestConnection()
  cleanup.push(() => inspector.end())
  const repository = await MysqlMultiplayerRepository.open(mysqlTestConfig())
  cleanup.push(() => repository.close())
  const first = repository.load()
  const second = repository.load()
  expect(first).toBeInstanceOf(Promise)
  expect(second).toBeInstanceOf(Promise)
  expect(await Promise.all([first, second])).toEqual([[], []])
  const count = async (): Promise<number> => {
    const [rows] = await inspector.execute<(RowDataPacket & { total: number })[]>(
      'SELECT COUNT(*) AS total FROM information_schema.PROCESSLIST WHERE DB=DATABASE() AND ID<>CONNECTION_ID()')
    return requireValue(rows[0]).total
  }
  expect(await count()).toBe(2)
  const closing = repository.close()
  expect(closing).toBeInstanceOf(Promise)
  await closing
  await expect.poll(count).toBe(0)
  await expect(repository.load()).rejects.toThrow('PERSISTENCE_OPEN_FAILED')
})
