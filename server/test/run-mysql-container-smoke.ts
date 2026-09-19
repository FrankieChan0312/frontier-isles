/** Owned local production/TLS qualification only. No cloud endpoint or image publication. */
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { createConnection, type Connection, type RowDataPacket } from 'mysql2/promise'
import { io, type Socket } from 'socket.io-client'
import { REALTIME_PROTOCOL_VERSION, roomCreateAcknowledgementSchema, roomJoinAcknowledgementSchema,
  roomRequestSnapshotAcknowledgementSchema, roomStartAcknowledgementSchema, gameRequestSnapshotAcknowledgementSchema,
  gameCommandRequestSchema, gameCommandAcknowledgementSchema, type ClientToServerEvents, type ServerToClientEvents,
  type RoomSessionData, type RoomRevision } from '@frontier-isles/realtime-contracts'
import { temporaryPersistenceDirectory } from './persistence-test-helpers.js'
import { requireValue, successData } from './game-test-helpers.js'
import { canonicalJson } from '../src/persistence/canonical-json.js'
import { decodeMultiplayerRecord } from '../src/persistence/multiplayer-repository.js'
import type { MultiplayerRecord } from '../src/persistence/multiplayer-record.js'
import { MysqlStore } from '../src/persistence/mysql-store.js'

const owner = `frontier-preflight-${randomUUID()}`
const label = 'frontier-isles.preflight'
const directory = temporaryPersistenceDirectory()
const certificates = join(directory.path, 'certificates')
mkdirSync(certificates)
const databaseName = 'frontier_isles_mysql_test'
const mysqlImage = 'mysql:8.4@sha256:85b9bf2e29cf836ecb8c2a15a935d4ba0c606631dff1dd79531a11983c638f2a'
const passwords = { root: randomBytes(24).toString('hex'), bootstrap: randomBytes(24).toString('hex'), runtime: randomBytes(24).toString('hex') }
const dockerEnv = { ...process.env, MYSQL_ROOT_PASSWORD: passwords.root, MYSQL_ROOT_HOST: '%', MYSQL_USER: 'frontier_bootstrap',
  MYSQL_PASSWORD: passwords.bootstrap, MYSQL_DATABASE: databaseName }
const containers: string[] = []
const clients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
let networkOwned = false
let step = 'local-ownership'
let passed = false
let image = ''
let dbPort = 0
let appUrl = ''
let ca = ''
let blockedStaticRoots = 0
const rejectedTls: string[] = []
const privateMaterial: string[] = []
const tokens: string[] = []
const rawResumeTokens: string[] = []

