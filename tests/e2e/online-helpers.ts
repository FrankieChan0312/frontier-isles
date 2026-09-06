import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { gameCommandRequestSchema, gameUpdateSchema, type GameUpdate } from '@frontier-isles/realtime-contracts'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'

export const ONLINE_CREDENTIAL_KEY = 'frontier-isles:realtime-session:v1'
export interface OnlineObserver {
  readonly page: Page
  readonly errors: string[]
  readonly commands: GameCommand['type'][]
  readonly updates: GameUpdate[]
  readonly current: () => GameUpdate
}
export interface OnlineBrowsers {
  readonly host: OnlineObserver
  readonly joiner: OnlineObserver
  readonly contexts: readonly BrowserContext[]
  readonly roomCode: string
  readonly close: () => Promise<void>
}

/** Observe only game messages. Never record raw credential/session frames in test traces. */
export function observeOnline(page: Page): OnlineObserver {
  const errors: string[] = []
  const updates: GameUpdate[] = []
  const commands: GameCommand['type'][] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('pageerror', () => errors.push('Uncaught browser error'))
  page.on('websocket', (socket) => {
    socket.on('framereceived', ({ payload }) => {
      if (typeof payload !== 'string') return
      const match = /^42\d*(\[.*)$/su.exec(payload)
      if (match?.[1] === undefined) return
      const packet: unknown = JSON.parse(match[1])
      if (!Array.isArray(packet) || packet[0] !== 'game:update') return
      const parsed = gameUpdateSchema.safeParse(packet[1])
      if (!parsed.success) { errors.push('Invalid or non-redacted game update'); return }
      updates.push(parsed.data)
    })
    socket.on('framesent', ({ payload }) => {
      if (typeof payload !== 'string') return
      const match = /^42\d*(\[.*)$/su.exec(payload)
      if (match?.[1] === undefined) return
      const packet: unknown = JSON.parse(match[1])
      if (!Array.isArray(packet) || packet[0] !== 'game:command') return
      const parsed = gameCommandRequestSchema.safeParse(packet[1])
      if (!parsed.success) { errors.push('Invalid command or trusted client actor'); return }
      commands.push(parsed.data.command.type)
    })
  })
  return { page, errors, updates, commands, current: () => {
    const update = updates.at(-1)
    if (update === undefined) throw new Error('No viewer-specific game publication received.')
    return update
  } }
}

export async function openOnlineBrowsers(browser: Browser, hostName = 'Ada Host', beforeHostConnect?: (page: Page) => Promise<void>): Promise<OnlineBrowsers> {
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const joinerContext = await browser.newContext({ viewport: { width: 1024, height: 768 } })
  const host = observeOnline(await hostContext.newPage())
  const joiner = observeOnline(await joinerContext.newPage())
  await beforeHostConnect?.(host.page)
  await host.page.goto('/')
  await host.page.getByLabel('Your name').fill(hostName)
  await host.page.getByRole('button', { name: 'Create online Room' }).click()
  const code = host.page.getByTestId('room-code')
  await expect(code).toBeVisible()
  const roomCode = await code.innerText()
  await joiner.page.goto('/')
  await joiner.page.getByLabel('Your name').fill('Grace Joiner')
  await joiner.page.getByLabel('Room code').fill(roomCode)
  await joiner.page.getByRole('button', { name: 'Join online Room' }).click()
  await expect(joiner.page.getByTestId('room-code')).toHaveText(roomCode)
  for (const [seat, profile] of [['SOUTH', 'BUILDER'], ['WEST', 'MERCHANT']] as const) {
    await host.page.getByLabel(`AI profile for ${seat}`).click()
    await host.page.getByRole('option', { name: profile }).click()
    await expect(joiner.page.getByTestId(`seat-${seat}`)).toContainText('AI')
  }
  await joiner.page.getByRole('switch', { name: 'I am Ready' }).click()
  await expect(host.page.getByTestId('seat-EAST')).toContainText('Ready')
  await host.page.getByRole('switch', { name: 'I am Ready' }).click()
  await expect(host.page.getByRole('button', { name: 'Start Game' })).toBeEnabled()
  await expect(joiner.page.getByRole('button', { name: 'Start Game' })).toBeDisabled()
  await host.page.getByRole('button', { name: 'Start Game' }).click()
  for (const observer of [host, joiner]) {
    await expect(observer.page.getByText(/Online Multiplayer · Room/)).toBeVisible()
    await expect.poll(() => observer.updates.length).toBeGreaterThan(0)
  }
  return { host, joiner, roomCode, contexts: [hostContext, joinerContext],
    close: async () => { await hostContext.close(); await joinerContext.close() } }
}

export async function expectSharedPublicState(observers: readonly OnlineObserver[], minimumVersion = 0): Promise<void> {
  await expect.poll(() => {
    const first = observers[0]?.updates.at(-1)
    return first !== undefined && first.view.stateVersion >= minimumVersion && observers.every((observer) => {
      const update = observer.updates.at(-1)
      return update !== undefined && JSON.stringify(update.view.publicGame) === JSON.stringify(first.view.publicGame)
    })
  }, { message: 'Every browser must receive the same authoritative public version' }).toBe(true)
}

export async function finishOnlineSetup(observers: readonly OnlineObserver[]): Promise<void> {
  for (let step = 0; step < 16; step += 1) {
    await expect.poll(() => observers.some((observer) => {
      const view = observer.current().view
      return view.stateVersion >= 16 || (view.legalActions.legalInitialSettlementVertexIds?.length ?? 0) > 0
        || (view.legalActions.legalInitialRoadEdgeIds?.length ?? 0) > 0
    })).toBe(true)
    if (observers.every((observer) => observer.current().view.stateVersion >= 16)) return
    const actor = observers.find((observer) => (observer.current().view.legalActions.legalInitialSettlementVertexIds?.length ?? 0) > 0
      || (observer.current().view.legalActions.legalInitialRoadEdgeIds?.length ?? 0) > 0)
    if (actor === undefined) { await expectSharedPublicState(observers, 16); return }
    const view = actor.current().view
    const settlement = (view.legalActions.legalInitialSettlementVertexIds?.length ?? 0) > 0
    await actor.page.getByRole('button', { name: settlement ? /^Build on vertex:/ : /^Build road on edge:/ }).first().press('Enter')
    await expectSharedPublicState(observers, view.stateVersion + 1)
  }
  throw new Error('Initial setup exceeded its sixteen-command bound.')
}

export async function expectOnlinePrivacy(observer: OnlineObserver, roomCode: string, seat: string): Promise<void> {
  const page = observer.page
  expect(observer.updates.every((update) => update.view.self.id === `player:${roomCode}:${seat}`)).toBe(true)
  for (const opponent of observer.current().view.opponents) {
    expect(Object.keys(opponent).sort()).toEqual(['color', 'controller', 'developmentCardCount', 'id', 'name', 'playedKnights', 'publicVictoryPoints', 'resourceCardCount'].sort())
  }
  for (const [resource, count] of Object.entries(observer.current().view.self.resources)) {
    const label = resource[0] + resource.slice(1).toLowerCase()
    await expect(page.getByLabel(`${label}: ${count}`, { exact: true })).toBeVisible()
  }
  const forbidden = /resumeToken|tokenDigest|developmentDeckOrder|rngState|commandCache|actualVictoryPoints/u
  expect(forbidden.test(await page.locator('body').innerText())).toBe(false)
  expect(forbidden.test(await page.locator('body').ariaSnapshot())).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('frontier-isles:v1:latest-save') === null)).toBe(true)
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0)
  expect(observer.errors).toEqual([])
}

export async function expectOnlineViewport(page: Page): Promise<void> {
  expect(await page.evaluate(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)).toBe(true)
  await expect(page.getByRole('img', { name: /Frontier Isles game board/ })).toBeVisible()
}
