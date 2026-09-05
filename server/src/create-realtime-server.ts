import type { Server as HttpServer } from 'node:http'
import { Server, type ServerOptions } from 'socket.io'
import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from '@frontier-isles/realtime-contracts'
import type { ServerConfig } from './config.js'

export type InterServerEvents = Record<never, never>
export type SocketData = Record<never, never>

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
): RealtimeServer {
  return new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, createRealtimeServerOptions(config))
}
