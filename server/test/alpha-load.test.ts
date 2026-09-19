import { performance } from 'node:perf_hooks'
import { mkdirSync, writeFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { io, type Socket } from 'socket.io-client'
import { expect, it } from 'vitest'
import { REALTIME_PROTOCOL_VERSION, gameCommandRequestSchema, gameCommandAcknowledgementSchema, roomCreateAcknowledgementSchema, roomJoinAcknowledgementSchema,
  type ClientToServerEvents, type ServerToClientEvents, type RoomSessionData } from '@frontier-isles/realtime-contracts'
import { createFrontierHttpServer, frontierConnectionCount } from '../src/create-http-server.js'
import { createRealtimeServer, realtimeLimiterResources } from '../src/create-realtime-server.js'
import { createGracefulShutdown } from '../src/graceful-shutdown.js'
import { InMemoryRoomService } from '../src/lobby/room-service.js'
import { pendingGameReceipts } from '../src/lobby/register-lobby-handlers.js'
import { createSystemRoomLifecycleRuntime, type RoomLifecycleRuntime } from '../src/lobby/lifecycle-runtime.js'
import { requireValue, successData } from './game-test-helpers.js'
import type { GameSession } from '../src/game/game-session.js'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
const protocolVersion = REALTIME_PROTOCOL_VERSION

it('bounded alpha load releases Room, queue, cache, listener, receipt, timer and socket resources over two cycles', async () => {
  const started = performance.now()
  const memoryBefore = process.memoryUsage()
  let peakRss = memoryBefore.rss
  let peakHeap = memoryBefore.heapUsed
  let commands = 0
  let snapshots = 0
  let sockets = 0
  let publications = 0
  for (let cycle = 0; cycle < 2; cycle += 1) {
    const system = createSystemRoomLifecycleRuntime()
    const timers = new Set<object>()
    const runtime: RoomLifecycleRuntime = { now: system.now, schedule: (delay, action) => {
      const identity = {}
      timers.add(identity)
      const task = system.schedule(delay, () => { timers.delete(identity); action() })
      return { cancel: () => { timers.delete(identity); task.cancel() } }
    } }
    const service = (await InMemoryRoomService.open({ runtime }))
    const http = createFrontierHttpServer({ isReady: () => service.isReady })
    const server = createRealtimeServer(http, { nodeEnv: 'test', port: 3001, clientOrigin: 'http://127.0.0.1',
      reconnectGraceMs: 30_000, roomIdleTtlMs: 1_800_000 }, { roomService: service })
    const shutdown = createGracefulShutdown({ httpServer: http, realtimeServer: server })
    const clients: Client[] = []
    const games: GameSession[] = []
    await new Promise<void>((done) => http.listen(0, '127.0.0.1', done))
    const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
    async function connect(): Promise<Client> {
      const client: Client = io(url, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'] })
      clients.push(client); sockets += 1
      client.on('game:update', (_view, received) => { publications += 1; received() })
      await new Promise<void>((done, reject) => { client.once('server:hello', () => done()); client.once('connect_error', reject); client.connect() })
      return client
    }
    try {
      const rooms: { members: RoomSessionData[]; transports: Client[] }[] = []
      for (let room = 0; room < 8; room += 1) {
        const members: RoomSessionData[] = []
        const transports: Client[] = []
        for (let human = 0; human < (room < 4 ? 4 : 2); human += 1) {
          const client = await connect(); transports.push(client)
          const host = members[0]
          members.push(host === undefined ? successData(roomCreateAcknowledgementSchema.parse(await client.timeout(5000).emitWithAck('room:create', {
            protocolVersion, displayName: `Load Host ${room}` })))
            : successData(roomJoinAcknowledgementSchema.parse(await client.timeout(5000).emitWithAck('room:join', {
              protocolVersion, roomCode: host.credential.roomCode, displayName: `Load Human ${human}` }))))
        }
        rooms.push({ members, transports })
      }
      for (const room of rooms.slice(0, 4)) {
        const host = requireValue(room.members[0])
        const hostSocket = requireValue(room.transports[0])
        for (const client of room.transports) successData(await client.timeout(5000).emitWithAck('room:set-ready', { protocolVersion,
          expectedRevision: requireValue(service.getSnapshot(host.credential.roomCode)).revision, ready: true }))
        successData(await hostSocket.timeout(5000).emitWithAck('room:start', { protocolVersion,
          expectedRevision: requireValue(service.getSnapshot(host.credential.roomCode)).revision }))
        games.push(requireValue(service.getGameSession(host.credential.roomCode)))
      }
      // Interleave independent Rooms at each setup step; none may starve behind another Room.
      for (let step = 0; step < 16; step += 1) await Promise.all(rooms.slice(0, 4).map(async (room, index) => {
        const game = requireValue(games[index])
        const actor = room.members.findIndex((member) => {
          const view = game.snapshot(member.credential.sessionId).view
          return view.self.id === view.publicGame.turn.currentPlayerId
        })
        const view = game.snapshot(requireValue(room.members[actor]).credential.sessionId).view
        const vertex = view.legalActions.legalInitialSettlementVertexIds?.[0]
        const command = vertex === undefined ? { type: 'PLACE_INITIAL_ROAD' as const, edgeId: requireValue(view.legalActions.legalInitialRoadEdgeIds?.[0]) }
          : { type: 'PLACE_INITIAL_SETTLEMENT' as const, vertexId: vertex }
        expect(successData(gameCommandAcknowledgementSchema.parse(await requireValue(room.transports[actor]).timeout(5000).emitWithAck('game:command', gameCommandRequestSchema.parse({
          protocolVersion, roomCode: game.roomCode, gameId: game.gameId, expectedStateVersion: view.stateVersion,
          commandId: `load:${cycle}:${step}`, command })))).accepted).toBe(true)
        commands += 1
      }))
      for (const [index, room] of rooms.slice(0, 4).entries()) {
        const game = requireValue(games[index]); const host = requireValue(room.members[0])
        const client = requireValue(room.transports[0])
        for (let index = 0; index < 130; index += 1) {
          const result = await client.timeout(5000).emitWithAck('game:command', gameCommandRequestSchema.parse({ protocolVersion,
            roomCode: game.roomCode, gameId: game.gameId, expectedStateVersion: 0, commandId: `load:stale:${index}`, command: { type: 'END_TURN' } }))
          expect(successData(gameCommandAcknowledgementSchema.parse(result)).accepted).toBe(false); commands += 1
        }
        expect(game.resources().cache).toBeLessThanOrEqual(4 * 128)
        expect(game.exportPersistence().commandCache.find((entry) => entry.sessionId === host.credential.sessionId)?.entries).toHaveLength(128)
        client.disconnect()
        const resumed = await connect()
        successData(await resumed.timeout(5000).emitWithAck('session:resume', host.credential))
        for (let count = 0; count < 8; count += 1) {
          successData(await resumed.timeout(5000).emitWithAck('game:request-snapshot', { protocolVersion, roomCode: game.roomCode, gameId: game.gameId }))
          snapshots += 1
        }
        expect(game.resources()).toMatchObject({ queue: 0, listeners: 1, aiTasks: 0, aiWaiters: 0 })
        expect(game.resources().views).toBeLessThanOrEqual(4)
      }
      expect(service.roomCount).toBe(8)
      expect(service.resources().sessions).toBe(24)
      expect(realtimeLimiterResources(server).sessions).toBeLessThanOrEqual(24)
      const memory = process.memoryUsage(); peakRss = Math.max(peakRss, memory.rss); peakHeap = Math.max(peakHeap, memory.heapUsed)
    } finally {
      for (const client of clients) client.disconnect()
      await shutdown()
      await expect.poll(() => ({ sockets: server.engine.clientsCount, tcp: frontierConnectionCount(http), receipts: pendingGameReceipts(server) })).toEqual({ sockets: 0, tcp: 0, receipts: 0 })
      expect(service.resources()).toEqual({ rooms: 0, sessions: 0, listeners: 0, timers: 0, records: 0 })
      expect(timers.size).toBe(0)
      expect(realtimeLimiterResources(server)).toEqual({ transports: 0, sessions: 0 })
      for (const game of games) expect(game.resources()).toEqual({ queue: 0, cache: 0, views: 0, listeners: 0, aiTasks: 0, aiWaiters: 0 })
    }
  }
  const report = { code: 'LOCAL_ALPHA_LOAD', cycles: 2, peakRooms: 8, totalRooms: 16, activeGames: 8,
    peakSockets: 24, socketConnections: sockets, reconnects: 8, commands, snapshots, publications,
    durationMs: Math.round(performance.now() - started), rssBefore: memoryBefore.rss, peakRss,
    heapBefore: memoryBefore.heapUsed, peakHeap, retainedResources: 0 }
  mkdirSync('logs', { recursive: true })
  writeFileSync('logs/goal-c-12-load-summary.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
}, 60_000)
