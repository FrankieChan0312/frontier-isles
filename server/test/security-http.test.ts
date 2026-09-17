import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { request } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseServerConfig } from '../src/config.js'
import { createFrontierHttpServer, closeFrontierConnections } from '../src/create-http-server.js'
import { allowedRealtimeOrigin } from '../src/create-realtime-server.js'
import { InMemoryRoomService } from '../src/lobby/room-service.js'
import { InMemoryMultiplayerRepository } from '../src/persistence/multiplayer-repository.js'
import { temporaryPersistenceDirectory } from './persistence-test-helpers.js'

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.restoreAllMocks() })
const production = { NODE_ENV: 'production', CLIENT_ORIGINS: 'https://isles.example.test',
  PERSISTENCE_FILE: resolve('logs/config-private.sqlite'), STATIC_ROOT: resolve('dist') }

describe('production configuration', () => {
  it('requires explicit origin, private absolute disk and public build paths', () => {
    const config = parseServerConfig(production)
    expect(config.clientOrigins).toEqual(['https://isles.example.test'])
    expect(() => parseServerConfig({ NODE_ENV: 'production' })).toThrow('CLIENT_ORIGINS')
    expect(() => parseServerConfig({ ...production, PERSISTENCE_FILE: 'relative.sqlite' })).toThrow('PERSISTENCE_FILE')
    expect(() => parseServerConfig({ ...production, STATIC_ROOT: 'relative' })).toThrow('STATIC_ROOT')
    expect(() => parseServerConfig({ ...production, PERSISTENCE_FILE: join(production.STATIC_ROOT, 'private.sqlite') })).toThrow('outside STATIC_ROOT')
  })
  it.each(['*', '', 'null', 'https://user:secret@example.test', 'https://example.test/path',
    'https://example.test?key=secret', 'https://good.test,', Array(9).fill('https://good.test').join(',')])('rejects malformed production allowlists', (value) => {
    expect(() => parseServerConfig({ ...production, CLIENT_ORIGINS: value })).toThrow('CLIENT_ORIGINS')
  })
  it.each(['DEBUG', 'NODE_DEBUG', 'NODE_DEBUG_NATIVE'])('refuses payload-capable library logging through %s', (key) => {
    expect(() => parseServerConfig({ ...production, [key]: '*' })).toThrow('debug logging')
  })
  it.each(['//server/share/game.sqlite', 'file://private/game.sqlite', 'file:private.sqlite', 'C:relative.sqlite'])('rejects non-local or ambiguous database paths', (value) => {
    expect(() => parseServerConfig({ PERSISTENCE_FILE: value })).toThrow('PERSISTENCE_FILE')
  })
  it('requires an exact Origin for production realtime admission and permits originless local test clients', () => {
    const config = parseServerConfig(production)
    expect(allowedRealtimeOrigin('https://isles.example.test', config)).toBe(true)
    for (const origin of [undefined, 'null', 'https://isles.example.test.evil.test', 'http://isles.example.test']) expect(allowedRealtimeOrigin(origin, config)).toBe(false)
    expect(allowedRealtimeOrigin(undefined, parseServerConfig({}))).toBe(true)
  })
})