async function docker(args: readonly string[], environment: NodeJS.ProcessEnv = dockerEnv): Promise<string> {
  return new Promise((done, reject) => {
    const child = spawn('docker', [...args], { env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Owned Docker operation timed out.')) }, args[0] === 'build' ? 600_000 : 120_000)
    const append = (chunk: Buffer): void => { output = (output + chunk.toString()).slice(-4_000_000) }
    child.stdout.on('data', append); child.stderr.on('data', append)
    child.once('error', () => { clearTimeout(timeout); reject(new Error('Owned Docker operation unavailable.')) })
    child.once('close', (code) => {
      clearTimeout(timeout)
      const leaked = [...Object.values(passwords), ...tokens, ...privateMaterial].some((secret) => output.includes(secret))
        || /-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/u.test(output)
      if (args[0] === 'build' && !leaked) writeFileSync('server/logs/preflight-production-image-build.log', output)
      if (code === 0 && !leaked) done(output.trim())
      else reject(new Error('Owned Docker operation failed or exposed private data.'))
    })
  })
}
async function create(name: string, args: readonly string[], environment: NodeJS.ProcessEnv = dockerEnv): Promise<void> {
  await docker(['create', '--name', name, '--label', `${label}=${owner}`, ...args], environment)
  containers.push(name)
}
async function remove(name: string): Promise<void> {
  assert.equal(await docker(['inspect', '--format', `{{ index .Config.Labels "${label}" }}`, name]), owner)
  await docker(['rm', '--force', '--volumes', name])
  containers.splice(containers.indexOf(name), 1)
}
async function db(user = 'root', password = passwords.root): Promise<Connection> {
  return createConnection({ host: 'localhost', port: dbPort, user, password, database: databaseName, connectTimeout: 2000,
    ssl: { ca, rejectUnauthorized: true, verifyIdentity: true, minVersion: 'TLSv1.2' } })
}
async function createRuntimeAccount(administrator: Connection): Promise<void> {
  await administrator.query('CREATE USER ?@? IDENTIFIED BY ?', ['frontier_runtime', '%', passwords.runtime])
  await administrator.query("GRANT SELECT ON frontier_isles_mysql_test.persistence_schema TO 'frontier_runtime'@'%'")
  await administrator.query("GRANT UPDATE (id) ON frontier_isles_mysql_test.persistence_schema TO 'frontier_runtime'@'%'")
  await administrator.query("GRANT SELECT,INSERT,UPDATE,DELETE ON frontier_isles_mysql_test.rooms TO 'frontier_runtime'@'%'")
  await administrator.query("GRANT SELECT,INSERT ON frontier_isles_mysql_test.quarantine TO 'frontier_runtime'@'%'")
}
async function ready(): Promise<void> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    try { if ((await fetch(`${appUrl}/ready`, { signal: AbortSignal.timeout(2000) })).status === 200) return } catch { /* Await recovery. */ }
    await new Promise<void>((done) => setTimeout(done, 250))
  }
  throw new Error('Production container not ready.')
}
async function connect(): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
  const client: Socket<ServerToClientEvents, ClientToServerEvents> = io(appUrl, { autoConnect: false, forceNew: true,
    reconnection: false, transports: ['websocket'], extraHeaders: { Origin: 'https://play.frontier.test' } })
  clients.push(client)
  client.on('game:update', (_view, received) => received())
  await new Promise<void>((done, reject) => {
    const timeout = setTimeout(() => reject(new Error('Production socket timeout.')), 5000)
    client.once('server:hello', () => { clearTimeout(timeout); done() })
    client.once('connect_error', () => { clearTimeout(timeout); reject(new Error('Production socket refused.')) })
    client.connect()
  })
  return client
}
async function stored(): Promise<MultiplayerRecord> {
  const connection = await db('frontier_runtime', passwords.runtime)
  try {
    const [rows] = await connection.execute<(RowDataPacket & { payload: unknown; checksum: unknown })[]>('SELECT payload,checksum FROM rooms')
    assert.equal(rows.length, 1)
    const row = requireValue(rows[0])
    assert.ok(Buffer.isBuffer(row.payload) && Buffer.isBuffer(row.checksum))
    const payload = row.payload.toString('utf8')
    assert.equal(rawResumeTokens.some((value) => payload.includes(value)), false)
    return decodeMultiplayerRecord(payload, row.checksum.toString('utf8'))
  } finally { await connection.end() }
}

