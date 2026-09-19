import { expect, test, type Locator } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import { gameCommandRequestSchema } from '@frontier-isles/realtime-contracts'
import {
  duplicateBlankTab, expectOnlinePrivacy, expectOnlineViewport, expectSharedPublicState,
  finishOnlineSetup, observeOnline, openOnlineBrowsers,
} from './online-helpers.ts'

function contrast(first: readonly number[], second: readonly number[]): number {
  const luminance = (rgb: readonly number[]): number => rgb.reduce((sum, channel, index) => {
    const value = channel / 255
    return sum + (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4) * ([0.2126, 0.7152, 0.0722][index] ?? 0)
  }, 0)
  const a = luminance(first), b = luminance(second)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

async function focusedColors(target: Locator): Promise<{ readonly dark: number[]; readonly light: number[]; readonly surfaces: string[] }> {
  await expect(target).toBeFocused()
  const result = await target.evaluate((element) => {
    const style = getComputedStyle(element)
    const rectangle = element.getBoundingClientRect()
    const extent = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset)
    const ring = { left: rectangle.left - extent, right: rectangle.right + extent, top: rectangle.top - extent, bottom: rectangle.bottom + extent }
    let unclipped = ring.left >= 0 && ring.right <= innerWidth && ring.top >= 0 && ring.bottom <= innerHeight
    for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
      const parentStyle = getComputedStyle(parent), bounds = parent.getBoundingClientRect()
      if (parentStyle.overflowX !== 'visible') unclipped &&= ring.left >= bounds.left && ring.right <= bounds.right
      if (parentStyle.overflowY !== 'visible') unclipped &&= ring.top >= bounds.top && ring.bottom <= bounds.bottom
    }
    const header = document.querySelector('header'), paper = document.querySelector('[aria-labelledby="actions-title"]')
    if (header === null || paper === null) throw new Error('Missing tested surfaces.')
    return { visible: element.matches(':focus-visible'), outline: style.outlineColor, shadow: style.boxShadow, unclipped,
      surfaces: [getComputedStyle(paper).backgroundColor, getComputedStyle(document.body).backgroundColor,
        ...(getComputedStyle(header).backgroundImage.match(/rgb\([^)]+\)/g) ?? [])] }
  })
  expect(result.visible).toBe(true)
  expect(result.unclipped).toBe(true)
  expect(result.shadow).toContain('rgb(255, 253, 248)')
  const rgb = (value: string): number[] => {
    const color = value.match(/rgb\(([^)]+)\)/)?.[1]?.split(',').map(Number)
    if (color?.length !== 3) throw new Error('Expected an opaque rendered focus color.')
    return color
  }
  const dark = rgb(result.outline), light = rgb(result.shadow)
  expect(result.surfaces).toHaveLength(4)
  // Sample the rendered gradient between both computed endpoints, not a guessed solid header.
  const start = rgb(result.surfaces[2] ?? ''), end = rgb(result.surfaces[3] ?? '')
  const surfaces = [...result.surfaces.map(rgb), ...Array.from({ length: 101 }, (_, step) => start.map((channel, index) => channel + ((end[index] ?? channel) - channel) * step / 100))]
  for (const surface of surfaces) expect(Math.max(contrast(dark, surface), contrast(light, surface))).toBeGreaterThanOrEqual(3)
  expect(contrast(dark, light)).toBeGreaterThanOrEqual(3)
  return { dark, light, surfaces: result.surfaces }
}