async function fixture(isReady: () => boolean = () => true): Promise<{ readonly url: string; readonly root: string }> {
  const directory = temporaryPersistenceDirectory()
  cleanup.push(directory.remove)
  const root = join(directory.path, 'public')
  mkdirSync(join(root, 'assets'), { recursive: true })
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Frontier Isles Alpha</title>')
  writeFileSync(join(root, 'assets/app-123.js'), 'export const built = true;')
  writeFileSync(join(directory.path, 'private.sqlite'), 'PRIVATE_SQLITE_SENTINEL')
  const server = createFrontierHttpServer({ staticRoot: root, allowedOrigins: ['https://isles.example.test'], isReady })
  cleanup.push(async () => {
    closeFrontierConnections(server)
    if (server.listening) await new Promise<void>((done) => server.close(() => done()))
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, root }
}
function rawGet(url: string, path: string): Promise<{ readonly status: number; readonly text: string }> {
  return new Promise((done, reject) => {
    const operation = request(url, { path }, (response) => {
      let text = ''
      response.on('data', (chunk: Buffer) => { text += chunk.toString() })
      response.once('end', () => done({ status: response.statusCode ?? 0, text }))
    })
    operation.once('error', reject)
    operation.end()
  })
}

describe('public HTTP boundary', () => {
  it('serves only the built frontend and assets with safe headers, content types and cache policy', async () => {
    const server = await fixture()
    const index = await fetch(server.url)
    expect(index.status).toBe(200)
    expect(index.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(index.headers.get('cache-control')).toBe('no-store')
    expect(index.headers.get('content-security-policy')).toContain("script-src 'self'")
    expect(index.headers.get('x-content-type-options')).toBe('nosniff')
    expect(index.headers.get('referrer-policy')).toBe('no-referrer')
    expect(await index.text()).toContain('Frontier Isles Alpha')
    const asset = await fetch(`${server.url}/assets/app-123.js`, { method: 'HEAD' })
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(asset.headers.get('cache-control')).toContain('immutable')
    expect(await asset.text()).toBe('')
  })
  it('rejects traversal, source/data/debug paths and malformed encoding without exposing disk contents', async () => {
    const server = await fixture()
    for (const path of ['/assets/../private.sqlite', '/assets/%2e%2e/%2e%2e/private.sqlite', '/assets/%5c..%5cprivate.sqlite',
      '/.env', '/data/private.sqlite', '/server/test/fixture.js', '/debug', '/fixture', '/assets/app-123.js.map', '/%ZZ']) {
      const response = await rawGet(server.url, path)
      expect(response.status).toBe(404)
      expect(response.text).toBe('{"error":"NOT_FOUND"}')
    }
  })
  it('checks supplied HTTP Origins and refuses bodies, oversized paths and unsupported methods', async () => {
    const server = await fixture()
    expect((await fetch(`${server.url}/health`, { headers: { Origin: 'https://evil.test' } })).status).toBe(403)
    const allowed = await fetch(`${server.url}/health`, { headers: { Origin: 'https://isles.example.test' } })
    expect(allowed.status).toBe(200)
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://isles.example.test')
    const body = await fetch(server.url, { method: 'POST', body: 'x'.repeat(20_000) })
    expect(body.status).toBe(413)
    expect((await rawGet(server.url, '/' + 'x'.repeat(2050))).status).toBe(414)
    expect((await fetch(server.url, { method: 'DELETE' })).status).toBe(405)
  })
  it('keeps liveness public while readiness reflects a failed persistence boundary and shutdown', async () => {
    const repository = new InMemoryMultiplayerRepository()
    const service = (await InMemoryRoomService.open({ repository }))
    cleanup.push(() => service.dispose())
    const server = await fixture(() => service.isReady)
    expect((await fetch(`${server.url}/ready`)).status).toBe(200)
    vi.spyOn(repository, 'save').mockImplementation(() => { throw new Error('PRIVATE_STORAGE_FAILURE') })
    expect((await service.createRoom('Host')).ok).toBe(false)
    const ready = await fetch(`${server.url}/ready`)
    expect(ready.status).toBe(503)
    expect(await ready.json()).toEqual({ status: 'not_ready' })
    expect((await fetch(`${server.url}/health`)).status).toBe(200)
  })
  it('fails startup for a missing public build instead of serving arbitrary files', () => {
    expect(() => createFrontierHttpServer({ staticRoot: resolve('logs/nonexistent-public-build') })).toThrow('public frontend build')
  })
  it('rejects a private database path that resolves through an alias into the public root', async () => {
    const server = await fixture()
    const alias = join(server.root, '..', 'public-alias')
    symlinkSync(join(server.root, 'assets'), alias, process.platform === 'win32' ? 'junction' : 'dir')
    writeFileSync(join(server.root, 'assets/private.sqlite'), 'PRIVATE_SENTINEL')
    expect(() => createFrontierHttpServer({ staticRoot: server.root, privateDataFile: join(alias, 'private.sqlite') })).toThrow('public frontend build')
  })
})