try {
  const local = /^(?:unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/u
  if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, local)
  const context = await docker(['context', 'show'])
  assert.match(await docker(['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}']), local)
  step = 'production-image-build'
  const iid = join(directory.path, 'image-id')
  await docker(['build', '--iidfile', iid, '.'])
  image = readFileSync(iid, 'utf8').trim()
  assert.match(image, /^sha256:[a-f0-9]{64}$/u)
  // Human-authorized disposable local identities only; never install into a trust store.
  step = 'disposable-local-certificates'
  const certContainer = `${owner}-certificates`
  await create(certContainer, ['--network', 'none', '--mount', `type=bind,source=${certificates},target=/certs`,
    '--entrypoint', 'bash', mysqlImage, '-ec',
    'umask 077; openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=Frontier-Local-Test-CA -keyout /certs/ca-key.pem -out /certs/ca.pem >/dev/null 2>&1; openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=Frontier-Untrusted-Test-CA -keyout /certs/untrusted-key.pem -out /certs/untrusted.pem >/dev/null 2>&1; openssl req -newkey rsa:2048 -nodes -subj /CN=frontier-mysql -keyout /certs/server-key.pem -out /certs/server.csr >/dev/null 2>&1; printf "subjectAltName=DNS:frontier-mysql,DNS:localhost\\nextendedKeyUsage=serverAuth\\n" >/certs/server.ext; openssl x509 -req -in /certs/server.csr -CA /certs/ca.pem -CAkey /certs/ca-key.pem -CAcreateserial -days 2 -extfile /certs/server.ext -out /certs/server.pem >/dev/null 2>&1; chmod 644 /certs/ca.pem /certs/server.pem /certs/untrusted.pem; chown mysql:mysql /certs/server-key.pem'])
  await docker(['start', '--attach', certContainer])
  await remove(certContainer)
  ca = readFileSync(join(certificates, 'ca.pem'), 'utf8')
  for (const file of ['ca-key.pem', 'server-key.pem', 'untrusted-key.pem']) {
    const key = readFileSync(join(certificates, file), 'utf8')
    privateMaterial.push(key, key.replace(/-----[^\n]+-----|\s/gu, ''))
  }
  step = 'owned-network-and-database'
  await docker(['network', 'create', '--label', `${label}=${owner}`, owner])
  networkOwned = true
  const database = `${owner}-mysql`
  await create(database, ['--network', owner, '--network-alias', 'frontier-mysql', '--network-alias', 'frontier-mysql-mismatch', '--publish', '127.0.0.1::3306',
    '--env', 'MYSQL_ROOT_PASSWORD', '--env', 'MYSQL_ROOT_HOST', '--env', 'MYSQL_USER', '--env', 'MYSQL_PASSWORD', '--env', 'MYSQL_DATABASE',
    '--memory', '768m', '--cpus', '2', '--pids-limit', '256', '--tmpfs', '/var/lib/mysql:rw,noexec,nosuid,size=512m',
    ...['ca.pem', 'server.pem', 'server-key.pem'].flatMap((file) => ['--mount', `type=bind,source=${join(certificates, file)},target=/certs/${file},readonly`]), mysqlImage,
    '--ssl-ca=/certs/ca.pem', '--ssl-cert=/certs/server.pem', '--ssl-key=/certs/server-key.pem', '--require-secure-transport=ON',
    '--innodb-flush-log-at-trx-commit=1', '--sync-binlog=1', '--max-connections=24'])
  await docker(['start', database])
  const binding = await docker(['port', database, '3306/tcp'])
  assert.match(binding, /^127\.0\.0\.1:\d+$/u)
  dbPort = Number(binding.split(':')[1])
  let connected = false
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try { const connection = await db(); await connection.end(); connected = true; break } catch { await new Promise<void>((done) => setTimeout(done, 1000)) }
  }
  assert.equal(connected, true)
  const env = { ...dockerEnv, NODE_ENV: 'production', PERSISTENCE_PROVIDER: 'mysql', CLIENT_ORIGINS: 'https://play.frontier.test',
    MYSQL_HOST: 'frontier-mysql', MYSQL_PORT: '3306', MYSQL_TLS: 'required', MYSQL_TLS_CA_FILE: '/run/frontier/mysql-ca.pem', MYSQL_SCHEMA_MODE: 'initialize' }
  const variables = ['NODE_ENV', 'PERSISTENCE_PROVIDER', 'CLIENT_ORIGINS', 'MYSQL_HOST', 'MYSQL_PORT', 'MYSQL_DATABASE',
    'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_TLS', 'MYSQL_TLS_CA_FILE', 'MYSQL_SCHEMA_MODE'].flatMap((name) => ['--env', name])
  const caMount = ['--mount', `type=bind,source=${join(certificates, 'ca.pem')},target=/run/frontier/mysql-ca.pem,readonly`]
  step = 'one-shot-schema-audit'
  const bootstrap = `${owner}-bootstrap`
  await create(bootstrap, ['--network', owner, '--read-only', ...caMount, ...variables, image,
    'node', 'server/dist/src/persistence/mysql-schema-command.js'], env)
  assert.equal(await docker(['start', '--attach', bootstrap]), '{"code":"MYSQL_SCHEMA_AUDIT_PASSED"}')
  await remove(bootstrap)
  const administrator = await db()
  try {
    await createRuntimeAccount(administrator)
    await administrator.query("ALTER USER 'frontier_runtime'@'%' REQUIRE SSL")
  } finally { await administrator.end() }
  const runtimeEnv = { ...env, MYSQL_USER: 'frontier_runtime', MYSQL_PASSWORD: passwords.runtime, MYSQL_SCHEMA_MODE: 'verify' }
  async function rejectTls(reason: string, hostname: string, caFile = 'ca.pem'): Promise<void> {
    step = `reject-${reason}`
    const name = `${owner}-${reason}`
    await create(name, ['--network', owner, '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
      '--mount', `type=bind,source=${join(certificates, caFile)},target=/run/frontier/mysql-ca.pem,readonly`,
      ...variables, image], { ...runtimeEnv, MYSQL_HOST: hostname })
    await docker(['start', name])
    assert.equal(await docker(['wait', name]), '1')
    const output = await docker(['logs', name])
    assert.ok(output.includes('PERSISTENCE_OPEN_FAILED') && output.includes('STARTUP_FAILED'))
    assert.equal(output.includes('SERVER_LISTENING'), false)
    await remove(name)
    rejectedTls.push(reason)
  }
  await rejectTls('untrusted-ca', 'frontier-mysql', 'untrusted.pem')
  await rejectTls('hostname-mismatch', 'frontier-mysql-mismatch')
  step = 'plaintext-fixture'
  const plaintext = `${owner}-plaintext`
  await create(plaintext, ['--network', owner, '--network-alias', 'frontier-plaintext', '--publish', '127.0.0.1::3306',
    '--env', 'MYSQL_ROOT_PASSWORD', '--env', 'MYSQL_ROOT_HOST', '--env', 'MYSQL_USER', '--env', 'MYSQL_PASSWORD', '--env', 'MYSQL_DATABASE',
    '--memory', '768m', '--cpus', '2', '--pids-limit', '256', '--tmpfs', '/var/lib/mysql:rw,noexec,nosuid,size=512m', mysqlImage,
    '--tls-version=', '--auto-generate-certs=OFF', '--mysqlx=OFF', '--innodb-flush-log-at-trx-commit=1', '--sync-binlog=1', '--max-connections=24'])
  await docker(['start', plaintext])
  const plainBinding = await docker(['port', plaintext, '3306/tcp'])
  assert.match(plainBinding, /^127\.0\.0\.1:\d+$/u)
  const plainConfig = { host: '127.0.0.1', port: Number(plainBinding.split(':')[1]), database: databaseName,
    user: 'frontier_bootstrap', password: passwords.bootstrap, ca: null, initialize: true }
  let plainReady = false
  for (let attempt = 0; attempt < 90; attempt += 1) {
    try { const connection = await createConnection({ host: plainConfig.host, port: plainConfig.port,
      user: plainConfig.user, password: plainConfig.password, database: databaseName, connectTimeout: 1000 })
      await connection.end(); plainReady = true; break
    } catch { await new Promise<void>((done) => setTimeout(done, 1000)) }
  }
  assert.equal(plainReady, true)
  await MysqlStore.prepareSchema(plainConfig)
  const plainAdmin = await createConnection({ host: plainConfig.host, port: plainConfig.port, user: 'root', password: passwords.root })
  try { await createRuntimeAccount(plainAdmin) } finally { await plainAdmin.end() }
  // Prove the same runtime credentials/schema work over plaintext before testing no downgrade.
  const plainRepository = await MysqlStore.open({ ...plainConfig, user: 'frontier_runtime', password: passwords.runtime, initialize: false })
  try { assert.equal((await plainRepository.load()).length, 0) } finally { await plainRepository.close() }
  await rejectTls('plaintext-downgrade', 'frontier-plaintext')
  await remove(plaintext)
  step = 'invalid-static-root-fails-closed'
  for (const staticRoot of ['', '/app/missing-public']) {
    const invalid = `${owner}-invalid-${blockedStaticRoots}`
    await create(invalid, ['--network', owner, '--read-only', ...caMount, ...variables, '--env', 'STATIC_ROOT', image],
      { ...runtimeEnv, STATIC_ROOT: staticRoot })
    await docker(['start', invalid])
    assert.equal(await docker(['wait', invalid]), '1')
    const output = await docker(['logs', invalid])
    assert.equal(output.includes('STARTUP_FAILED'), true)
    assert.equal(output.includes('SERVER_LISTENING'), false)
    await remove(invalid)
    blockedStaticRoots += 1
  }
  step = 'production-startup'
  const app = `${owner}-app`
  await create(app, ['--network', owner, '--init', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--memory=1g', '--cpus=2', '--pids-limit=128', '--stop-timeout=30',
    '--log-driver=json-file', '--log-opt=max-size=10m', '--log-opt=max-file=3', '--restart=on-failure:3',
    '--publish', '127.0.0.1::3001', ...caMount, ...variables, image], runtimeEnv)
  await docker(['start', app])
  const appBinding = await docker(['port', app, '3001/tcp'])
  assert.match(appBinding, /^127\.0\.0\.1:\d+$/u)
  appUrl = `http://${appBinding}`
  await ready()
  assert.equal((await fetch(`${appUrl}/health`)).status, 200)
  assert.equal((await fetch(appUrl)).status, 200)
  for (const path of ['/.env', '/data/frontier-isles.sqlite', '/server/test', '/debug', '/assets/mysql-ca.pem']) {
    assert.equal((await fetch(appUrl + path)).status, 404)
  }
  const runtime = JSON.parse(await docker(['exec', app, 'node', '--input-type=module', '-e',
    "import {existsSync,writeFileSync} from 'node:fs';let readOnly=false;try{writeFileSync('/app/probe','x')}catch(error){readOnly=error.code==='EROFS'};console.log(JSON.stringify({uid:process.getuid(),sqliteExists:existsSync('/data/frontier-isles.sqlite'),readOnly,provider:process.env.PERSISTENCE_PROVIDER,staticRoot:process.env.STATIC_ROOT}))"])) as { uid: number; sqliteExists: boolean; readOnly: boolean; provider: string; staticRoot: string }
  assert.deepEqual(runtime, { uid: 1000, sqliteExists: false, readOnly: true, provider: 'mysql', staticRoot: '/app/public' })
  const mounts = await docker(['inspect', '--format', '{{range .Mounts}}{{.Destination}} {{end}}', app])
  assert.equal(mounts.includes('/data'), false)
  assert.equal(mounts.includes('/run/frontier/mysql-ca.pem'), true)
  assert.equal(await docker(['inspect', '--format', '{{range .Mounts}}{{if eq .Destination "/run/frontier/mysql-ca.pem"}}{{.RW}}{{end}}{{end}}', app]), 'false')
  assert.equal((await docker(['exec', app, 'node', '--input-type=module', '-e',
    "import {createConnection} from 'mysql2/promise';import {readFileSync} from 'node:fs';const db=await createConnection({host:process.env.MYSQL_HOST,user:process.env.MYSQL_USER,password:process.env.MYSQL_PASSWORD,database:process.env.MYSQL_DATABASE,ssl:{ca:readFileSync(process.env.MYSQL_TLS_CA_FILE,'utf8'),rejectUnauthorized:true,verifyIdentity:true,minVersion:'TLSv1.2'}});const [rows]=await db.query(\"SHOW SESSION STATUS LIKE 'Ssl_cipher'\");console.log(rows.length===1&&rows[0].Value.length>0?'VERIFIED_TLS_CIPHER':'MISSING_TLS');await db.end();"])), 'VERIFIED_TLS_CIPHER')
  step = 'legal-command'
  const protocolVersion = REALTIME_PROTOCOL_VERSION
  const members: RoomSessionData[] = []
  const connectedClients: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
  for (let index = 0; index < 4; index += 1) {
    const client = await connect(); connectedClients.push(client)
    const host = members[0]
    const member = host === undefined
      ? successData(roomCreateAcknowledgementSchema.parse(await client.timeout(5000).emitWithAck('room:create', { protocolVersion, displayName: 'Production Host' })))
      : successData(roomJoinAcknowledgementSchema.parse(await client.timeout(5000).emitWithAck('room:join', { protocolVersion, roomCode: host.credential.roomCode, displayName: `Production Human ${index}` })))
    members.push(member); tokens.push(member.credential.resumeToken, member.credential.sessionId)
    rawResumeTokens.push(member.credential.resumeToken)
  }
  const host = requireValue(connectedClients[0])
  const revision = async (): Promise<RoomRevision> => successData(roomRequestSnapshotAcknowledgementSchema.parse(
    await host.timeout(5000).emitWithAck('room:request-snapshot', { protocolVersion }))).snapshot.revision
  for (const client of connectedClients) successData(await client.timeout(5000).emitWithAck('room:set-ready', { protocolVersion, expectedRevision: await revision(), ready: true }))
  const started = successData(roomStartAcknowledgementSchema.parse(await host.timeout(5000).emitWithAck('room:start', { protocolVersion, expectedRevision: await revision() }))).snapshot
  const identity = { protocolVersion, roomCode: started.roomCode, gameId: requireValue(started.gameId) }
  const snapshots = await Promise.all(connectedClients.map(async (client) => successData(gameRequestSnapshotAcknowledgementSchema.parse(
    await client.timeout(5000).emitWithAck('game:request-snapshot', identity)))))
  const actorIndex = snapshots.findIndex((value) => value.view.self.id === value.view.publicGame.turn.currentPlayerId)
  const actor = requireValue(connectedClients[actorIndex]); const initial = requireValue(snapshots[actorIndex])
  const request = gameCommandRequestSchema.parse({ ...identity, commandId: 'production:mysql-durable-build', expectedStateVersion: initial.view.stateVersion,
    command: { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: requireValue(initial.view.legalActions.legalInitialSettlementVertexIds?.[0]) } })
  const accepted = gameCommandAcknowledgementSchema.parse(await actor.timeout(5000).emitWithAck('game:command', request))
  assert.equal(successData(accepted).accepted, true)
  const before = successData(gameRequestSnapshotAcknowledgementSchema.parse(await actor.timeout(5000).emitWithAck('game:request-snapshot', identity))).view
  const saved = await stored()
  assert.equal(saved.game?.state.stateVersion, before.stateVersion)
  for (const mode of ['crash', 'restart']) {
    step = `${mode}-recovery`
    if (mode === 'crash') { await docker(['kill', '--signal=KILL', app]); await docker(['start', app]) }
    else await docker(['restart', '--time', '30', app])
    // Docker reassigns an ephemeral host port after a stop/start on this platform.
    const recoveredBinding = await docker(['port', app, '3001/tcp'])
    assert.match(recoveredBinding, /^127\.0\.0\.1:\d+$/u)
    appUrl = `http://${recoveredBinding}`
    await ready()
    const recovered = await stored()
    assert.equal(canonicalJson(recovered.game?.state) === canonicalJson(saved.game?.state), true)
    assert.equal(canonicalJson(recovered.game?.commandCache) === canonicalJson(saved.game?.commandCache), true)
    const restored: Socket<ServerToClientEvents, ClientToServerEvents>[] = []
    for (const member of members) { const client = await connect(); restored.push(client); successData(await client.timeout(5000).emitWithAck('session:resume', member.credential)) }
    const resumed = requireValue(restored[actorIndex])
    const view = successData(gameRequestSnapshotAcknowledgementSchema.parse(await resumed.timeout(5000).emitWithAck('game:request-snapshot', identity))).view
    assert.equal(canonicalJson(view) === canonicalJson(before), true)
    assert.equal(canonicalJson(await resumed.timeout(5000).emitWithAck('game:command', request)) === canonicalJson(accepted), true)
    assert.equal(canonicalJson((await stored()).game?.state) === canonicalJson(saved.game?.state), true)
  }
  step = 'graceful-stop-and-privacy'
  await docker(['stop', '--time', '30', app])
  assert.equal((await docker(['logs', app])).includes('SHUTDOWN_COMPLETE'), true)
  assert.equal(await docker(['inspect', '--format', '{{.State.ExitCode}}', app]), '0')
  assert.equal(canonicalJson((await stored()).game?.state) === canonicalJson(saved.game?.state), true)
  passed = true
} catch (error: unknown) {
  const line = error instanceof Error ? /run-mysql-container-smoke\.ts:(\d+):\d+/u.exec(error.stack ?? '')?.[1] : undefined
  console.error(JSON.stringify({ code: 'LOCAL_MYSQL_PRODUCTION_FAILED', step, ...(line === undefined ? {} : { testLine: Number(line) }) }))
  process.exitCode = 1
} finally {
  for (const client of clients) client.disconnect()
  try {
    for (const name of [...containers].reverse()) await remove(name)
    if (networkOwned) {
      assert.equal(await docker(['network', 'inspect', '--format', `{{ index .Labels "${label}" }}`, owner]), owner)
      await docker(['network', 'rm', owner]); networkOwned = false
    }
    directory.remove()
    assert.equal(existsSync(directory.path), false)
  } catch { passed = false; process.exitCode = 1; console.error('LOCAL_MYSQL_PRODUCTION_CLEANUP_FAILED') }
  const summary = { code: 'LOCAL_MYSQL_PRODUCTION', passed, image, owner, ownedResourcesRemoved: containers.length === 0 && !networkOwned,
    productionTls: passed, restrictedRuntime: passed, sqliteRequired: false, blockedStaticRoots,
    rejectedTls, readonlyCaMount: passed, negotiatedTlsCipher: passed, certificatesRemoved: !existsSync(directory.path),
    privateMaterialAbsent: passed, globalTrustChanged: false,
    humans: passed ? 4 : 0, legalCommands: passed ? 1 : 0, exactReplays: passed ? 2 : 0,
    starts: passed ? 3 : 0, crashRecovery: passed, gracefulRestart: passed, exactStateAndRng: passed,
    cloudAccessed: false, pushed: false, deployed: false }
  writeFileSync('server/logs/preflight-mysql-production-summary.json', JSON.stringify(summary) + '\n')
  console.log(JSON.stringify(summary))
}
