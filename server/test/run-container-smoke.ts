/** Local-only production image verification. Never publishes an image or contacts a cloud account. */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import { REALTIME_PROTOCOL_VERSION, roomCreateAcknowledgementSchema, roomJoinAcknowledgementSchema, gameCommandRequestSchema,
  gameCommandAcknowledgementSchema, gameRequestSnapshotAcknowledgementSchema, roomRequestSnapshotAcknowledgementSchema,
  roomStartAcknowledgementSchema, type ClientToServerEvents, type ServerToClientEvents, type RoomSessionData, type RoomRevision } from '@frontier-isles/realtime-contracts'
import { temporaryPersistenceDirectory } from './persistence-test-helpers.js'
import { requireValue, successData } from './game-test-helpers.js'
import { SqliteMultiplayerRepository } from '../src/persistence/sqlite-multiplayer-repository.js'
import { canonicalJson } from '../src/persistence/canonical-json.js'

type Client = Socket<ServerToClientEvents, ClientToServerEvents>
const protocolVersion = REALTIME_PROTOCOL_VERSION
const docker = process.env.DOCKER_CLI ?? (process.platform === 'win32'
  ? join(requireValue(process.env.LOCALAPPDATA), 'Programs/DockerDesktop/resources/bin/docker.exe') : 'docker')
