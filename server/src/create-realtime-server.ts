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

export function createRealtimeServerOptions(
  config: ServerConfig,
): Partial<ServerOptions> {
  return {
    cors: {
      origin: [config.clientOrigin],
      credentials: true,
      methods: ['GET', 'POST'],
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
  registerLobbyHandlers(
    realtimeServer,
    dependencies.roomService ?? new InMemoryRoomService(),
  )
  return realtimeServer
}
