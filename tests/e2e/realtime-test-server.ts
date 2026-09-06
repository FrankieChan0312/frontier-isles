/** Test process composition only. Production has no fixture route or seed override. */
import { gameIdSchema } from '@frontier-isles/realtime-contracts'
import { parseServerConfig } from '../../server/src/config.ts'
import { createFrontierHttpServer } from '../../server/src/create-http-server.ts'
import { createRealtimeServer } from '../../server/src/create-realtime-server.ts'
import { createGracefulShutdown } from '../../server/src/graceful-shutdown.ts'
import { InMemoryRoomService } from '../../server/src/lobby/room-service.ts'

const config = parseServerConfig(process.env)
if (config.nodeEnv !== 'test') throw new Error('The browser test server requires NODE_ENV=test.')
let gameNumber = 0
const roomService = new InMemoryRoomService({
  reconnectGraceMs: config.reconnectGraceMs, roomIdleTtlMs: config.roomIdleTtlMs,
  nextGameIdentity: () => ({ gameId: gameIdSchema.parse(`game:browser-test:${++gameNumber}`), seed: 'NETWORK-GAME-TEST-0' }),
})
const httpServer = createFrontierHttpServer()
const realtimeServer = createRealtimeServer(httpServer, config, { roomService })
const shutdown = createGracefulShutdown({ httpServer, realtimeServer })
function stop(): void { roomService.dispose(); void shutdown().catch(() => { process.exitCode = 1 }) }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
httpServer.listen(config.port, () => { console.log(`Browser test server listening on port ${config.port}`) })
