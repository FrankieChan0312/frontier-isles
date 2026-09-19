import type { IncomingMessage, Server as HttpServer } from 'node:http'
import { Server, type ServerOptions } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionId,
} from '@frontier-isles/realtime-contracts'
import type { ServerConfig } from './config.js'
import { registerLobbyHandlers } from './lobby/register-lobby-handlers.js'
import { InMemoryRoomService } from './lobby/room-service.js'
import { MAX_CONNECTIONS, MAX_PACKET_BYTES, isBoundedJson } from './security/network-limits.js'
import { RequestLimiter, type LimiterResources } from './security/request-limiter.js'

export type InterServerEvents = Record<never, never>
export interface SocketData {
  sessionId?: SessionId
}

export interface RealtimeServerDependencies {
  readonly roomService?: InMemoryRoomService
  /** Monotonic infrastructure clock injection for deterministic Node tests. */
  readonly limiterNow?: () => number
  readonly onDiagnostic?: (diagnostic: { readonly code: 'RATE_LIMITED' | 'INTERNAL_ERROR' | 'CONNECTION_REJECTED'; readonly count?: number }) => void
}

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>
const roomServices = new WeakMap<RealtimeServer, InMemoryRoomService>()
const limiters = new WeakMap<RealtimeServer, RequestLimiter>()
export function realtimeRoomService(server: RealtimeServer): InMemoryRoomService | undefined { return roomServices.get(server) }
export function realtimeLimiterResources(server: RealtimeServer): LimiterResources {
  return limiters.get(server)?.resources() ?? { transports: 0, sessions: 0 }
}
export function disposeRealtimeBoundary(server: RealtimeServer): void { limiters.get(server)?.dispose(); limiters.delete(server) }
export function allowedRealtimeOrigin(origin: string | undefined, config: ServerConfig): boolean {
  return origin === undefined ? config.nodeEnv !== 'production' : (config.clientOrigins ?? [config.clientOrigin]).includes(origin)
}

export function createRealtimeServerOptions(
  config: ServerConfig,
): Partial<ServerOptions> {
  return {
    cors: {
      origin: [...(config.clientOrigins ?? [config.clientOrigin])],
      credentials: true,
      methods: ['GET', 'POST'],
    },
    serveClient: false,
    maxHttpBufferSize: MAX_PACKET_BYTES,
    connectTimeout: 5000,
    perMessageDeflate: false,
    allowRequest: (request, callback) => callback(null, allowedRealtimeOrigin(request.headers.origin, config)),
    connectionStateRecovery: {
      maxDisconnectionDuration: config.reconnectGraceMs,
      skipMiddlewares: false,
    },
  }
}
export function createRealtimeServer(
  httpServer: HttpServer,
  config: ServerConfig,
  dependencies: RealtimeServerDependencies = {},
): RealtimeServer {
  const roomService = dependencies.roomService ?? new InMemoryRoomService({
    reconnectGraceMs: config.reconnectGraceMs,
    roomIdleTtlMs: config.roomIdleTtlMs,
    ...(config.gameAbandonedTtlMs === undefined ? {} : { gameAbandonedTtlMs: config.gameAbandonedTtlMs }),
  })
  const limiter = new RequestLimiter({ hasSession: (id) => roomService.hasSession(id),
    ...(dependencies.limiterNow === undefined ? {} : { now: dependencies.limiterNow }),
    ...(dependencies.onDiagnostic === undefined ? {} : { onDiagnostic: dependencies.onDiagnostic }) })
  const realtimeServer = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, { ...createRealtimeServerOptions(config), allowRequest: (request, callback) => {
    callback(null, allowedRealtimeOrigin(request.headers.origin, config) && roomService.isReady
      && realtimeServer.engine.clientsCount < MAX_CONNECTIONS && limiter.admitConnection())
  } })
  // CORS alone covers polling. Check Origin on every Engine.IO request, including upgrades.
  realtimeServer.engine.use((request: IncomingMessage, _response: unknown, next: (error?: Error) => void) => {
    next(allowedRealtimeOrigin(request.headers.origin, config) && roomService.isReady ? undefined : new Error('Connection refused.'))
  })
  realtimeServer.use((socket, next) => {
    if (!isBoundedJson(socket.handshake.auth) || !limiter.attachTransport(socket.id)) { next(new Error('Connection refused.')); return }
    const release = (): void => limiter.forgetTransport(socket.id)
    socket.conn.once('close', release)
    socket.once('disconnect', () => { socket.conn.off('close', release); release() })
    next()
  })
  roomServices.set(realtimeServer, roomService)
  limiters.set(realtimeServer, limiter)
  registerLobbyHandlers(realtimeServer, roomService, limiter, () => dependencies.onDiagnostic?.({ code: 'INTERNAL_ERROR' }))
  return realtimeServer
}
