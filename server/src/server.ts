import { REALTIME_SERVICE_NAME } from '@frontier-isles/realtime-contracts'
import { parseServerConfig } from './config.js'
import { createFrontierHttpServer } from './create-http-server.js'
import { createRealtimeServer } from './create-realtime-server.js'
import { createGracefulShutdown } from './graceful-shutdown.js'

const config = parseServerConfig(process.env)
const httpServer = createFrontierHttpServer()
const realtimeServer = createRealtimeServer(httpServer, config)
const shutdown = createGracefulShutdown({ httpServer, realtimeServer })

function handleShutdownSignal(): void {
  void shutdown().catch((error: unknown) => {
    console.error('Realtime server shutdown failed.', error)
    process.exitCode = 1
  })
}

process.once('SIGINT', handleShutdownSignal)
process.once('SIGTERM', handleShutdownSignal)

httpServer.listen(config.port, () => {
  console.log(`${REALTIME_SERVICE_NAME} listening on port ${config.port}`)
})
