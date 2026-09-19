import { expect, test, type Browser } from '@playwright/test'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import { RESOURCE_TYPES, type ResourceBag } from '@frontier-isles/game-core/model/resource'
import { GAME_COMMAND_TYPES } from '@frontier-isles/realtime-contracts'
import {
  ONLINE_CREDENTIAL_KEY, expectOnlinePrivacy, expectOnlineViewport, expectSharedPublicState,
  openOnlineBrowsers, type OnlineBrowsers, type OnlineObserver,
} from './online-helpers.ts'

const covered = new Set<GameCommand['type']>()
const baseJourneys: readonly GameCommand['type'][] = ['PLACE_INITIAL_SETTLEMENT', 'PLACE_INITIAL_ROAD', 'ROLL_DICE', 'END_TURN']
test.afterAll(() => {
  // Initial setup and ordinary turn controls have their separate natural-game journeys.
  expect([...covered].filter((type) => !baseJourneys.includes(type)).sort())
    .toEqual(GAME_COMMAND_TYPES.filter((type) => !baseJourneys.includes(type)).sort())
})

async function scenario(browser: Browser, name: string, action: (game: OnlineBrowsers) => Promise<void>): Promise<void> {
  const game = await openOnlineBrowsers(browser, `E2E_${name}`)
  try {
    await action(game)
    for (const observer of [game.host, game.joiner]) {
      for (const command of observer.commands) covered.add(command)
      expect(observer.errors).toEqual([])
    }
  } finally { await game.close() }
}

async function clickCommand(game: OnlineBrowsers, actor: OnlineObserver, button: string | RegExp): Promise<void> {
  const version = actor.current().view.stateVersion
  await actor.page.getByRole('button', { name: button, exact: typeof button === 'string' }).click()
  await expectSharedPublicState([game.host, game.joiner], version + 1)
}
async function boardCommand(game: OnlineBrowsers, actor: OnlineObserver, name: string | RegExp): Promise<void> {
  const version = actor.current().view.stateVersion
  await actor.page.getByRole('button', { name, exact: typeof name === 'string' }).first().press('Enter')
  await expectSharedPublicState([game.host, game.joiner], version + 1)
}
async function enterBag(observer: OnlineObserver, label: string, bag: ResourceBag): Promise<void> {
  for (const resource of RESOURCE_TYPES) {
    const name = resource[0] + resource.slice(1).toLowerCase()
    await observer.page.getByLabel(`${label} ${name}`, { exact: true }).fill(String(bag[resource]))
  }
}
const empty: ResourceBag = { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 }

async function humanOffer(game: OnlineBrowsers): Promise<void> {
  await game.host.page.getByRole('button', { name: 'Propose trade', exact: true }).click()
  await game.host.page.getByRole('combobox', { name: 'Trade with' }).click()
  await game.host.page.getByRole('option', { name: 'Grace Joiner' }).click()
  await enterBag(game.host, 'Player gives / You receive', { ...empty, BRICK: 1 })
  await enterBag(game.host, 'You give / Player receives', { ...empty, LUMBER: 1 })
  await clickCommand(game, game.host, 'Send offer')
  await expect(game.joiner.page.getByRole('dialog', { name: /Trade offer from/ })).toBeVisible()
  expect(game.joiner.current().view.self.id).not.toBe(game.joiner.current().view.publicGame.turn.currentPlayerId)
  await expect(game.joiner.page.locator('[aria-label="Action guidance"]')).toHaveText('Respond to the proposed trade.')
}

