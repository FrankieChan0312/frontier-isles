import { createServer, type Server as HttpServer, type ServerResponse } from 'node:http'
import { createReadStream, realpathSync, statSync } from 'node:fs'
import { extname, join, relative, isAbsolute, sep } from 'node:path'
import { createRealtimeHealthResponse } from '@frontier-isles/realtime-contracts'
import { MAX_CONNECTIONS } from './security/network-limits.js'
import type { Socket } from 'node:net'

const connections = new WeakMap<HttpServer, Set<Socket>>()
export function closeFrontierConnections(server: HttpServer): void {
  for (const socket of connections.get(server) ?? []) socket.destroy()
  server.closeAllConnections()
}
export function frontierConnectionCount(server: HttpServer): number { return connections.get(server)?.size ?? 0 }

export interface FrontierHttpOptions {
  readonly staticRoot?: string
  readonly privateDataFile?: string
  readonly allowedOrigins?: readonly string[]
  readonly isReady?: () => boolean
}
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
}
function json(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(value))
}
function contained(root: string, path: string): boolean {
  const result = relative(root, path)
  return !isAbsolute(result) && result !== '..' && !result.startsWith(`..${sep}`)
}

/** Only built, public assets are HTTP-readable. There is no game-state or fixture HTTP API. */
export function createFrontierHttpServer(options: FrontierHttpOptions = {}): HttpServer {
  let root: string | undefined
  if (options.staticRoot !== undefined) {
    try {
      root = realpathSync(options.staticRoot)
      const index = realpathSync(join(root, 'index.html'))
      if (!statSync(root).isDirectory() || !contained(root, index) || !statSync(index).isFile()) throw new Error('Invalid static build.')
      if (options.privateDataFile !== undefined && contained(root, realpathSync(options.privateDataFile))) throw new Error('Private storage overlaps public assets.')
    } catch { throw new Error('The public frontend build is unavailable. Check STATIC_ROOT and the build.') }
  }
  const server = createServer({ maxHeaderSize: 8192, headersTimeout: 10_000, requestTimeout: 10_000,
    keepAliveTimeout: 5000, connectionsCheckingInterval: 1000 }, (request, response) => {
    response.setHeader('cache-control', 'no-store')
    response.setHeader('x-content-type-options', 'nosniff')
    response.setHeader('referrer-policy', 'no-referrer')
    response.setHeader('x-frame-options', 'DENY')
    response.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
    const origin = request.headers.origin
    if (origin !== undefined && !(options.allowedOrigins ?? []).includes(origin)) { json(response, 403, { error: 'ORIGIN_NOT_ALLOWED' }); return }
    if (origin !== undefined) {
      response.setHeader('access-control-allow-origin', origin)
      response.setHeader('vary', 'Origin')
    }
    if (request.headers['transfer-encoding'] !== undefined || (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0')) {
      response.setHeader('connection', 'close')
      response.once('finish', () => request.socket.destroy())
      json(response, 413, { error: 'REQUEST_BODY_NOT_ALLOWED' })
      return
    }
    if ((request.url?.length ?? 0) > 2048) { json(response, 414, { error: 'REQUEST_TOO_LARGE' }); return }
    if (request.method !== 'GET' && request.method !== 'HEAD') { json(response, 405, { error: 'METHOD_NOT_ALLOWED' }); return }
    if (request.url === '/health') { json(response, 200, createRealtimeHealthResponse()); return }
    if (request.url === '/ready') {
      let ready = false
      try { ready = options.isReady?.() ?? true } catch { /* Readiness never exposes a cause. */ }
      json(response, ready ? 200 : 503, { status: ready ? 'ready' : 'not_ready' })
      return
    }
    try {
      const path = decodeURIComponent((request.url ?? '').split('?')[0] ?? '')
      const index = path === '/' || path === '/index.html'
      if (root === undefined || (!index && !/^\/assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:js|css|woff2?|svg|png|jpg|webp|ico)$/u.test(path))) {
        json(response, 404, { error: 'NOT_FOUND' }); return
      }
      const filename = realpathSync(join(root, index ? 'index.html' : path.slice(1)))
      if (!contained(root, filename) || !statSync(filename).isFile()) { json(response, 404, { error: 'NOT_FOUND' }); return }
      response.setHeader('content-type', CONTENT_TYPES[extname(filename)] ?? 'application/octet-stream')
      response.setHeader('cache-control', index ? 'no-store' : 'public, max-age=31536000, immutable')
      response.setHeader('content-length', statSync(filename).size)
      if (request.method === 'HEAD') { response.end(); return }
      const stream = createReadStream(filename)
      response.once('close', () => stream.destroy())
      stream.on('error', () => response.destroy())
      stream.pipe(response)
    } catch { if (!response.headersSent) json(response, 404, { error: 'NOT_FOUND' }); else response.destroy() }
  })
  server.maxConnections = MAX_CONNECTIONS * 2
  server.maxRequestsPerSocket = 100
  const live = new Set<Socket>()
  connections.set(server, live)
  server.on('connection', (socket) => { live.add(socket); socket.once('close', () => live.delete(socket)) })
  return server
}