test('primary actions start in view and keyboard focus remains clear across responsive surfaces', async ({ browser }, testInfo) => {
  const game = await openOnlineBrowsers(browser)
  const { host, joiner } = game
  try {
    await expect(host.page.getByRole('status', { name: 'Action guidance' })).toContainText('Choose a highlighted vertex')
    await expect(joiner.page.getByRole('status', { name: 'Action guidance' })).toHaveText('Waiting for another player’s decision.')
    await expect(joiner.page.getByText(/Choose a highlighted/)).toHaveCount(0)
    const resync = host.page.getByRole('button', { name: 'Resync game' })
    await resync.focus()
    await host.page.keyboard.press('Tab')
    const target = host.page.getByRole('button', { name: /^Build on vertex:/ }).first()
    await expect(target).toBeFocused()
    await host.page.keyboard.press('Enter')
    await expectSharedPublicState([host, joiner], 1)
    await finishOnlineSetup([host, joiner])
    await expectSharedPublicState([host, joiner], 16)
    const measurements = []
    for (const [width, height] of [[1440, 900], [1024, 768], [480, 800]] as const) {
      await host.page.setViewportSize({ width, height })
      await host.page.evaluate(() => { window.scrollTo(0, 0) })
      const roll = host.page.getByRole('button', { name: 'Roll dice', exact: true })
      await expect(roll).toBeEnabled()
      // Read geometry and hit testing before any focus/click/press can scroll the action into view.
      const bounds = await roll.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return { x: box.x, y: box.y, width: box.width, height: box.height, scrollY,
          unobscured: [[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]].every(([x = 0, y = 0]) => element.contains(document.elementFromPoint(box.x + box.width * x, box.y + box.height * y))) }
      })
      const guidance = await host.page.getByRole('status', { name: 'Action guidance' }).boundingBox()
      if (guidance === null) throw new Error('Missing action guidance.')
      expect(bounds.scrollY).toBe(0)
      expect(bounds.y).toBeGreaterThanOrEqual(0)
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(height)
      expect(guidance.y).toBeGreaterThanOrEqual(0)
      expect(guidance.y + guidance.height).toBeLessThanOrEqual(height)
      expect(bounds.unobscured).toBe(true)
      await expect(host.page.getByRole('region', { name: 'Actions' })).toHaveCount(1)
      await expectOnlineViewport(host.page)
      const board = await host.page.getByRole('img', { name: /Frontier Isles game board/ }).boundingBox()
      expect(board?.width).toBeGreaterThan(width === 480 ? 350 : 600)
      expect(board?.height).toBeGreaterThan(400)
      expect(await host.page.locator('h2').first().innerText()).toBe('Actions')
      expect(await host.page.locator('[tabindex]').evaluateAll((elements) => elements.every((element) => Number(element.getAttribute('tabindex')) <= 0))).toBe(true)
      await host.page.screenshot({ path: testInfo.outputPath(`roll-required-${width}.png`), fullPage: true })
      measurements.push({ width, height, bounds, guidance, board })
      await resync.focus()
      await host.page.keyboard.press('Tab')
      await expect(roll).toBeFocused()
      const actionColors = await focusedColors(roll)
      await host.page.screenshot({ path: testInfo.outputPath(`focus-paper-${width}.png`) })
      await host.page.keyboard.press('Shift+Tab')
      const headerColors = await focusedColors(resync)
      await host.page.screenshot({ path: testInfo.outputPath(`focus-header-${width}.png`) })
      const focusPath = testInfo.outputPath(`focus-${width}.json`)
      await writeFile(focusPath, JSON.stringify({ actionColors, headerColors,
        ratios: actionColors.surfaces.map((surface) => ({ surface,
          dark: contrast(actionColors.dark, surface.match(/\d+/g)?.map(Number) ?? []),
          light: contrast(actionColors.light, surface.match(/\d+/g)?.map(Number) ?? []) })) }, null, 2))
      await testInfo.attach(`focus-${width}`, { path: focusPath, contentType: 'application/json' })
    }
    const measurementsPath = testInfo.outputPath('primary-action-measurements.json')
    await writeFile(measurementsPath, JSON.stringify(measurements, null, 2))
    await testInfo.attach('primary-action-measurements', { path: measurementsPath, contentType: 'application/json' })
    await host.page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await resync.evaluate((element) => parseFloat(getComputedStyle(element).transitionDuration))).toBeLessThanOrEqual(0.00001)
    await expectOnlinePrivacy(host, game.roomCode, 'NORTH')
    await expectOnlinePrivacy(joiner, game.roomCode, 'EAST')
  } finally { await game.close() }
})

