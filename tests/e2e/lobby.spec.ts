import { expect, test, type Page } from '@playwright/test'

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
      await expect(page.getByRole('button', { name: 'Start Game — Milestone B' })).toBeDisabled()
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
