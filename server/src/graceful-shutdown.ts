import type { Server as HttpServer } from 'node:http'
import type { RealtimeServer } from './create-realtime-server.js'
import { realtimeRoomService } from './create-realtime-server.js'

export interface GracefulShutdownDependencies {
  readonly httpServer: HttpServer
  readonly realtimeServer: RealtimeServer
}

async function closeServers({
  httpServer,
  realtimeServer,
}: GracefulShutdownDependencies): Promise<void> {
  const roomService = realtimeRoomService(realtimeServer)
  let persistenceFailed = false
  try { await roomService?.shutdown() } catch { persistenceFailed = true }
  await new Promise<void>((resolve, reject) => {
    realtimeServer.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })

  if (httpServer.listening) {
    await new Promise<void>((resolve, reject) => {
      httpServer.close((error) => {
        if (error === undefined) resolve()
        else reject(error)
      })
    })
  }
  roomService?.dispose()
  try { roomService?.closeRepository() } catch { persistenceFailed = true }
  if (persistenceFailed) throw new Error('Persistence shutdown failed. Check the private recovery runbook before restarting.')
}

export function createGracefulShutdown(
  dependencies: GracefulShutdownDependencies,
): () => Promise<void> {
  let shutdownPromise: Promise<void> | null = null

  return (): Promise<void> => {
    shutdownPromise ??= closeServers(dependencies)
    return shutdownPromise
  }
}
