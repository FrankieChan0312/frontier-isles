import { expect, test } from '@playwright/test'
import { expectOnlinePrivacy, expectOnlineViewport, expectSharedPublicState, finishOnlineSetup } from './online-helpers.ts'
import { openSeatingBrowsers } from './online-seating-helpers.ts'

for (const humans of [3, 4] as const) test(`${humans} Humans complete all setup placements and a normal turn in separate browsers`, async ({ browser }) => {
  const game = await openSeatingBrowsers(browser, humans)
  try {
    const host = game.observers[0]
    if (host === undefined) throw new Error('Missing Host observer.')
    await finishOnlineSetup(game.observers)
    await expectSharedPublicState(game.observers, 16)
    for (const [index, observer] of game.observers.entries()) {
      expect(observer.commands).toEqual(['PLACE_INITIAL_SETTLEMENT', 'PLACE_INITIAL_ROAD', 'PLACE_INITIAL_SETTLEMENT', 'PLACE_INITIAL_ROAD'])
      await expect(observer.page.locator('[data-layer="buildings"] [data-vertex-id]')).toHaveCount(8)
      await expect(observer.page.locator('[data-layer="roads"] [data-edge-id]')).toHaveCount(8)
      await expectOnlineViewport(observer.page)
      await expectOnlinePrivacy(observer, game.roomCode, ['NORTH', 'EAST', 'SOUTH', 'WEST'][index] ?? '')
    }
    await host.page.getByRole('button', { name: 'Roll dice' }).click()
    await expectSharedPublicState(game.observers, 17)
    await host.page.getByRole('button', { name: 'End turn' }).click()
    await expectSharedPublicState(game.observers, 18)
    expect(host.current().view.publicGame.turn.currentPlayerId).toBe(game.observers[1]?.current().view.self.id)
  } finally { await game.close() }
})
