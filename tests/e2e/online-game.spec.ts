import { expect, test } from '@playwright/test'
import { gameCommandRequestSchema } from '@frontier-isles/realtime-contracts'
import {
  ONLINE_CREDENTIAL_KEY, expectOnlinePrivacy, expectOnlineViewport, expectSharedPublicState,
  finishOnlineSetup, observeOnline, openOnlineBrowsers,
} from './online-helpers.ts'

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

    // Copy only the accepted sessionStorage credential to reproduce a duplicated tab.
    const credential = await joiner.page.evaluate((key) => sessionStorage.getItem(key), ONLINE_CREDENTIAL_KEY)
    if (credential === null) throw new Error('Missing active Room session credential.')
    const context = game.contexts[1]
    if (context === undefined) throw new Error('Missing second browser context.')
    const replacement = observeOnline(await context.newPage())
    await replacement.page.goto('/')
    await replacement.page.evaluate(({ key, value }) => sessionStorage.setItem(key, value), { key: ONLINE_CREDENTIAL_KEY, value: credential })
    await replacement.page.reload()
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