test('online paid builds, private purchase, maritime and Human/Human plus Human/AI negotiations', async ({ browser }) => {
  await scenario(browser, 'BUILD_TRADE', async (game) => {
    const { host, joiner } = game
    for (const edge of ['edge:vertex:-1,-1,2|vertex:1,-2,1', 'edge:vertex:1,-2,1|vertex:2,-1,-1']) {
      await host.page.getByRole('button', { name: 'Build road', exact: true }).click()
      await boardCommand(game, host, `Build road on ${edge}`)
    }
    await host.page.getByRole('button', { name: 'Build settlement', exact: true }).click()
    await boardCommand(game, host, 'Build on vertex:2,-1,-1')
    await host.page.getByRole('button', { name: 'Upgrade city', exact: true }).click()
    await boardCommand(game, host, 'Build on vertex:2,-1,-1')
    await clickCommand(game, host, 'Buy development')
    await expect(host.page.getByRole('article', { name: /Victory Point Development Card/ })).toBeVisible()
    await expect(joiner.page.getByRole('article', { name: /Development Card/ })).toHaveCount(0)
    expect(joiner.updates.flatMap((update) => update.events).some((event) => event.type === 'DEVELOPMENT_CARD_BOUGHT'
      && event.cardId === null && event.cardType === null)).toBe(true)

    await humanOffer(game)
    await clickCommand(game, joiner, 'Accept')
    await humanOffer(game)
    await clickCommand(game, joiner, 'Reject')
    await humanOffer(game)
    await joiner.page.getByRole('button', { name: 'Counter', exact: true }).click()
    await enterBag(joiner, 'Player gives / You receive', { ...empty, LUMBER: 2 })
    await enterBag(joiner, 'You give / Player receives', { ...empty, BRICK: 2 })
    await clickCommand(game, joiner, 'Send counter')
    await expect(host.page.getByRole('dialog')).toContainText('You give: 2 Lumber')
    await expect(host.page.getByRole('dialog')).toContainText('You receive: 2 Brick')
    await expect(host.page.getByRole('button', { name: 'Counter', exact: true })).toHaveCount(0)
    await clickCommand(game, host, 'Accept')

    await host.page.getByRole('button', { name: 'Propose trade', exact: true }).click()
    await host.page.getByRole('combobox', { name: 'Trade with' }).click()
    await host.page.getByRole('option', { name: 'BUILDER AI' }).click()
    await enterBag(host, 'AI gives / You receive', { ...empty, BRICK: 1 })
    await enterBag(host, 'You give / AI receives', { ...empty, ORE: 3 })
    const beforeTrades = host.updates.flatMap((update) => update.events).filter((event) => event.type === 'TRADE_COMPLETED').length
    await clickCommand(game, host, 'Send offer')
    await expect.poll(() => host.updates.flatMap((update) => update.events).filter((event) => event.type === 'TRADE_COMPLETED').length).toBe(beforeTrades + 1)

    await host.page.getByRole('button', { name: 'Maritime trade', exact: true }).click()
    await clickCommand(game, host, /^Give 4 Brick · receive 1 Lumber$/)
    await expectOnlinePrivacy(host, game.roomCode, 'NORTH')
    await expectOnlinePrivacy(joiner, game.roomCode, 'EAST')
    await joiner.page.setViewportSize({ width: 480, height: 800 })
    await expectOnlineViewport(joiner.page)
  })
})

test('online controlled seven gives each Human only their discard, then robber and theft controls', async ({ browser }) => {
  await scenario(browser, 'SEVEN', async (game) => {
    await clickCommand(game, game.host, 'Roll dice')
    for (const observer of [game.host, game.joiner]) await expect(observer.page.getByRole('dialog', { name: 'Discard 4 resources' })).toBeVisible()
    expect(game.joiner.current().view.self.id).not.toBe(game.joiner.current().view.publicGame.turn.currentPlayerId)
    await expect(game.joiner.page.locator('[aria-label="Action guidance"]')).toHaveText('Choose exactly 4 cards to discard.')
    await enterBag(game.host, 'Resources to discard', { ...empty, LUMBER: 4 })
    await clickCommand(game, game.host, 'Discard selected')
    await expect(game.host.page.getByRole('dialog')).toHaveCount(0)
    await enterBag(game.joiner, 'Resources to discard', { ...empty, BRICK: 4 })
    await clickCommand(game, game.joiner, 'Discard selected')
    await boardCommand(game, game.host, 'Move robber to tile:-2,2')
    await expect(game.host.page.getByRole('dialog', { name: 'Choose a player to steal from' })).toBeVisible()
    await expect(game.joiner.page.getByRole('dialog')).toHaveCount(0)
    await clickCommand(game, game.host, /^Grace Joiner · \d+ cards$/)
    expect(game.host.current().view.pendingDecision).toBeNull()
    expect(game.host.current().view.self.resources.BRICK).toBe(1)
    await expectOnlinePrivacy(game.host, game.roomCode, 'NORTH')
    await expectOnlinePrivacy(game.joiner, game.roomCode, 'EAST')
  })
})

for (const [fixtureName, cardLabel] of [['KNIGHT', 'Knight'], ['ROAD_BUILDING', 'Road Building'],
  ['INVENTION', 'Invention'], ['MONOPOLY', 'Monopoly'], ['FREE_ROAD_FINISH', 'Road Building']] as const) {
  test(`online ${fixtureName} resolves its private choices and public effects`, async ({ browser }) => {
    await scenario(browser, fixtureName, async (game) => {
      const { host, joiner } = game
      await expect(joiner.page.getByRole('article', { name: /Development Card/ })).toHaveCount(0)
      const resources = host.current().view.self.resources
      await clickCommand(game, host, `Play ${cardLabel}`)
      await expect(joiner.page.getByRole('dialog')).toHaveCount(0)
      if (fixtureName === 'KNIGHT') {
        expect(host.current().view.publicGame.awards.largestArmyHolderId).toBe(host.current().view.self.id)
        await boardCommand(game, host, 'Move robber to tile:-2,2')
        await clickCommand(game, host, /^Grace Joiner · \d+ cards$/)
      } else if (fixtureName === 'INVENTION') {
        await expect(host.page.getByRole('dialog', { name: 'Choose invention resources' })).toBeVisible()
        await clickCommand(game, host, '2 Ore')
        expect(host.current().view.self.resources.ORE).toBe(resources.ORE + 2)
      } else if (fixtureName === 'MONOPOLY') {
        await expect(host.page.getByRole('dialog', { name: 'Choose monopoly resource' })).toBeVisible()
        await clickCommand(game, host, 'Brick')
        expect(joiner.current().view.self.resources.BRICK).toBe(0)
      } else {
        await boardCommand(game, host, /^Build road on edge:/)
        if (fixtureName === 'FREE_ROAD_FINISH') await clickCommand(game, host, 'Finish road placement')
        else await boardCommand(game, host, /^Build road on edge:/)
        expect(host.current().view.self.resources).toEqual(resources)
      }
      expect(host.current().view.pendingDecision).toBeNull()
      expect(host.current().view.publicGame.turn.developmentCardPlayedThisTurn).toBe(true)
      await expectOnlinePrivacy(host, game.roomCode, 'NORTH')
      await expectOnlinePrivacy(joiner, game.roomCode, 'EAST')
    })
  })
}

