import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { duplicateBlankTab } from './online-helpers.ts'

const CREDENTIAL_STORAGE_KEY = 'frontier-isles:realtime-session:v1'

interface TwoPlayerLobby {
  readonly host: Page
  readonly hostContext: BrowserContext
  readonly joiner: Page
  readonly joinerContext: BrowserContext
  readonly roomCode: string
}

function captureBrowserErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(widths.scroll).toBe(widths.client)
}

async function createOnlineRoom(page: Page, displayName: string): Promise<string> {
  await page.goto('/')
  await page.getByLabel('Your name').fill(displayName)
  await page.getByRole('button', { name: 'Create online Room' }).click()
  await expect(page.getByText('Online Multiplayer Lobby')).toBeVisible()
  const roomCode = await page.getByTestId('room-code').textContent()
  if (roomCode === null) throw new Error('Created Lobby did not display a Room code.')
  return roomCode
}

async function joinOnlineRoom(page: Page, displayName: string, roomCode: string): Promise<void> {
  await page.goto('/')
  await page.getByLabel('Your name').fill(displayName)
  await page.getByLabel('Room code').fill(roomCode.toLowerCase())
  await page.getByRole('button', { name: 'Join online Room' }).click()
  await expect(page.getByTestId('room-code')).toHaveText(roomCode)
}

async function openTwoPlayerLobby(browser: Browser): Promise<TwoPlayerLobby> {
  const hostContext = await browser.newContext()
  const joinerContext = await browser.newContext()
  const host = await hostContext.newPage()
  const joiner = await joinerContext.newPage()
  const roomCode = await createOnlineRoom(host, 'Ada Host')
  await joinOnlineRoom(joiner, 'Grace Joiner', roomCode)
  return { host, hostContext, joiner, joinerContext, roomCode }
}

async function closeTwoPlayerLobby(lobby: TwoPlayerLobby): Promise<void> {
  await lobby.hostContext.close()
  await lobby.joinerContext.close()
}

test('two browser contexts synchronize seats, Ready, and Host AI at all target widths', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const joinerContext = await browser.newContext({ viewport: { width: 1024, height: 768 } })
  const host = await hostContext.newPage()
  const joiner = await joinerContext.newPage()
  const hostErrors = captureBrowserErrors(host)
  const joinerErrors = captureBrowserErrors(joiner)

  try {
    const roomCode = await createOnlineRoom(host, 'Ada Host')
    await joinOnlineRoom(joiner, 'Grace Joiner', roomCode)

    for (const page of [host, joiner]) {
      await expect(page.getByTestId('seat-NORTH')).toContainText('Ada Host')
      await expect(page.getByTestId('seat-NORTH')).toContainText('Host')
      await expect(page.getByTestId('seat-EAST')).toContainText('Grace Joiner')
      await expect(page.getByText('Connected', { exact: true }).first()).toBeVisible()
    }

    await joiner.getByRole('switch', { name: 'I am Ready' }).click()
    for (const page of [host, joiner]) {
      await expect(page.getByTestId('seat-EAST')).toContainText('Ready')
    }

    await host.getByLabel('AI profile for SOUTH').click()
    await host.getByRole('option', { name: 'BUILDER' }).click()
    for (const page of [host, joiner]) {
      await expect(page.getByTestId('seat-SOUTH')).toContainText('Builder AI')
      await expect(page.getByTestId('seat-SOUTH')).toContainText('Ready')
      await expect(page.getByRole('button', { name: 'Start Game' })).toBeDisabled()
    }

    const readPublicSeats = (page: Page) => page.getByTestId(/^seat-/u).evaluateAll((seats) => (
      seats.map((seat) => ({
        connection: seat.getAttribute('data-connection'),
        displayName: seat.getAttribute('data-display-name'),
        host: seat.getAttribute('data-host'),
        occupancy: seat.getAttribute('data-occupancy'),
        profile: seat.getAttribute('data-profile'),
        ready: seat.getAttribute('data-ready'),
        seatId: seat.getAttribute('data-seat-id'),
      }))
    ))
    expect(await readPublicSeats(joiner)).toEqual(await readPublicSeats(host))

    await expectNoHorizontalOverflow(host)
    await expectNoHorizontalOverflow(joiner)
    await joiner.setViewportSize({ width: 480, height: 800 })
    await expect(joiner.getByTestId('seat-WEST')).toBeVisible()
    await expectNoHorizontalOverflow(joiner)
    expect(hostErrors).toEqual([])
    expect(joinerErrors).toEqual([])
  } finally {
    await hostContext.close()
    await joinerContext.close()
  }
})

test('Single Player still starts through the LocalGameGateway', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Single Player' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Online Multiplayer' })).toBeVisible()
  await page.getByLabel('Your name').fill('Local Explorer')
  await page.getByLabel('Game seed').fill('V2-LOBBY-SINGLE-PLAYER-REGRESSION')
  await page.getByRole('button', { name: 'Start new game' }).click()
  await expect(page.getByRole('img', { name: /Frontier Isles game board/u })).toBeVisible()
  await expectNoHorizontalOverflow(page)
  expect(browserErrors).toEqual([])
})

