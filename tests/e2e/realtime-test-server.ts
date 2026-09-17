/** Test process composition only. Production has no fixture route or seed override. */
import { gameIdSchema } from '@frontier-isles/realtime-contracts'
import { parseServerConfig } from '../../server/src/config.ts'
import { createFrontierHttpServer } from '../../server/src/create-http-server.ts'
import { createRealtimeServer } from '../../server/src/create-realtime-server.ts'
import { createGracefulShutdown } from '../../server/src/graceful-shutdown.ts'
import { InMemoryRoomService } from '../../server/src/lobby/room-service.ts'
import { createOnlineGame } from '@frontier-isles/game-core/engine/create-game'
import { WORKFLOW_SCENARIOS, workflowFixture } from '../../server/test/online-workflow-fixtures.ts'

const config = parseServerConfig(process.env)
if (config.nodeEnv !== 'test') throw new Error('The browser test server requires NODE_ENV=test.')
let gameNumber = 0
const roomService = await InMemoryRoomService.open({
  reconnectGraceMs: config.reconnectGraceMs, roomIdleTtlMs: config.roomIdleTtlMs,
  nextGameIdentity: () => ({ gameId: gameIdSchema.parse(`game:browser-test:${++gameNumber}`), seed: 'NETWORK-GAME-TEST-0' }),
  gameDependencies: { createState: (gameConfig, seed) => {
    // Only this separate test executable recognizes the fixture names. No endpoint or
    // production environment switch can install fixtures, and none enter the browser.
    const scenario = WORKFLOW_SCENARIOS.find((candidate) => gameConfig.players[0].name === `E2E_${candidate}`)
    return scenario === undefined ? createOnlineGame(gameConfig, seed) : workflowFixture(scenario, gameConfig)
  } },
})
const httpServer = createFrontierHttpServer()
const realtimeServer = createRealtimeServer(httpServer, config, { roomService })
const shutdown = createGracefulShutdown({ httpServer, realtimeServer })
function stop(): void { roomService.dispose(); void shutdown().catch(() => { process.exitCode = 1 }) }
process.once('SIGINT', stop)
process.once('SIGTERM', stop)
httpServer.listen(config.port, '127.0.0.1', () => { console.log(`Browser test server listening on port ${config.port}`) })
