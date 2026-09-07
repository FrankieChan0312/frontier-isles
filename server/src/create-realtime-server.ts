import type { Server as HttpServer } from 'node:http'
import { Server, type ServerOptions } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SessionId,
} from '@frontier-isles/realtime-contracts'
import type { ServerConfig } from './config.js'
import { registerLobbyHandlers } from './lobby/register-lobby-handlers.js'
import { InMemoryRoomService } from './lobby/room-service.js'

export type InterServerEvents = Record<never, never>
export interface SocketData {
  sessionId?: SessionId
}

export interface RealtimeServerDependencies {
  readonly roomService?: InMemoryRoomService
}

export type RealtimeServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>
const roomServices = new WeakMap<RealtimeServer, InMemoryRoomService>()
export function realtimeRoomService(server: RealtimeServer): InMemoryRoomService | undefined { return roomServices.get(server) }

export function createRealtimeServerOptions(
  config: ServerConfig,
): Partial<ServerOptions> {
  return {
    cors: {
      origin: [config.clientOrigin],
      credentials: true,
      methods: ['GET', 'POST'],
    },
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
  const realtimeServer = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, createRealtimeServerOptions(config))
  const roomService = dependencies.roomService ?? new InMemoryRoomService({
      reconnectGraceMs: config.reconnectGraceMs,
      roomIdleTtlMs: config.roomIdleTtlMs,
      ...(config.gameAbandonedTtlMs === undefined ? {} : { gameAbandonedTtlMs: config.gameAbandonedTtlMs }),
    })
  roomServices.set(realtimeServer, roomService)
  registerLobbyHandlers(realtimeServer, roomService)
  return realtimeServer
}
