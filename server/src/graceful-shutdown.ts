import type { Server as HttpServer } from 'node:http'
import type { RealtimeServer } from './create-realtime-server.js'
import { realtimeRoomService, disposeRealtimeBoundary } from './create-realtime-server.js'
import { closeFrontierConnections } from './create-http-server.js'

export interface GracefulShutdownDependencies {
  readonly httpServer: HttpServer
  readonly realtimeServer: RealtimeServer
}

async function closeServers({
  httpServer,
  realtimeServer,
}: GracefulShutdownDependencies): Promise<void> {
  const roomService = realtimeRoomService(realtimeServer)
  let failed = false
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    try { await roomService?.shutdown() } catch { failed = true }
    await Promise.race([
      new Promise<void>((resolve, reject) => realtimeServer.close((error) => error === undefined ? resolve() : reject(error))),
      new Promise<void>((resolve) => { deadline = setTimeout(() => { failed = true; closeFrontierConnections(httpServer); resolve() }, 10_000) }),
    ])
  } catch { failed = true } finally {
    clearTimeout(deadline)
    closeFrontierConnections(httpServer)
    if (httpServer.listening) {
      await new Promise<void>((resolve) => httpServer.close((error) => { if (error !== undefined) failed = true; resolve() }))
    }
    roomService?.dispose()
    disposeRealtimeBoundary(realtimeServer)
    try { roomService?.closeRepository() } catch { failed = true }
  }
  if (failed) throw new Error('Server shutdown failed. Check the private recovery runbook before restarting.')
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