test('a refreshed tab resumes the same Ready SessionId and EAST seat', async ({ browser }) => {
  const lobby = await openTwoPlayerLobby(browser)
  const errors = captureBrowserErrors(lobby.joiner)
  try {
    await lobby.joiner.getByRole('switch', { name: 'I am Ready' }).click()
    await expect(lobby.host.getByTestId('seat-EAST')).toContainText('Ready')
    const reference = await duplicateBlankTab(lobby.joiner)
    expect(await reference.evaluate((key) => {
      const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null')
      return typeof value === 'object' && value !== null && 'resumeToken' in value && typeof value.resumeToken === 'string'
        && !window.opener.document.body.textContent.includes(value.resumeToken)
    }, CREDENTIAL_STORAGE_KEY)).toBe(true)

    await lobby.joiner.reload()
    await expect(lobby.joiner.getByText('Online Multiplayer Lobby')).toBeVisible()
    await expect(lobby.joiner.getByTestId('seat-EAST')).toContainText('Grace Joiner')
    await expect(lobby.joiner.getByTestId('seat-EAST')).toContainText('Ready')
    await expect(lobby.joiner.getByTestId('seat-EAST')).toContainText('connected')
    expect(await reference.evaluate((key) => {
      const before: unknown = JSON.parse(sessionStorage.getItem(key) ?? 'null')
      const after: unknown = JSON.parse(window.opener.sessionStorage.getItem(key) ?? 'null')
      return typeof before === 'object' && before !== null && 'sessionId' in before
        && typeof after === 'object' && after !== null && 'sessionId' in after && 'seatId' in after
        && after.sessionId === before.sessionId && after.seatId === 'EAST'
    }, CREDENTIAL_STORAGE_KEY)).toBe(true)
    await reference.close()
    expect(errors).toEqual([])
  } finally {
    await closeTwoPlayerLobby(lobby)
  }
})

test('a copied duplicate tab wins and leaves the original read-only with a safe explanation', async ({ browser }) => {
  const lobby = await openTwoPlayerLobby(browser)
  const originalErrors = captureBrowserErrors(lobby.joiner)
  let duplicate: Page | null = null
  try {
    duplicate = await duplicateBlankTab(lobby.joiner)
    const duplicateErrors = captureBrowserErrors(duplicate)
    await duplicate.goto('/')

    await expect(duplicate.getByText('Online Multiplayer Lobby')).toBeVisible()
    await expect(duplicate.getByTestId('seat-EAST')).toContainText('Grace Joiner')
    await expect(lobby.joiner.getByRole('alert')).toContainText('continued in a newer tab')
    await expect(lobby.joiner.getByText('Disconnected', { exact: true })).toBeVisible()
    await expect(lobby.joiner.getByRole('switch', { name: 'I am Ready' })).toBeDisabled()
    await expect(duplicate.getByRole('switch', { name: 'I am Ready' })).toBeEnabled()
    expect(await lobby.joiner.evaluate((key) => sessionStorage.getItem(key) === null, CREDENTIAL_STORAGE_KEY)).toBe(true)
    expect(originalErrors).toEqual([])
    expect(duplicateErrors).toEqual([])
  } finally {
    await duplicate?.close()
    await closeTwoPlayerLobby(lobby)
  }
})

test('Host leave transfers authority to the first Connected Human and never to AI', async ({ browser }) => {
  const lobby = await openTwoPlayerLobby(browser)
  try {
    await lobby.host.getByLabel('AI profile for SOUTH').click()
    await lobby.host.getByRole('option', { name: 'SENTINEL' }).click()
    await expect(lobby.joiner.getByTestId('seat-SOUTH')).toContainText('Sentinel AI')

    await lobby.host.getByRole('button', { name: 'Leave Room' }).click()

    await expect(lobby.joiner.getByTestId('seat-EAST')).toContainText('Host')
    await expect(lobby.joiner.getByTestId('seat-SOUTH')).not.toContainText('Host')
    await expect(lobby.joiner.getByLabel('AI profile for WEST')).toBeVisible()
  } finally {
    await closeTwoPlayerLobby(lobby)
  }
})

test('Ready and AI state stay synchronized through refresh and explicit snapshot recovery', async ({ browser }) => {
  const lobby = await openTwoPlayerLobby(browser)
  const hostErrors = captureBrowserErrors(lobby.host)
  const joinerErrors = captureBrowserErrors(lobby.joiner)
  try {
    await lobby.joiner.getByRole('switch', { name: 'I am Ready' }).click()
    await lobby.host.getByLabel('AI profile for SOUTH').click()
    await lobby.host.getByRole('option', { name: 'MERCHANT' }).click()
    await lobby.joiner.reload()
    await expect(lobby.joiner.getByText('Online Multiplayer Lobby')).toBeVisible()

    for (const page of [lobby.host, lobby.joiner]) {
      await expect(page.getByTestId('seat-EAST')).toContainText('Ready')
      await expect(page.getByTestId('seat-SOUTH')).toContainText('Merchant AI')
      await expect(page.getByTestId('seat-SOUTH')).toContainText('connected')
    }
    expect(hostErrors).toEqual([])
    expect(joinerErrors).toEqual([])
  } finally {
    await closeTwoPlayerLobby(lobby)
  }
})
