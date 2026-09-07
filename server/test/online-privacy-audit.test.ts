import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gameCommandAcknowledgementSchema, gameCommandRequestSchema, REALTIME_PROTOCOL_VERSION } from '@frontier-isles/realtime-contracts'
import { networkGame, networkSnapshot, startNetworkGame, type NetworkGame } from './game-network-helpers.js'
import { requireValue } from './game-test-helpers.js'
import { workflowFixture } from './online-workflow-fixtures.js'

const games: NetworkGame[] = []
afterEach(async () => { for (const game of games.splice(0)) await game.close(); vi.restoreAllMocks() })
const root = resolve(import.meta.dirname, '../..')
function source(path: string): string { return readFileSync(resolve(root, path), 'utf8') }
function imports(path: string): readonly string[] {
  const file = ts.createSourceFile(path, source(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  return file.statements.flatMap((statement) => ts.isImportDeclaration(statement)
    && ts.isStringLiteral(statement.moduleSpecifier) ? [statement.moduleSpecifier.text] : [])
}
function uiFiles(directory: string): readonly string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
    ? uiFiles(`${directory}/${entry.name}`)
    : entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [`${directory}/${entry.name}`] : [])
}

describe('online hidden-information and authority audit', () => {
  it('keeps transport/authority out of React and engine/AI/persistence out of the online gateway', () => {
    for (const path of [...uiFiles('src/ui'), 'src/app/app.tsx']) {
      expect(imports(path).some((name) => /socket\.io|local-game-gateway|game-core\/engine|game-ai/u.test(name))).toBe(false)
      expect(source(path)).not.toMatch(/\bGameState\b/u)
    }
    const gatewayImports = imports('src/application/gateways/socket-game-gateway.ts')
    expect(gatewayImports.some((name) => /game-core\/engine|game-ai|persistence|local-game-gateway/u.test(name))).toBe(false)
    expect(source('src/application/gateways/socket-game-gateway.ts')).not.toMatch(/localStorage|sessionStorage|\bGameState\b/u)
    for (const path of ['server/src/server.ts', 'server/src/create-realtime-server.ts', 'server/src/game/game-session.ts']) {
      expect(imports(path).some((name) => /test|fixture|online-workflow/u.test(name))).toBe(false)
    }
  })

  it('rejects poisoned actor data without echoing it, publishing private state, or logging input', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const network = await networkGame(3, { createState: (config) => workflowFixture('BUILD_TRADE', config) })
    games.push(network)
    await startNetworkGame(network)
    const update = await networkSnapshot(network, requireValue(network.clients[0]))
    const poisoned = { ...gameCommandRequestSchema.parse({ protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: update.roomCode, gameId: update.gameId,
      commandId: 'human:audit:poison', expectedStateVersion: update.view.stateVersion,
      command: { type: 'BUY_DEVELOPMENT_CARD' } }), actorId: 'AUDIT_PRIVATE_ACTOR_INPUT' }
    const ack = gameCommandAcknowledgementSchema.parse(await requireValue(network.clients[0]).timeout(5_000).emitWithAck('game:command', poisoned))
    expect(ack.ok).toBe(false)
    expect(JSON.stringify(ack)).not.toContain('AUDIT_PRIVATE_ACTOR_INPUT')
    const gameFields = /resumeToken|sessionId|tokenDigest|"random"|"developmentDeck"|commandCache|AUDIT_PRIVATE_ACTOR_INPUT/u
    expect(gameFields.test(JSON.stringify(network.snapshot()))).toBe(false)
    for (const updates of network.updates) {
      expect(updates.length).toBeGreaterThan(0)
      expect(gameFields.test(JSON.stringify(updates))).toBe(false)
      for (const publication of updates) expect(publication.view.opponents.every((player) => !('resources' in player) && !('developmentCards' in player))).toBe(true)
    }
    expect(log.mock.calls).toEqual([])
    expect(error.mock.calls).toEqual([])
    expect(warn.mock.calls).toEqual([])
  })

  it('exposes only a safe lifecycle when the server AI fails with secret diagnostic content', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const network = await networkGame(2, { createState: (config) => workflowFixture('AI_TRADE', config),
      aiAgent: { chooseNextCommand: async () => { throw new Error('AUDIT_SECRET_RNG_AND_DECK') } } })
    games.push(network)
    await startNetworkGame(network)
    for (const client of network.clients) {
      const update = await networkSnapshot(network, client)
      expect(update.lifecycleStatus).toBe('ERROR')
      expect(JSON.stringify(update)).not.toMatch(/AUDIT_SECRET|stack|tokenDigest|resumeToken/u)
    }
    expect(log.mock.calls).toEqual([])
    expect(error.mock.calls).toEqual([])
  })
})
