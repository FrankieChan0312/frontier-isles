import { expect, test, type Page } from '@playwright/test'
import { ONLINE_CREDENTIAL_KEY, duplicateBlankTab, expectOnlinePrivacy, expectSharedPublicState, observeOnline, openOnlineBrowsers } from './online-helpers.ts'

/** Test-owned transport interruption; no production debug API or browser game state. */
async function interruptible(page: Page): Promise<() => void> {
  let disconnect: (() => void) | null = null
  await page.routeWebSocket(/socket\.io/u, (socket) => {
    const server = socket.connectToServer()
    disconnect = () => { server.close(); socket.close() }
  })
  return () => { if (disconnect === null) throw new Error('Expected a connected test transport.'); disconnect() }
}
async function noOverflow(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
}

test('network loss pauses the current Human, then resumes the same pending setup within grace', async ({ browser }, testInfo) => {
  let disconnect: () => void = () => {}
  const game = await openOnlineBrowsers(browser, 'Ada Host', async (page) => { disconnect = await interruptible(page) })
  try {
    const before = game.host.current().view
    await game.host.page.context().setOffline(true)
    disconnect()
    await expect(game.joiner.page.getByRole('status', { name: 'Game presence' })).toContainText('Game paused')
    await expect(game.joiner.page.getByRole('status', { name: 'Action guidance' })).toContainText('Game paused.')
    await expect(game.joiner.page.getByText(/Choose a highlighted/)).toHaveCount(0)
    await expect(game.joiner.page.getByText(/Reconnect within \d+s/)).toBeVisible()
    expect(game.joiner.current().view.stateVersion).toBe(before.stateVersion)
    expect(game.joiner.current().aiThinking).toBe(false)
    await expect(game.joiner.page.getByRole('button', { name: /Replace .* with AI/ })).toHaveCount(0)
    await game.joiner.page.setViewportSize({ width: 480, height: 800 })
    await game.joiner.page.screenshot({ path: testInfo.outputPath('paused-480.png'), fullPage: true })
    await game.host.page.context().setOffline(false)
    await expect(game.host.page.getByRole('status', { name: 'Game presence' })).toContainText('Game active', { timeout: 10_000 })
    await expect(game.joiner.page.getByRole('status', { name: 'Game presence' })).toContainText('Game active')
    await expect(game.host.page.getByRole('status', { name: 'Action guidance' })).toContainText('Choose a highlighted vertex')
    await expect(game.joiner.page.getByRole('status', { name: 'Action guidance' })).toHaveText('Waiting for another player’s decision.')
    expect(game.host.current().view).toEqual(before)
    await game.host.page.getByRole('button', { name: /^Build on vertex:/ }).first().press('Enter')
    await expectSharedPublicState([game.host, game.joiner], 1)
    await expectOnlinePrivacy(game.host, game.roomCode, 'NORTH')
    expect(game.joiner.errors).toEqual([])
  } finally { await game.close() }
})

