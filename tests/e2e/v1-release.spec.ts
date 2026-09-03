import { expect, test, type Page } from '@playwright/test'
import {
  controlledSevenSave,
  domesticTradeSave,
  maritimeTradeSave,
  paidBuildSave,
  SAVE_STORAGE_KEY,
  victorySave,
} from './save-fixtures.ts'

function captureBrowserErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function openSavedGame(page: Page, serializedSave: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: SAVE_STORAGE_KEY, value: serializedSave },
  )
  await page.goto('/')
  const continueButton = page.getByRole('button', { name: 'Continue saved game' })
  await continueButton.click()
  await expect(continueButton).toBeHidden()
}

async function rejectAiOffersUntilHumanTurn(page: Page): Promise<void> {
  const rollButton = page.getByRole('button', { name: 'Roll dice' })
  const responseDialog = page.getByRole('dialog', { name: /Trade offer from/ })
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await expect(rollButton.or(responseDialog)).toBeVisible({ timeout: 30_000 })
    if (await rollButton.isVisible()) return
    await responseDialog.getByRole('button', { name: 'Reject' }).click()
  }
  throw new Error('AI negotiation did not return to the Human turn within eight responses.')
}

test('creates a seeded game, completes Human setup, rolls, ends, saves, reloads, and starts again', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Frontier Isles' })).toBeVisible()
  await expect(page.getByLabel('Game seed')).toBeVisible()
  await page.getByLabel('Your name').fill('E2E Explorer')
  await page.getByLabel('Game seed').fill('V1-E2E-SETUP-001')
  await page.getByRole('button', { name: 'Start new game' }).click()

  for (let placement = 0; placement < 4; placement += 1) {
    const settlementTarget = page.getByRole('button', { name: /Build on vertex:/ }).first()
    const roadTarget = page.getByRole('button', { name: /Build road on edge:/ }).first()
    if (placement % 2 === 0) {
      await expect(settlementTarget).toBeVisible({ timeout: 30_000 })
      await settlementTarget.press('Enter')
    } else {
      await expect(roadTarget).toBeVisible({ timeout: 30_000 })
      await roadTarget.press('Enter')
    }
  }

  await expect(page.getByRole('button', { name: 'Roll dice' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Roll dice' }).click()
  await expect(page.getByRole('button', { name: 'End turn' })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'End turn' }).click()
  await rejectAiOffersUntilHumanTurn(page)

  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Save: saved')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: 'Continue saved game' }).click()
  await expect(page.getByText(/E2E Explorer/).first()).toBeVisible()
  await expect(page.locator('body')).not.toContainText('developmentDeck')
  await expect(page.locator('body')).not.toContainText('random')

  await page.getByRole('button', { name: 'New game' }).click()
  await page.getByLabel('Game seed').fill('V1-E2E-SETUP-002')
  await page.getByRole('button', { name: 'Start new game' }).click()
  await expect(page.getByRole('img', { name: /Frontier Isles game board/ })).toBeVisible()
  await page.setViewportSize({ width: 480, height: 800 })
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(widths.scroll).toBe(widths.client)
  expect(browserErrors).toEqual([])
})

test('performs a legal paid build from a schema-valid accepted-engine fixture', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await openSavedGame(page, paidBuildSave())
  const before = await page.locator('[data-layer="roads"] [data-edge-id]').count()
  await page.getByRole('button', { name: 'Build road', exact: true }).click()
  const target = page.getByRole('button', { name: /Build road on edge:/ }).first()
  await expect(target).toBeVisible()
  await target.click()
  await expect(page.locator('[data-layer="roads"] [data-edge-id]')).toHaveCount(before + 1)
  expect(browserErrors).toEqual([])
})

test('resolves a controlled seven through discard, robber move, and optional theft', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await openSavedGame(page, controlledSevenSave())
  await expect(page.getByRole('dialog', { name: 'Discard 4 resources' })).toBeVisible()
  await page.getByLabel('Resources to discard Lumber').fill('4')
  await page.getByRole('button', { name: 'Discard selected' }).click()

  const robberTarget = page.getByRole('button', { name: /Move robber to tile:/ }).first()
  await expect(robberTarget).toBeVisible({ timeout: 30_000 })
  await robberTarget.click()
  const victimDialog = page.getByRole('dialog', { name: 'Choose a player to steal from' })
  const actionStatus = page.getByText(/ · Action$/)
  await expect(victimDialog.or(actionStatus)).toBeVisible({ timeout: 30_000 })
  if (await victimDialog.isVisible()) {
    await victimDialog.getByRole('button').first().click()
  }
  await expect(actionStatus).toBeVisible({ timeout: 30_000 })
  expect(browserErrors).toEqual([])
})

test('performs maritime trade and negotiates a domestic offer with an AI', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await openSavedGame(page, maritimeTradeSave())
  await page.getByRole('button', { name: 'Maritime trade' }).click()
  await page.getByRole('dialog', { name: 'Maritime trade' }).getByRole('button', { name: /Give 3 Brick/ }).first().click()
  await expect(page.getByRole('region', { name: 'Game log' })).toContainText('traded 3 Brick')

  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: SAVE_STORAGE_KEY,
    value: domesticTradeSave(),
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue saved game' }).click()
  await page.getByRole('button', { name: 'Propose trade' }).click()
  const tradeDialog = page.getByRole('dialog', { name: 'Propose domestic trade' })
  await tradeDialog.getByLabel('Sentinel gives Lumber').fill('1')
  const otherGives = tradeDialog.locator('fieldset').nth(1)
  await otherGives.getByLabel(/gives Brick/).fill('1')
  await tradeDialog.getByRole('button', { name: 'Send offer' }).click()

  const responseDialog = page.getByRole('dialog', { name: /Trade offer from/ })
  const tradeLog = page.getByRole('region', { name: 'Game log' })
  await expect(responseDialog.or(tradeLog.getByText(/rejected a trade|completed a trade/).first())).toBeVisible({ timeout: 30_000 })
  if (await responseDialog.isVisible()) {
    await responseDialog.getByRole('button', { name: 'Reject' }).click()
  }
  await expect(tradeLog).toContainText(/trade/)
  expect(browserErrors).toEqual([])
})

test('loads a deterministic valid victory and returns to a fresh Home screen', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await openSavedGame(page, victorySave())
  await expect(page.getByRole('dialog', { name: 'Victory!' })).toContainText('reached ten points')
  await page.getByRole('button', { name: 'Start a new game' }).click()
  await expect(page.getByRole('button', { name: 'Start new game' })).toBeVisible()
  expect(browserErrors).toEqual([])
})
