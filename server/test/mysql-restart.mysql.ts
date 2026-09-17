import { io, type Socket } from 'socket.io-client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REALTIME_PROTOCOL_VERSION, gameCommandRequestSchema, gameCommandAcknowledgementSchema,
  roomCreateAcknowledgementSchema, roomJoinAcknowledgementSchema, sessionResumeAcknowledgementSchema,
  roomRequestSnapshotAcknowledgementSchema, roomStartAcknowledgementSchema,
  gameRequestSnapshotAcknowledgementSchema, type ClientToServerEvents, type ServerToClientEvents,
  type RoomSnapshot, type RoomSessionData, type GameCommandAcknowledgement } from '@frontier-isles/realtime-contracts'
import { MysqlMultiplayerRepository } from '../src/persistence/mysql-multiplayer-repository.js'
import { mysqlTestConfig, resetMysqlTestSchema } from './mysql-test-helpers.js'
import { canonicalJson } from '../src/persistence/canonical-json.js'
import { temporaryPersistenceDirectory } from './persistence-test-helpers.js'
import { startProductionProcess, type TestServerProcess } from './production-process-helpers.js'
import { requireValue, successData } from './game-test-helpers.js'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
beforeEach(resetMysqlTestSchema)
const clients: Client[] = []
const processes: TestServerProcess[] = []
const cleanup: (() => void)[] = []
afterEach(async () => {
  for (const client of clients.splice(0)) client.disconnect()
  for (const process of processes.splice(0)) await process.crash()
  for (const remove of cleanup.splice(0)) remove()
})
async function connect(server: TestServerProcess): Promise<Client> {
  const client: Client = io(server.baseUrl, { autoConnect: false, forceNew: true, reconnection: false, transports: ['websocket'] })
  clients.push(client)
  client.on('game:update', (_update, received) => received())
  await new Promise<void>((resolve, reject) => {
    client.once('server:hello', () => resolve())
    client.once('connect_error', reject)
    client.connect()
  })
  return client
}
async function processFor(database: string): Promise<TestServerProcess> {
  const server = await startProductionProcess(database, { mysql: true })
  processes.push(server)
  return server
}
async function roomSnapshot(client: Client): Promise<RoomSnapshot> {
  return successData(roomRequestSnapshotAcknowledgementSchema.parse(await client.timeout(5000).emitWithAck('room:request-snapshot', { protocolVersion: REALTIME_PROTOCOL_VERSION }))).snapshot
}
describe('production process restart through real Socket.IO', () => {
  it('recovers a waiting Room and its original credentials after the production process is killed', async () => {
    const directory = temporaryPersistenceDirectory()
    cleanup.push(directory.remove)
    const first = await processFor(directory.database)
    const host = await connect(first)
    const member = successData(roomCreateAcknowledgementSchema.parse(await host.timeout(5000).emitWithAck('room:create', {
      protocolVersion: REALTIME_PROTOCOL_VERSION, displayName: 'Durable Host',
    })))
    successData(await host.timeout(5000).emitWithAck('room:set-ready', { protocolVersion: REALTIME_PROTOCOL_VERSION,
      expectedRevision: member.snapshot.revision, ready: true }))
    const before = await roomSnapshot(host)
    await first.crash()
    const second = await processFor(directory.database)
    const resumed = await connect(second)
    const acknowledgement = sessionResumeAcknowledgementSchema.parse(await resumed.timeout(5000).emitWithAck('session:resume', member.credential))
    const recovered = successData(acknowledgement)
    expect(JSON.stringify(recovered.credential) === JSON.stringify(member.credential)).toBe(true)
    expect(JSON.stringify(recovered.snapshot.seats) === JSON.stringify(before.seats)).toBe(true)
    expect(recovered.snapshot.hostSeatId).toBe('NORTH')
    expect(recovered.snapshot.revision).toBe(before.revision + 1)
    for (const output of [first.output(), second.output()]) {
      expect(output.includes(member.credential.resumeToken)).toBe(false)
      expect(output.includes(member.credential.sessionId)).toBe(false)
      expect(output.includes(directory.database)).toBe(false)
    }
  }, 30_000)

  it.each(['acknowledged', 'lost-ack'] as const)('recovers exact active state/RNG and replays once (%s)', async (delivery) => {
    const directory = temporaryPersistenceDirectory()
    cleanup.push(directory.remove)
    const first = await processFor(directory.database)
    const connected: Client[] = []
    const members: RoomSessionData[] = []
    for (let index = 0; index < 4; index += 1) {
      const client = await connect(first)
      connected.push(client)
      const host = members[0]
      members.push(host === undefined
        ? successData(roomCreateAcknowledgementSchema.parse(await client.timeout(5000).emitWithAck('room:create', {
            protocolVersion: REALTIME_PROTOCOL_VERSION, displayName: 'Persistent Host' })))
        : successData(roomJoinAcknowledgementSchema.parse(await client.timeout(5000).emitWithAck('room:join', {
            protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: host.credential.roomCode, displayName: `Persistent Human ${index}` }))))
    }
    const host = requireValue(connected[0])
    for (const client of connected) successData(await client.timeout(5000).emitWithAck('room:set-ready', {
      protocolVersion: REALTIME_PROTOCOL_VERSION, expectedRevision: (await roomSnapshot(host)).revision, ready: true }))
    const started = successData(roomStartAcknowledgementSchema.parse(await host.timeout(5000).emitWithAck('room:start', { protocolVersion: REALTIME_PROTOCOL_VERSION,
      expectedRevision: (await roomSnapshot(host)).revision }))).snapshot
    const identity = { protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: started.roomCode, gameId: requireValue(started.gameId) }
    const snapshots = await Promise.all(connected.map(async (client) => successData(gameRequestSnapshotAcknowledgementSchema.parse(
      await client.timeout(5000).emitWithAck('game:request-snapshot', identity)))))
    const actorIndex = snapshots.findIndex((snapshot) => snapshot.view.self.id === snapshot.view.publicGame.turn.currentPlayerId)
    const actor = requireValue(connected[actorIndex])
    const initial = requireValue(snapshots[actorIndex])
    const request = gameCommandRequestSchema.parse({ ...identity, commandId: 'human:durable-process-build',
      expectedStateVersion: initial.view.stateVersion, command: { type: 'PLACE_INITIAL_SETTLEMENT',
        vertexId: requireValue(initial.view.legalActions.legalInitialSettlementVertexIds?.[0]) } })
    let accepted: GameCommandAcknowledgement
    if (delivery === 'acknowledged') {
      accepted = gameCommandAcknowledgementSchema.parse(await actor.timeout(5000).emitWithAck('game:command', request))
    } else {
      // Observe only the committed publication and intentionally discard the command ACK.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => { actor.off('game:update', observe); reject(new Error('Committed publication was not observed.')) }, 5000)
        const observe: ServerToClientEvents['game:update'] = (update) => {
          if (update.view.stateVersion === request.expectedStateVersion + 1) {
            clearTimeout(timeout); actor.off('game:update', observe); resolve()
          }
        }
        actor.on('game:update', observe)
        actor.emit('game:command', request, () => {})
      })
      accepted = gameCommandAcknowledgementSchema.parse({ ok: true, data: {
        accepted: true, commandId: request.commandId, stateVersion: request.expectedStateVersion + 1 } })
    }
    expect(successData(accepted).accepted).toBe(true)
    const before = successData(gameRequestSnapshotAcknowledgementSchema.parse(await actor.timeout(5000).emitWithAck('game:request-snapshot', identity)))
    await first.crash()
    const inspect = new MysqlMultiplayerRepository(mysqlTestConfig())
    const saved = requireValue(inspect.load()[0])
    inspect.close()
    expect(saved.game?.state.stateVersion).toBe(before.view.stateVersion)
    const second = await processFor(directory.database)
    const restored: Client[] = []
    for (const member of members) {
      const client = await connect(second)
      restored.push(client)
      successData(sessionResumeAcknowledgementSchema.parse(await client.timeout(5000).emitWithAck('session:resume', member.credential)))
    }
    const restoredActor = requireValue(restored[actorIndex])
    const current = successData(gameRequestSnapshotAcknowledgementSchema.parse(await restoredActor.timeout(5000).emitWithAck('game:request-snapshot', identity)))
    expect(canonicalJson(current.view) === canonicalJson(before.view)).toBe(true)
    expect(current.lifecycleStatus).toBe('ACTIVE')
    expect(await restoredActor.timeout(5000).emitWithAck('game:command', request)).toEqual(accepted)
    const after = successData(gameRequestSnapshotAcknowledgementSchema.parse(await restoredActor.timeout(5000).emitWithAck('game:request-snapshot', identity)))
    expect(canonicalJson(after.view) === canonicalJson(current.view)).toBe(true)
    expect(after.publicationRevision).toBe(current.publicationRevision)
    await second.gracefulStop()
    for (const output of [first.output(), second.output()]) {
      expect(output).not.toMatch(/resumeToken|sessionId|fingerprint|drawCount|checksum|payload|password|mysql:\/\//u)
      expect(output.includes(mysqlTestConfig().password)).toBe(false)
      for (const member of members) expect(output.includes(member.credential.resumeToken)).toBe(false)
    }
    const final = new MysqlMultiplayerRepository(mysqlTestConfig())
    expect(canonicalJson(requireValue(final.load()[0]).game?.state) === canonicalJson(saved.game?.state)).toBe(true)
    final.close()
  }, 30_000)
})
