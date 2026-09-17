import { randomBytes, randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createConnection } from 'mysql2/promise'
import { redactTraceEntries } from './trace-artifact-safety.js'

// Only this harness creates/selects test credentials, ports and database ownership.
const name = `frontier-isles-mysql-${randomUUID()}`
const env = { ...process.env, MYSQL_ROOT_PASSWORD: randomBytes(24).toString('hex'),
  MYSQL_ROOT_HOST: '%', FRONTIER_MYSQL_RUNTIME_PASSWORD: randomBytes(24).toString('hex'),
  MYSQL_PASSWORD: randomBytes(24).toString('hex'), MYSQL_USER: 'frontier_test', MYSQL_DATABASE: 'frontier_isles_mysql_test' }
function docker(args: readonly string[]): string {
  const result = spawnSync('docker', [...args], { env, encoding: 'utf8', windowsHide: true, timeout: 180_000 })
  if (result.status !== 0) throw new Error('Owned MySQL Docker operation failed. Check local Docker availability.')
  return result.stdout.trim()
}
let owned = false
let passed = false
let removed = false
function removeOwnedContainer(): void {
  if (docker(['inspect', '--format', '{{ index .Config.Labels "frontier-isles.mysql-test" }}', name]) !== name) {
    throw new Error('Container ownership verification failed; no removal attempted.')
  }
  docker(['rm', '--force', name])
  removed = true
  console.log('MYSQL_TEST_CONTAINER_STOPPED_AND_REMOVED')
}
try {
  const localEndpoint = /^(?:unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/u
  const dockerHost = process.env.DOCKER_HOST
  if (dockerHost !== undefined && dockerHost.length > 0 && !localEndpoint.test(dockerHost)) {
    throw new Error('MySQL qualification requires a local Docker endpoint.')
  }
  const context = docker(['context', 'show'])
  const endpoint = docker(['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}'])
  if (!localEndpoint.test(endpoint)) throw new Error('MySQL qualification requires a local Docker context.')
  docker(['create', '--name', name, '--label', `frontier-isles.mysql-test=${name}`,
    '--publish', '127.0.0.1::3306', '--env', 'MYSQL_ROOT_PASSWORD', '--env', 'MYSQL_ROOT_HOST', '--env', 'MYSQL_PASSWORD',
    '--env', 'MYSQL_USER', '--env', 'MYSQL_DATABASE', '--memory', '768m', '--cpus', '2',
    '--pids-limit', '256', '--tmpfs', '/var/lib/mysql:rw,noexec,nosuid,size=512m',
    'mysql:8.4@sha256:85b9bf2e29cf836ecb8c2a15a935d4ba0c606631dff1dd79531a11983c638f2a',
    '--innodb-flush-log-at-trx-commit=1', '--sync-binlog=1', '--max-connections=24'])
  owned = true
  docker(['start', name])
  console.log('MYSQL_TEST_CONTAINER_STARTED (isolated loopback, temporary data)')
  const binding = docker(['port', name, '3306/tcp'])
  if (!/^127\.0\.0\.1:\d+$/u.test(binding)) throw new Error('Unexpected test binding.')
  const port = Number(binding.split(':')[1])
  let ready = false
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const connection = await createConnection({ host: '127.0.0.1', port, user: env.MYSQL_USER,
        password: env.MYSQL_PASSWORD, database: env.MYSQL_DATABASE, connectTimeout: 1000 })
      await connection.end()
      ready = true
      break
    } catch { await new Promise<void>((resolveWait) => setTimeout(resolveWait, 1000)) }
  }
  if (!ready) throw new Error('Owned MySQL test service did not become ready.')
  const testEnv = { ...env, NODE_ENV: 'test', MYSQL_HOST: '127.0.0.1', MYSQL_PORT: String(port),
    MYSQL_TLS: 'disabled', MYSQL_SCHEMA_MODE: 'initialize', FRONTIER_MYSQL_TEST_OWNER: name,
    DEBUG: '', NODE_DEBUG: '', NODE_DEBUG_NATIVE: '' }
  const exitCode = await new Promise<number>((resolveExit, reject) => {
    const child = spawn(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), 'run', '--config', 'vitest.mysql.config.ts'],
      { cwd: resolve('server'), env: testEnv, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    let overflow = false
    const append = (chunk: Buffer): void => {
      if (output.length + chunk.length > 4 * 1024 * 1024) { overflow = true; child.kill(); return }
      output += chunk.toString()
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    child.once('error', () => reject(new Error('MySQL test runner did not start.')))
    child.once('close', (code) => {
      const secrets = [env.MYSQL_PASSWORD, env.MYSQL_ROOT_PASSWORD, env.FRONTIER_MYSQL_RUNTIME_PASSWORD]
      const leaked = secrets.some((secret) => output.includes(secret))
      const safe = secrets.reduce((value, secret) => value.replaceAll(secret, '[REDACTED_TEST_CREDENTIAL]'), output)
      const redacted = redactTraceEntries([{ name: 'mysql-tests.log', data: Buffer.from(safe) }])
      process.stdout.write(redacted.entries[0]?.data ?? Buffer.alloc(0))
      resolveExit(leaked || overflow || redacted.secrets > 0 ? 1 : code ?? 1)
    })
  })
  passed = exitCode === 0
  process.exitCode = exitCode
} catch {
  console.error('MYSQL_TEST_HARNESS_FAILED (no credentials or driver diagnostics retained)')
  process.exitCode = 1
} finally {
  if (owned) {
    // Exact generated name and ownership label; never enumerate/remove unrelated resources.
    try {
      removeOwnedContainer()
    } catch { passed = false; process.exitCode = 1; console.error('MYSQL_TEST_CLEANUP_FAILED') }
  }
  mkdirSync('server/logs', { recursive: true })
  writeFileSync('server/logs/mysql-harness-summary.json', JSON.stringify({ passed, ownedContainerName: name,
    ownedContainerRemoved: removed, isolatedLoopback: true }) + '\n')
}
