/** Offline configuration validation. Compose config does not contact or start a daemon. */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { temporaryPersistenceDirectory } from './persistence-test-helpers.js'

const directory = temporaryPersistenceDirectory()
try {
  const env = { ...process.env, FRONTIER_IMAGE: `example.invalid/frontier@sha256:${'a'.repeat(64)}`,
    CLIENT_ORIGINS: 'https://play.frankiesgroceryhk.shop', MYSQL_HOST: 'database.example.invalid', MYSQL_PORT: '3306',
    MYSQL_DATABASE: 'frontier_isles', MYSQL_USER: 'synthetic_runtime', MYSQL_PASSWORD: 'synthetic-validation-only',
    MYSQL_TLS_CA_HOST_FILE: resolve(directory.path, 'parser-ca.pem') }
  const result = spawnSync('docker', ['compose', '-f', 'compose.mysql-production.yaml', 'config', '--format', 'json'],
    { env, encoding: 'utf8', windowsHide: true, timeout: 20_000 })
  assert.equal(result.status, 0)
  const compose = z.object({ services: z.record(z.string(), z.object({ environment: z.record(z.string(), z.string()),
    ports: z.array(z.object({ host_ip: z.string(), target: z.number(), published: z.string() })),
    volumes: z.array(z.object({ type: z.string(), target: z.string(), read_only: z.boolean() })),
    read_only: z.boolean(), cap_drop: z.array(z.string()), security_opt: z.array(z.string()),
    restart: z.string(), stop_grace_period: z.string(), pids_limit: z.number(), mem_limit: z.union([z.string(), z.number()]),
    logging: z.object({ options: z.record(z.string(), z.string()) }), tmpfs: z.array(z.string()) })) }).parse(JSON.parse(result.stdout))
  assert.deepEqual(Object.keys(compose.services), ['frontier-isles'])
  const service = compose.services['frontier-isles']
  assert.ok(service)
  for (const [key, value] of Object.entries({ NODE_ENV: 'production', PORT: '3001', STATIC_ROOT: '/app/public',
    PERSISTENCE_PROVIDER: 'mysql', MYSQL_TLS: 'required', MYSQL_TLS_CA_FILE: '/run/frontier/mysql-ca.pem', MYSQL_SCHEMA_MODE: 'verify',
    CLIENT_ORIGINS: env.CLIENT_ORIGINS, MYSQL_HOST: env.MYSQL_HOST, MYSQL_PORT: env.MYSQL_PORT,
    MYSQL_DATABASE: env.MYSQL_DATABASE, MYSQL_USER: env.MYSQL_USER, MYSQL_PASSWORD: env.MYSQL_PASSWORD })) assert.equal(service.environment[key], value)
  assert.equal(service.environment.PERSISTENCE_FILE, undefined)
  assert.equal(service.ports.length, 1)
  assert.deepEqual(service.ports.map(({ host_ip, target, published }) => ({ host_ip, target, published })), [{ host_ip: '127.0.0.1', target: 3001, published: '3001' }])
  assert.deepEqual(service.volumes.map(({ type, target, read_only }) => ({ type, target, read_only })), [{ type: 'bind', target: '/run/frontier/mysql-ca.pem', read_only: true }])
  assert.equal(service.read_only, true)
  assert.ok(service.cap_drop.includes('ALL'))
  assert.ok(service.security_opt.includes('no-new-privileges:true'))
  assert.equal(service.restart, 'on-failure:3')
  assert.equal(service.stop_grace_period, '30s')
  assert.equal(service.pids_limit, 128)
  assert.equal(Number(service.mem_limit), 1_073_741_824)
  assert.deepEqual(service.logging.options, { 'max-file': '3', 'max-size': '10m' })
  assert.ok(service.tmpfs.some((value) => value.includes('noexec,nosuid,size=16m')))
  const unit = readFileSync('deploy/frontier-isles.service', 'utf8')
  for (const line of ['Type=oneshot', 'RemainAfterExit=yes', 'Requires=docker.service', 'After=docker.service network-online.target',
    'WantedBy=multi-user.target', 'TimeoutStopSec=50']) assert.ok(unit.includes(line))
  assert.equal(/^Restart=/mu.test(unit), false)
  assert.ok(unit.includes('stop --timeout 30'))
  assert.ok(unit.includes('--wait --wait-timeout 120'))
  const vercel = z.object({ buildCommand: z.string() }).parse(JSON.parse(readFileSync('vercel.json', 'utf8')))
  const target = /^VITE_REALTIME_URL=(https:\/\/[a-z0-9.-]+) npm run build$/u.exec(vercel.buildCommand)?.[1]
  assert.equal(target, 'https://game-api.frankiesgroceryhk.shop')
  const output = join(directory.path, 'split-dist')
  const build = spawnSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build', '--outDir', output],
    { env: { ...env, VITE_REALTIME_URL: target }, encoding: 'utf8', windowsHide: true, timeout: 120_000 })
  assert.equal(build.status, 0)
  const bundles = readdirSync(join(output, 'assets')).filter((name) => name.endsWith('.js')).map((name) => readFileSync(join(output, 'assets', name), 'utf8')).join('\n')
  assert.ok(bundles.includes(target))
  assert.equal(bundles.includes(env.MYSQL_PASSWORD), false)
  const summary = { code: 'LOCAL_DEPLOYMENT_CONFIG_PASSED', compose: true, bootPolicy: true, splitOriginBuild: true,
    secretsBundled: false, cloudAccessed: false }
  writeFileSync('server/logs/preflight-config-summary.json', JSON.stringify(summary) + '\n')
  console.log(JSON.stringify(summary))
} catch {
  console.error('LOCAL_DEPLOYMENT_CONFIG_FAILED (no expanded environment retained)')
  process.exitCode = 1
} finally { directory.remove() }
