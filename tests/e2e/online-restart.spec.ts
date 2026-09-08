import { resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { expect, test } from '@playwright/test'
import { startProductionProcess, type TestServerProcess } from '../../server/test/production-process-helpers.ts'
import { temporaryPersistenceDirectory } from '../../server/test/persistence-test-helpers.ts'
import { SqliteMultiplayerRepository } from '../../server/src/persistence/sqlite-multiplayer-repository.ts'
import { GameSession } from '../../server/src/game/game-session.ts'
import { workflowFixture } from '../../server/test/online-workflow-fixtures.ts'
import { requireValue } from '../../server/test/game-test-helpers.ts'
import { gameIdSchema } from '@frontier-isles/realtime-contracts'
import { canonicalJson } from '../../server/src/persistence/canonical-json.ts'
import { expectOnlinePrivacy, expectSharedPublicState } from './online-helpers.ts'
import { openSeatingBrowsers } from './online-seating-helpers.ts'

for (const scenario of ['SEVEN', 'KNIGHT', 'BUILD_TRADE'] as const) test(`production browser restart preserves the exact ${scenario} pending decision and isolates corrupt storage`, async ({ browser }) => {
  const directory = temporaryPersistenceDirectory()
  let process: TestServerProcess | undefined
  let closeBrowsers: (() => Promise<void>) | undefined
  try {
    process = await startProductionProcess(directory.database, { staticRoot: resolve('dist') })
    const url = process.baseUrl
    const options = { staticRoot: resolve('dist'), port: Number(new URL(url).port) }
    const game = await openSeatingBrowsers(browser, 4, url)
    closeBrowsers = game.close
    const host = requireValue(game.observers[0]); const east = requireValue(game.observers[1])
    await process.crash()
    // Test-owned offline fixture installation. The production process accepts only its normal
    // private persistence format and has no fixture route, flag, or client-state injection.
    const repository = new SqliteMultiplayerRepository(directory.database)
    const record = requireValue(repository.load()[0]); const saved = requireValue(record.game)
    const fixture = new GameSession(record.roomCode, gameIdSchema.parse(saved.state.gameId), saved.originalSeats, 'BROWSER_RECOVERY',
      { createState: (config) => workflowFixture(scenario, config) })
    repository.save({ ...record, game: fixture.exportPersistence() })
    fixture.close(); repository.close()
    process = await startProductionProcess(directory.database, options)
    for (const observer of game.observers) await observer.page.reload()
    await expectSharedPublicState(game.observers, 16)
    for (const observer of game.observers) await expect(observer.page.getByRole('status', { name: 'Game presence' })).toContainText('Game active')
    if (scenario === 'SEVEN') await host.page.getByRole('button', { name: 'Roll dice' }).click()
    else if (scenario === 'KNIGHT') await host.page.getByRole('button', { name: 'Play Knight', exact: true }).click()
    else {
      await host.page.getByRole('button', { name: 'Propose trade', exact: true }).click()
      await host.page.getByRole('combobox', { name: 'Trade with' }).click()
      await host.page.getByRole('option', { name: 'Seated Human 2' }).click()
      await host.page.getByLabel('Player gives / You receive Brick', { exact: true }).fill('1')
      await host.page.getByLabel('You give / Player receives Lumber', { exact: true }).fill('1')
      await host.page.getByRole('button', { name: 'Send offer' }).click()
    }
    await expect.poll(() => game.observers.some((observer) => observer.current().view.pendingDecision !== null)).toBe(true)
    await expectSharedPublicState(game.observers)
    const before = game.observers.map((observer) => observer.current().view)
    await process.crash()
    const inspect = new SqliteMultiplayerRepository(directory.database)
    const authoritative = requireValue(inspect.load()[0]).game?.state
    inspect.close()
    const corrupt = new DatabaseSync(directory.database)
    corrupt.prepare('INSERT INTO rooms VALUES (?,?,?)').run('BAD234', '{truncated', '0'.repeat(64)); corrupt.close()
    process = await startProductionProcess(directory.database, options)
    for (const observer of game.observers) await observer.page.reload()
    for (const [index, observer] of game.observers.entries()) {
      await expect(observer.page.getByRole('status', { name: 'Game presence', includeHidden: true })).toContainText('Game active')
      expect(canonicalJson(observer.current().view) === canonicalJson(before[index])).toBe(true)
      await expectOnlinePrivacy(observer, game.roomCode, ['NORTH', 'EAST', 'SOUTH', 'WEST'][index] ?? '')
    }
    expect(process.output().includes('PERSISTENCE_QUARANTINED')).toBe(true)
    expect(process.output().includes(directory.database)).toBe(false)
    // Stop once more to compare exact private state/RNG without exposing either in reports.
    await process.crash()
    const verify = new SqliteMultiplayerRepository(directory.database)
    expect(canonicalJson(requireValue(verify.load()[0]).game?.state) === canonicalJson(authoritative)).toBe(true)
    expect(verify.load()).toHaveLength(1); verify.close()
    process = await startProductionProcess(directory.database, options)
    for (const observer of game.observers) await observer.page.reload()
    for (const observer of game.observers) await expect(observer.page.getByRole('status', { name: 'Game presence', includeHidden: true })).toContainText('Game active')
    const version = host.current().view.stateVersion
    if (scenario === 'BUILD_TRADE') await east.page.getByRole('button', { name: 'Reject', exact: true }).click()
    else if (scenario === 'KNIGHT') await host.page.getByRole('button', { name: /^Move robber to/ }).first().press('Enter')
    else {
      const actor = requireValue(game.observers.find((observer) => (observer.current().view.legalActions.requiredDiscardCount ?? 0) > 0))
      let remaining = actor.current().view.legalActions.requiredDiscardCount ?? 0
      for (const [resource, count] of Object.entries(actor.current().view.self.resources)) {
        const take = Math.min(count, remaining); remaining -= take
        await actor.page.getByLabel(`Resources to discard ${resource[0]}${resource.slice(1).toLowerCase()}`, { exact: true }).fill(String(take))
      }
      await actor.page.getByRole('button', { name: 'Discard selected' }).click()
    }
    await expectSharedPublicState(game.observers, version + 1)
  } finally { await closeBrowsers?.(); await process?.crash(); directory.remove() }
})