test('a stale browser action is rejected, resynchronized, and can be submitted again from the current view', async ({ browser }) => {
  let injectedStaleVersion = false
  const game = await openOnlineBrowsers(browser, 'Ada Host', async (page) => {
    await page.routeWebSocket(/socket\.io/u, (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string' && !injectedStaleVersion) {
          const match = /^(42\d*)(\[.*)$/su.exec(message)
          if (match?.[1] !== undefined && match[2] !== undefined) {
            const packet: unknown = JSON.parse(match[2])
            if (Array.isArray(packet) && packet[0] === 'game:command') {
              const parsed = gameCommandRequestSchema.safeParse(packet[1])
              if (parsed.success && parsed.data.command.type === 'PLACE_INITIAL_ROAD') {
                injectedStaleVersion = true
                server.send(`${match[1]}${JSON.stringify(['game:command', { ...parsed.data, expectedStateVersion: 0 }])}`)
                return
              }
            }
          }
        }
        server.send(message)
      })
    })
  })
  try {
    await game.host.page.getByRole('button', { name: /^Build on vertex:/ }).first().press('Enter')
    await expectSharedPublicState([game.host, game.joiner], 1)
    await game.host.page.getByRole('button', { name: /^Build road on edge:/ }).first().press('Enter')
    await expect(game.host.page.getByRole('alert').filter({ hasText: /changed|updated|stale/i })).toBeVisible()
    expect(injectedStaleVersion).toBe(true)
    expect(game.host.current().view.stateVersion).toBe(1)
    await expect(game.joiner.page.locator('[data-layer="roads"] [data-edge-id]')).toHaveCount(0)
    await game.host.page.getByRole('button', { name: /^Build road on edge:/ }).first().press('Enter')
    await expectSharedPublicState([game.host, game.joiner], 2)
    await expect(game.joiner.page.locator('[data-layer="roads"] [data-edge-id]')).toHaveCount(1)
    expect(game.host.errors).toEqual([])
    expect(game.joiner.errors).toEqual([])
  } finally { await game.close() }
})

test('two Humans share server setup and normal turns, private hands, responsive UI, refresh and tab replacement', async ({ browser }) => {
  const game = await openOnlineBrowsers(browser)
  const { host, joiner } = game
  try {
    await expectSharedPublicState([host, joiner])
    expect(host.current().view.self.id).not.toBe(joiner.current().view.self.id)
    await expect(joiner.page.getByText('Waiting for another player’s decision.')).toBeVisible()
    await expectOnlineViewport(host.page)
    await expectOnlineViewport(joiner.page)
    await finishOnlineSetup([host, joiner])
    await expectSharedPublicState([host, joiner], 16)
    expect(host.commands).toEqual(['PLACE_INITIAL_SETTLEMENT', 'PLACE_INITIAL_ROAD', 'PLACE_INITIAL_SETTLEMENT', 'PLACE_INITIAL_ROAD'])
    expect(joiner.commands).toEqual(host.commands)
    await expect(host.page.locator('[data-layer="buildings"] [data-vertex-id]')).toHaveCount(8)
    await expect(joiner.page.locator('[data-layer="roads"] [data-edge-id]')).toHaveCount(8)

    await host.page.getByRole('button', { name: 'Roll dice' }).click()
    await expectSharedPublicState([host, joiner], 17)
    await expect(host.page.getByRole('button', { name: 'End turn' })).toBeEnabled()
    await host.page.getByRole('button', { name: 'End turn' }).click()
    await expectSharedPublicState([host, joiner], 18)
    await joiner.page.getByRole('button', { name: 'Roll dice' }).click()
    await expectSharedPublicState([host, joiner], 19)
    await expect(joiner.page.getByRole('button', { name: 'End turn' })).toBeEnabled()
    expect(host.current().view.publicGame.turn.currentPlayerId).toBe(joiner.current().view.self.id)
    await expectOnlinePrivacy(host, game.roomCode, 'NORTH')
    await expectOnlinePrivacy(joiner, game.roomCode, 'EAST')
    await joiner.page.setViewportSize({ width: 480, height: 800 })
    await expectOnlineViewport(joiner.page)

    const seatId = joiner.current().view.self.id
    const version = joiner.current().view.stateVersion
    const publications = joiner.updates.length
    await joiner.page.reload()
    await expect(joiner.page.getByText(/Online Multiplayer · Room/)).toBeVisible()
    await expect.poll(() => joiner.updates.length).toBeGreaterThan(publications)
    expect(joiner.current().view.self.id).toBe(seatId)
    await expectSharedPublicState([host, joiner], version)
    await joiner.page.getByRole('button', { name: 'Resync game' }).click()
    await expect(joiner.page.getByRole('button', { name: 'End turn' })).toBeEnabled()

    const replacement = observeOnline(await duplicateBlankTab(joiner.page))
    await replacement.page.goto('/')
    await expect(replacement.page.getByText(/Online Multiplayer · Room/)).toBeVisible()
    await expect(joiner.page.getByRole('alert').filter({ hasText: 'continued in a newer tab' })).toBeVisible()
    await expect(joiner.page.getByRole('button', { name: 'End turn' })).toBeDisabled()
    await expect(replacement.page.getByRole('button', { name: 'End turn' })).toBeEnabled()
    await expectSharedPublicState([host, replacement], version)
    await expectOnlinePrivacy(replacement, game.roomCode, 'EAST')
    expect(host.errors).toEqual([])
    expect(joiner.errors).toEqual([])
  } finally { await game.close() }
})