for (const response of ['ACCEPT', 'REJECT'] as const) {
  test(`online AI initiates toward a Human and ${response.toLowerCase()}s their complete counter`, async ({ browser }) => {
    await scenario(browser, 'AI_TRADE', async (game) => {
      const { host, joiner } = game
      await expect(joiner.page.getByRole('dialog', { name: 'Trade offer from BUILDER AI' })).toBeVisible()
      await expect(host.page.getByRole('dialog')).toHaveCount(0)
      const pending = joiner.current().view.pendingDecision
      if (pending?.type !== 'RESPOND_TO_TRADE') throw new Error('Expected AI offer in Human private view.')
      await joiner.page.getByRole('button', { name: 'Counter', exact: true }).click()
      const ownTerms = Object.fromEntries(Object.entries(pending.offer.counterpartyGives)
        .map(([resource, count]) => [resource, count * (response === 'ACCEPT' ? 3 : 1)])) as ResourceBag
      await enterBag(joiner, 'You give / AI receives', ownTerms)
      await enterBag(joiner, 'AI gives / You receive', response === 'REJECT' ? { ...empty, WOOL: 19 } : pending.offer.initiatorGives)
      const requested = joiner.page.getByLabel('AI gives / You receive Wool', { exact: true })
      await expect(requested).not.toHaveAttribute('max')
      await clickCommand(game, joiner, 'Send counter')
      await expect.poll(() => joiner.updates.flatMap((update) => update.events).some((event) =>
        response === 'ACCEPT' ? event.type === 'TRADE_COMPLETED' && event.offer.parentTradeId === pending.offer.tradeId
          : event.type === 'TRADE_REJECTED' && event.rejectedById === pending.offer.initiatorId)).toBe(true)
      expect(joiner.updates.flatMap((update) => update.events).filter((event) => event.type === 'TRADE_COUNTERED')).toHaveLength(1)
    })
  })
}

test('online Longest Road updates public scores in both browsers', async ({ browser }) => {
  await scenario(browser, 'LONGEST_ROAD', async (game) => {
    await game.host.page.getByRole('button', { name: 'Build road', exact: true }).click()
    await boardCommand(game, game.host, 'Build road on edge:vertex:-1,-1,2|vertex:1,-2,1')
    for (const observer of [game.host, game.joiner]) {
      expect(observer.current().view.publicGame.awards.longestRoadHolderId).toBe(game.host.current().view.self.id)
      await expect(observer.page.getByText('Longest route', { exact: true })).toBeVisible()
    }
  })
})

test('online victory finishes the same game, resumes as finished and returns Home without an online save', async ({ browser }) => {
  await scenario(browser, 'VICTORY', async (game) => {
    const { host, joiner } = game
    await expect(host.page.getByRole('article', { name: /Victory Point Development Card/ })).toHaveCount(5)
    await expect(joiner.page.getByRole('article', { name: /Development Card/ })).toHaveCount(0)
    await host.page.getByRole('button', { name: 'Upgrade city', exact: true }).click()
    await boardCommand(game, host, /^Build on vertex:/)
    await expect(host.page.getByRole('dialog', { name: 'Victory!' })).toBeVisible()
    await expect(joiner.page.getByRole('dialog', { name: 'Game complete' })).toBeVisible()
    const gameId = host.current().gameId
    await joiner.page.reload()
    await expect(joiner.page.getByRole('dialog', { name: 'Game complete' })).toBeVisible()
    expect(joiner.current().gameId).toBe(gameId)
    expect(joiner.current().lifecycleStatus).toBe('FINISHED')
    await joiner.page.getByRole('button', { name: 'Start a new game' }).click()
    await expect(joiner.page.getByRole('button', { name: 'Create online Room' })).toBeVisible()
    expect(await joiner.page.evaluate((key) => sessionStorage.getItem(key) === null, ONLINE_CREDENTIAL_KEY)).toBe(true)
    expect(await joiner.page.evaluate(() => localStorage.getItem('frontier-isles:v1:latest-save') === null)).toBe(true)
    expect(host.current().gameId).toBe(gameId)
    await expect(host.page.getByRole('dialog', { name: 'Victory!' })).toBeVisible()
  })
})
