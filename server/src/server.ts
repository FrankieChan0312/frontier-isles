import { REALTIME_SERVICE_NAME } from '@frontier-isles/realtime-contracts'
import { parseServerConfig } from './config.js'
import { createFrontierHttpServer } from './create-http-server.js'
import { createRealtimeServer } from './create-realtime-server.js'
import { createGracefulShutdown } from './graceful-shutdown.js'
import { InMemoryRoomService } from './lobby/room-service.js'
import { SqliteMultiplayerRepository } from './persistence/sqlite-multiplayer-repository.js'
import type { PersistenceDiagnostic } from './persistence/multiplayer-repository.js'

function reportPersistence(diagnostic: PersistenceDiagnostic): void { console.log(JSON.stringify(diagnostic)) }

function start(): void {
  const config = parseServerConfig(process.env)
  const repository = new SqliteMultiplayerRepository(config.persistenceFile ?? 'data/frontier-isles.sqlite', { onDiagnostic: reportPersistence })
  let roomService: InMemoryRoomService
  try {
    roomService = new InMemoryRoomService({ repository, reconnectGraceMs: config.reconnectGraceMs,
      roomIdleTtlMs: config.roomIdleTtlMs, gameAbandonedTtlMs: config.gameAbandonedTtlMs ?? 1_800_000,
      restartRecoveryGraceMs: config.restartRecoveryGraceMs ?? 120_000, onPersistenceDiagnostic: reportPersistence })
  } catch { repository.close(); throw new Error('Multiplayer recovery failed.') }
  const httpServer = createFrontierHttpServer()
  const realtimeServer = createRealtimeServer(httpServer, config, { roomService })
  const shutdown = createGracefulShutdown({ httpServer, realtimeServer })
  function handleShutdownSignal(): void {
    void shutdown().catch(() => {
      console.error(JSON.stringify({ code: 'SHUTDOWN_FAILED', message: 'Check the private recovery runbook before restarting.' }))
      process.exitCode = 1
    })
  }
  process.once('SIGINT', handleShutdownSignal)
  process.once('SIGTERM', handleShutdownSignal)
  httpServer.listen(config.port, () => {
    console.log(`${REALTIME_SERVICE_NAME} listening on port ${config.port}`)
  })
}
try { start() } catch {
  console.error(JSON.stringify({ code: 'STARTUP_FAILED', message: 'Check server configuration, data-volume access and the private recovery runbook. Existing data was not reset.' }))
  process.exitCode = 1
}
