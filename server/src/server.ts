import { parseServerConfig } from './config.js'
import { createFrontierHttpServer } from './create-http-server.js'
import { createRealtimeServer } from './create-realtime-server.js'
import { createGracefulShutdown } from './graceful-shutdown.js'
import { InMemoryRoomService } from './lobby/room-service.js'
import { SqliteMultiplayerRepository } from './persistence/sqlite-multiplayer-repository.js'
import { MysqlMultiplayerRepository } from './persistence/mysql-multiplayer-repository.js'
import { safeLogRecord } from './security/safe-log.js'

function reportDiagnostic(diagnostic: unknown): void { console.log(safeLogRecord(diagnostic)) }

async function start(): Promise<void> {
  const config = parseServerConfig(process.env)
  const repository = config.persistenceProvider === 'mysql' && config.mysql !== undefined
    ? await MysqlMultiplayerRepository.open(config.mysql, { onDiagnostic: reportDiagnostic })
    : new SqliteMultiplayerRepository(config.persistenceFile ?? 'data/frontier-isles.sqlite', { onDiagnostic: reportDiagnostic })
  let roomService: InMemoryRoomService
  try {
    roomService = await InMemoryRoomService.open({ repository, reconnectGraceMs: config.reconnectGraceMs,
      roomIdleTtlMs: config.roomIdleTtlMs, gameAbandonedTtlMs: config.gameAbandonedTtlMs ?? 1_800_000,
      restartRecoveryGraceMs: config.restartRecoveryGraceMs ?? 120_000, onPersistenceDiagnostic: reportDiagnostic })
  } catch { await repository.close(); throw new Error('Multiplayer recovery failed.') }
  let httpServer: ReturnType<typeof createFrontierHttpServer>
  try {
    httpServer = createFrontierHttpServer({ allowedOrigins: config.clientOrigins ?? [config.clientOrigin],
      ...(config.persistenceProvider === 'mysql' ? {} : { privateDataFile: config.persistenceFile ?? 'data/frontier-isles.sqlite' }),
      isReady: () => roomService.isReady, ...(config.staticRoot === undefined ? {} : { staticRoot: config.staticRoot }) })
  } catch { roomService.dispose(); await repository.close(); throw new Error('Public frontend startup failed.') }
  const realtimeServer = createRealtimeServer(httpServer, config, { roomService, onDiagnostic: reportDiagnostic })
  const shutdown = createGracefulShutdown({ httpServer, realtimeServer })
  let stopping = false
  function handleShutdownSignal(): void {
    if (stopping) return
    stopping = true
    reportDiagnostic({ code: 'SHUTDOWN_STARTED' })
    void shutdown().then(() => reportDiagnostic({ code: 'SHUTDOWN_COMPLETE' })).catch(() => {
      console.error(safeLogRecord({ code: 'SHUTDOWN_FAILED' }))
      process.exitCode = 1
    })
  }
  process.once('SIGINT', handleShutdownSignal)
  process.once('SIGTERM', handleShutdownSignal)
  httpServer.once('error', () => {
    console.error(safeLogRecord({ code: 'SERVER_LISTEN_FAILED' }))
    process.exitCode = 1
    handleShutdownSignal()
  })
  httpServer.listen(config.port, () => {
    reportDiagnostic({ code: 'SERVER_LISTENING', port: config.port })
  })
}
try { await start() } catch {
  console.error(safeLogRecord({ code: 'STARTUP_FAILED' }))
  process.exitCode = 1
}