test('Host expiry transfers authority, shows replacement controls at every width, and denies the old Human after AI takeover', async ({ browser }, testInfo) => {
  let disconnect: () => void = () => {}
  const game = await openOnlineBrowsers(browser, 'Ada Host', async (page) => { disconnect = await interruptible(page) })
  try {
    const originalPlayerId = game.host.current().view.self.id
    await game.host.page.context().setOffline(true)
    disconnect()
    await expect(game.joiner.page.getByRole('status', { name: 'Game presence' })).toContainText('Game paused')
    await expect(game.joiner.page.getByRole('button', { name: 'Replace NORTH with AI' })).toHaveCount(0)
    await expect(game.joiner.page.getByRole('button', { name: 'Replace NORTH with AI' })).toBeVisible({ timeout: 40_000 })
    for (const [width, height] of [[1440, 900], [1024, 768], [480, 800]] as const) {
      await game.joiner.page.setViewportSize({ width, height })
      await expect(game.joiner.page.getByRole('combobox', { name: 'AI profile for NORTH' })).toBeVisible()
      await expect(game.joiner.page.getByRole('button', { name: 'Close Game' })).toBeVisible()
      await noOverflow(game.joiner.page)
      await game.joiner.page.screenshot({ path: testInfo.outputPath(`replacement-${width}.png`), fullPage: true })
    }
    expect(game.joiner.current().view.stateVersion).toBe(0)
    await game.joiner.page.getByRole('combobox', { name: 'AI profile for NORTH' }).click()
    await game.joiner.page.getByRole('option', { name: 'Sentinel' }).click()
    await game.joiner.page.getByRole('button', { name: 'Replace NORTH with AI' }).click()
    await expect(game.joiner.page.getByRole('status', { name: 'Game presence' })).toContainText('Game active')
    await expect.poll(() => game.joiner.current().view.stateVersion).toBe(2)
    expect(game.joiner.current().view.opponents.find((player) => player.id === originalPlayerId)?.controller).toEqual({ type: 'AI', profileId: 'SENTINEL' })
    await expect(game.joiner.page.getByText('NORTH is now controlled by Sentinel AI.')).toBeVisible()
    await game.host.page.context().setOffline(false)
    await expect(game.host.page.getByRole('alert')).toContainText('invalid or expired', { timeout: 10_000 })
    expect(await game.host.page.evaluate((key) => sessionStorage.getItem(key) === null, ONLINE_CREDENTIAL_KEY)).toBe(true)
    expect(game.joiner.current().view.stateVersion).toBe(2)
    await expectOnlinePrivacy(game.joiner, game.roomCode, 'EAST')
    expect(game.joiner.errors).toEqual([])
  } finally { await game.close() }
})

test('a newer Host tab stays paused until another Human resumes, and the old tab remains read-only', async ({ browser }) => {
  let disconnect: () => void = () => {}
  const game = await openOnlineBrowsers(browser, 'Ada Host', undefined, async (page) => { disconnect = await interruptible(page) })
  try {
    await game.joiner.page.context().setOffline(true)
    disconnect()
    await expect(game.host.page.getByRole('status', { name: 'Game presence' })).toContainText('Game paused')
    const before = game.host.current().view
    const replacement = observeOnline(await duplicateBlankTab(game.host.page))
    await replacement.page.goto('/')
    await expect(replacement.page.getByRole('status', { name: 'Game presence' })).toContainText('Game paused')
    await expect(game.host.page.getByRole('alert').filter({ hasText: 'continued in a newer tab' })).toBeVisible()
    expect(replacement.current().view).toEqual(before)
    await game.joiner.page.context().setOffline(false)
    await expect(replacement.page.getByRole('status', { name: 'Game presence' })).toContainText('Game active', { timeout: 10_000 })
    await replacement.page.getByRole('button', { name: /^Build on vertex:/ }).first().press('Enter')
    await expectSharedPublicState([replacement, game.joiner], 1)
    await expect(game.host.page.getByRole('button', { name: /^Build on vertex:/ })).toHaveCount(0)
    await expectOnlinePrivacy(replacement, game.roomCode, 'NORTH')
    expect(replacement.errors).toEqual([])
  } finally { await game.close() }
})

test('the connected Host closes a replacement-required game and returns Home with a public reason', async ({ browser }) => {
  let disconnect: () => void = () => {}
  const game = await openOnlineBrowsers(browser, 'Ada Host', undefined, async (page) => { disconnect = await interruptible(page) })
  try {
    await game.joiner.page.context().setOffline(true)
    disconnect()
    await expect(game.host.page.getByRole('status', { name: 'Game presence' })).toContainText('Game paused')
    await expect(game.host.page.getByRole('button', { name: 'Close Game' })).toBeVisible({ timeout: 40_000 })
    await game.host.page.getByRole('button', { name: 'Close Game' }).click()
    await expect(game.host.page.getByRole('alert')).toContainText('The Host closed the paused game.')
    expect(await game.host.page.evaluate((key) => sessionStorage.getItem(key) === null, ONLINE_CREDENTIAL_KEY)).toBe(true)
    await game.host.page.getByRole('button', { name: 'Return Home' }).click()
    await expect(game.host.page.getByRole('button', { name: 'Create online Room' })).toBeVisible()
    expect(game.host.errors).toEqual([])
  } finally { await game.close() }
})