const directory = temporaryPersistenceDirectory()
const container = `frontier-goal-c-${randomUUID()}`
const clients: Client[] = []
let created = false
let step = 'build'
async function command(args: readonly string[]): Promise<string> {
  return new Promise((done, reject) => {
    const child = spawn(docker, [...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    const append = (chunk: Buffer): void => { output = (output + chunk.toString()).slice(-2_000_000) }
    child.stdout.on('data', append); child.stderr.on('data', append)
    child.once('error', () => reject(new Error('Container command could not start.')))
    child.once('close', (code) => {
      if (args[0] === 'build') writeFileSync(join('logs', 'goal-c-12-container-build.log'), output)
      if (code === 0) done(output.trim()); else reject(new Error(`Container command failed during ${step}.`))
    })
  })
}
async function ready(url: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${url}/ready`)).status === 200) return } catch { /* Startup has not opened the port. */ }
    await new Promise<void>((done) => setTimeout(done, 200))
  }
  throw new Error('Local production container did not become ready.')
}
async function connect(url: string): Promise<Client> {
  const client: Client = io(url, { autoConnect: false, forceNew: true, reconnection: false,
    transports: ['websocket'], extraHeaders: { Origin: url } })
  clients.push(client)
  client.on('game:update', (_view, received) => received())
  await new Promise<void>((done, reject) => {
    const timer = setTimeout(() => reject(new Error('Container socket connection timed out.')), 5000)
    client.once('server:hello', () => { clearTimeout(timer); done() })
    client.once('connect_error', () => { clearTimeout(timer); reject(new Error('Container socket rejected.')) })
    client.connect()
  })
  return client
}
try {
  const iidFile = join(directory.path, 'image-id')
  await command(['build', '--iidfile', iidFile, '.'])
  const image = readFileSync(iidFile, 'utf8').trim()
  assert.match(image, /^sha256:[a-f0-9]{64}$/u)
  const reservation = createServer()
  await new Promise<void>((done) => reservation.listen(0, '127.0.0.1', done))
  const port = (reservation.address() as AddressInfo).port
  await new Promise<void>((done) => reservation.close(() => done()))
  const url = `http://127.0.0.1:${port}`
  step = 'start'
  await command(['run', '--detach', '--name', container, '--init', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--memory=1g', '--cpus=2', '--pids-limit=128', '--stop-timeout=30',
    '--publish', `127.0.0.1:${port}:3001`, '--mount', `type=bind,source=${directory.path},target=/data`,
    '--env', `CLIENT_ORIGINS=${url}`, '--env', 'PERSISTENCE_FILE=/data/rooms.sqlite', image])
  created = true
  await ready(url)
  step = 'http-and-runtime'
  const index = await fetch(url); assert.equal(index.status, 200)
  const html = await index.text()
  assert.equal(html.includes('Frontier Isles'), true)
  const asset = requireValue(/src="(\/assets\/[^" ]+\.js)"/u.exec(html)?.[1])
  assert.equal((await fetch(url + asset)).status, 200)
  assert.equal((await fetch(`${url}/health`)).status, 200)
  for (const path of ['/data/rooms.sqlite', '/server/test', '/debug', '/fixture', '/assets/rooms.sqlite']) assert.equal((await fetch(url + path)).status, 404)
  const runtime = JSON.parse(await command(['exec', container, 'node', '--input-type=module', '-e',
    "import {DatabaseSync} from 'node:sqlite';import {existsSync,writeFileSync,readdirSync} from 'node:fs';const db=new DatabaseSync(':memory:');let readOnly=false;try{writeFileSync('/app/probe','x')}catch(e){readOnly=e.code==='EROFS'}const files=p=>readdirSync(p,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(p+'/'+e.name):[p+'/'+e.name]);console.log(JSON.stringify({node:process.version,sqlite:db.prepare('select sqlite_version() as version').get().version,uid:process.getuid(),readOnly,fixtures:existsSync('/app/server/dist/test')||files('/app/packages').some(p=>/\\.test[.-]|test-helper|\\.map$/.test(p))}));db.close()"
  ])) as { readonly node: string; readonly sqlite: string; readonly uid: number; readonly readOnly: boolean; readonly fixtures: boolean }
  assert.equal(runtime.uid, 1000); assert.equal(runtime.readOnly, true); assert.equal(runtime.fixtures, false)
  step = 'gameplay'
  const members: RoomSessionData[] = []; const connected: Client[] = []
  for (let index = 0; index < 4; index += 1) {
    const client = await connect(url); connected.push(client)
    const host = members[0]
    members.push(host === undefined ? successData(roomCreateAcknowledgementSchema.parse(await client.timeout(5000).emitWithAck('room:create', {
      protocolVersion, displayName: 'Container Host' }))) : successData(roomJoinAcknowledgementSchema.parse(await client.timeout(5000).emitWithAck('room:join', {
        protocolVersion, roomCode: host.credential.roomCode, displayName: `Container Human ${index}` }))))
  }
  const host = requireValue(connected[0])
  async function revision(): Promise<RoomRevision> {
    return successData(roomRequestSnapshotAcknowledgementSchema.parse(await host.timeout(5000).emitWithAck('room:request-snapshot', { protocolVersion }))).snapshot.revision
  }
  for (const client of connected) successData(await client.timeout(5000).emitWithAck('room:set-ready', { protocolVersion, expectedRevision: await revision(), ready: true }))
  const started = successData(roomStartAcknowledgementSchema.parse(await host.timeout(5000).emitWithAck('room:start', { protocolVersion, expectedRevision: await revision() }))).snapshot
  const identity = { protocolVersion, roomCode: started.roomCode, gameId: requireValue(started.gameId) }
  const initialViews = await Promise.all(connected.map(async (client) => successData(gameRequestSnapshotAcknowledgementSchema.parse(
    await client.timeout(5000).emitWithAck('game:request-snapshot', identity)))))
  const actorIndex = initialViews.findIndex((update) => update.view.self.id === update.view.publicGame.turn.currentPlayerId)
  const actor = requireValue(connected[actorIndex])
  const initial = requireValue(initialViews[actorIndex])
  const request = gameCommandRequestSchema.parse({ ...identity, expectedStateVersion: initial.view.stateVersion, commandId: 'container:durable-build',
    command: { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: requireValue(initial.view.legalActions.legalInitialSettlementVertexIds?.[0]) } })
  const accepted = gameCommandAcknowledgementSchema.parse(await actor.timeout(5000).emitWithAck('game:command', request))
  assert.equal(successData(accepted).accepted, true)
  const before = successData(gameRequestSnapshotAcknowledgementSchema.parse(await actor.timeout(5000).emitWithAck('game:request-snapshot', identity))).view
  step = 'crash-recovery'
  await command(['kill', '--signal=KILL', container])
  step = 'crash-storage-inspection'
  const inspect = new SqliteMultiplayerRepository(directory.database)
  const saved = requireValue(inspect.load()[0]); inspect.close()
  assert.equal(saved.game?.state.stateVersion, before.stateVersion)
  for (const member of members) assert.equal(readFileSync(directory.database).includes(member.credential.resumeToken), false)
  step = 'restart-readiness'
  await command(['start', container]); await ready(url)
  step = 'resume-humans'
  const restored: Client[] = []
  for (const member of members) {
    const client = await connect(url); restored.push(client)
    successData(await client.timeout(5000).emitWithAck('session:resume', member.credential))
  }
  const resumed = requireValue(restored[actorIndex])
  const view = successData(gameRequestSnapshotAcknowledgementSchema.parse(await resumed.timeout(5000).emitWithAck('game:request-snapshot', identity))).view
  step = 'exact-view-and-replay'
  assert.equal(canonicalJson(view) === canonicalJson(before), true)
  assert.equal(canonicalJson(await resumed.timeout(5000).emitWithAck('game:command', request)) === canonicalJson(accepted), true)
  step = 'graceful-stop'
  await command(['stop', '--time', '30', container])
  const output = await command(['logs', container])
  assert.equal(output.includes('SHUTDOWN_COMPLETE'), true)
  for (const member of members) {
    assert.equal(output.includes(member.credential.resumeToken), false)
    assert.equal(output.includes(member.credential.sessionId), false)
  }
  const final = new SqliteMultiplayerRepository(directory.database)
  assert.equal(canonicalJson(requireValue(final.load()[0]).game?.state) === canonicalJson(saved.game?.state), true); final.close()
  console.log(JSON.stringify({ code: 'LOCAL_CONTAINER_SMOKE_PASSED', image, ...runtime, humans: 4, commands: 1, exactReplays: 1,
    processStarts: 2, crashRecovery: true, exactStateAndRng: true, gracefulFlush: true, privateRoutesDenied: 5, pushed: false, deployed: false }))
} catch (error: unknown) {
  const location = error instanceof Error ? /run-container-smoke\.ts:(\d+):\d+/u.exec(error.stack ?? '')?.[1] : undefined
  console.error(JSON.stringify({ code: 'LOCAL_CONTAINER_SMOKE_FAILED', step, failure: error instanceof Error ? error.name : 'Unknown',
    ...(location === undefined ? {} : { testLine: Number(location) }) })); process.exitCode = 1
} finally {
  for (const client of clients) client.disconnect()
  if (created) await command(['rm', '--force', container])
  directory.remove()
}
