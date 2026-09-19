import { expect, test, type Page } from '@playwright/test'
import {
  controlledSevenSave,
  developmentCardPurchaseSave,
  domesticTradeSave,
  incomingAiTradeSave,
  maritimeTradeSave,
  paidBuildSave,
  SAVE_STORAGE_KEY,
  victorySave,
} from './save-fixtures.ts'

const SUPPLY_LABELS = ['Lumber', 'Brick', 'Wool', 'Grain', 'Ore', 'Development Cards'] as const
type SupplyLabel = (typeof SUPPLY_LABELS)[number]

function captureBrowserErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function openSavedGame(page: Page, serializedSave: string): Promise<void> {
  await page.goto('/')
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: SAVE_STORAGE_KEY,
    value: serializedSave,
  })
  await page.reload()
  const continueButton = page.getByRole('button', { name: 'Continue saved game' })
  await continueButton.click()
  await expect(continueButton).toBeHidden()
}

async function supplyCount(page: Page, label: string): Promise<number> {
  const accessibleName = await page.getByLabel(new RegExp(`^${label} remaining: \\d+$`))
    .getAttribute('aria-label')
  const match = accessibleName?.match(/: (\d+)$/)
  if (match?.[1] === undefined) throw new Error(`Missing public supply count for ${label}.`)
  // Modal decisions intentionally hide background regions from the accessibility tree.
  // Inspect the bank's DOM relationship even while collecting a pre-discard supply snapshot.
  const term = page.locator('section[aria-labelledby="bank-supply-title"] dt').filter({ hasText: new RegExp(`^${label}$`) })
  const pair = term.locator('..')
  await expect(pair.locator(':scope > dt')).toHaveCount(1)
  await expect(pair.locator(':scope > dd')).toHaveCount(1)
  await expect(pair.locator('dd').getByLabel(`${label} remaining: ${match[1]}`, { exact: true })).toHaveText(match[1])
  return Number(match[1])
}

async function supplySnapshot(page: Page): Promise<Readonly<Record<SupplyLabel, number>>> {
  const entries = await Promise.all(SUPPLY_LABELS.map(async (label) => [
    label,
    await supplyCount(page, label),
  ] as const))
  return Object.fromEntries(entries) as Readonly<Record<SupplyLabel, number>>
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

  await expect(page.getByRole('region', { name: 'Bank / Supply' })).toBeVisible()
  for (const resource of ['Lumber', 'Brick', 'Wool', 'Grain', 'Ore']) {
    await expect(page.getByLabel(`${resource} remaining: 19`)).toBeVisible()
  }
  await expect(page.getByLabel('Development Cards remaining: 25')).toBeVisible()
  expect(await supplySnapshot(page)).toEqual({ Lumber: 19, Brick: 19, Wool: 19, Grain: 19, Ore: 19, 'Development Cards': 25 })
  const initialHtml = await page.locator('html').evaluate((element) => element.outerHTML)
  expect(initialHtml).not.toContain('development-card:')
  expect(initialHtml).not.toContain('developmentDeck')

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
  await expect(page.getByLabel('Lumber remaining: 16')).toBeVisible()
  await expect(page.getByLabel('Brick remaining: 11')).toBeVisible()
  const before = await page.locator('[data-layer="roads"] [data-edge-id]').count()
  await page.getByRole('button', { name: 'Build road', exact: true }).click()
  const target = page.getByRole('button', { name: /Build road on edge:/ }).first()
  await expect(target).toBeVisible()
  await target.click()
  await expect(page.locator('[data-layer="roads"] [data-edge-id]')).toHaveCount(before + 1)
  await expect(page.getByLabel('Lumber remaining: 17')).toBeVisible()
  await expect(page.getByLabel('Brick remaining: 12')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('resolves a controlled seven through discard, robber move, and optional theft', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await openSavedGame(page, controlledSevenSave())
  const lumberBeforeDiscard = await supplyCount(page, 'Lumber')
  await expect(page.getByRole('dialog', { name: 'Discard 4 resources' })).toBeVisible()
  await page.getByLabel('Resources to discard Lumber').fill('4')
  await page.getByRole('button', { name: 'Discard selected' }).click()
  await expect(page.getByLabel(`Lumber remaining: ${lumberBeforeDiscard + 4}`)).toBeVisible()

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
  await expect(page.getByLabel('Brick remaining: 16')).toBeVisible()
  await expect(page.getByLabel('Ore remaining: 19')).toBeVisible()
  await page.getByRole('button', { name: 'Maritime trade' }).click()
  const dialog = page.getByRole('dialog', { name: 'Maritime trade' })
  const firstChoice = dialog.getByRole('button').first()
  const cancel = dialog.getByRole('button', { name: 'Cancel' })
  await cancel.focus()
  await page.keyboard.press('Tab')
  await expect(firstChoice).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(cancel).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Maritime trade' })).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByRole('dialog', { name: 'Maritime trade' })
    .getByRole('button', { name: /Give 3 Brick.*receive 1 Ore/ }).click()
  await expect(page.getByRole('region', { name: 'Game log' })).toContainText('traded 3 Brick')
  await expect(page.getByLabel('Brick remaining: 19')).toBeVisible()
  await expect(page.getByLabel('Ore remaining: 18')).toBeVisible()

  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: SAVE_STORAGE_KEY,
    value: domesticTradeSave(),
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue saved game' }).click()
  await page.getByRole('button', { name: 'Propose trade' }).click()
  const tradeDialog = page.getByRole('dialog', { name: 'Propose domestic trade' })
  await tradeDialog.getByLabel('You give / AI receives Lumber').fill('1')
  await tradeDialog.getByLabel('AI gives / You receive Brick').fill('1')
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

test('edits both complete counter sides above one and the AI accepts favorable terms', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await openSavedGame(page, incomingAiTradeSave())
  const responseDialog = page.getByRole('dialog', { name: /Trade offer from/ })
  await responseDialog.getByRole('button', { name: 'Counter' }).click()
  const counterDialog = page.getByRole('dialog', { name: 'Counter trade' })
  const aiWool = counterDialog.getByLabel('AI gives / You receive Wool')
  const humanBrick = counterDialog.getByLabel('You give / AI receives Brick')

  expect(await aiWool.getAttribute('max')).toBeNull()
  await aiWool.fill('2')
  await humanBrick.fill('2')
  await expect(aiWool).toHaveValue('2')
  await expect(humanBrick).toHaveValue('2')
  await aiWool.fill('0')
  await counterDialog.getByRole('button', { name: 'Send counter' }).click()

  await expect(page.getByRole('region', { name: 'Game log' })).toContainText('completed a trade', { timeout: 30_000 })
  await expect(page.getByLabel('Lumber: 1')).toBeVisible()
  expect(browserErrors).toEqual([])
})

test('the AI rejects an unfavorable complete Human counter without a second counter', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await openSavedGame(page, incomingAiTradeSave())
  await page.getByRole('dialog', { name: /Trade offer from/ }).getByRole('button', { name: 'Counter' }).click()
  const counterDialog = page.getByRole('dialog', { name: 'Counter trade' })
  await counterDialog.getByLabel('AI gives / You receive Lumber').fill('2')
  await counterDialog.getByLabel('AI gives / You receive Wool').fill('1')
  await counterDialog.getByLabel('You give / AI receives Brick').fill('1')
  await counterDialog.getByRole('button', { name: 'Send counter' }).click()

  const tradeLog = page.getByRole('region', { name: 'Game log' })
  await expect(tradeLog).toContainText('rejected a trade', { timeout: 30_000 })
  await expect(page.getByRole('dialog', { name: /Trade offer from/ })).toBeHidden()
  expect(browserErrors).toEqual([])
})

test('shows an exact owner-only development card purchase and retains it after reload', async ({ page }) => {
  const browserErrors = captureBrowserErrors(page)
  await openSavedGame(page, developmentCardPurchaseSave())
  const supplyBeforePurchase = await supplySnapshot(page)
  await page.getByRole('button', { name: 'Buy development' }).click()

  const knight = page.getByRole('article', { name: 'Knight Development Card, Bought this turn' })
  await expect(knight).toContainText('Move the robber and steal one random resource from an adjacent opponent. It does not trigger discards.')
  await expect(knight).toContainText('Bought this turn')
  await expect(knight.getByRole('button', { name: /Play Knight\. Unavailable/ })).toBeDisabled()
  await expect(page.getByRole('region', { name: 'Game log' })).toContainText('You bought Knight.')
  await expect(page.getByLabel(`Wool remaining: ${supplyBeforePurchase.Wool + 1}`)).toBeVisible()
  await expect(page.getByLabel(`Grain remaining: ${supplyBeforePurchase.Grain + 1}`)).toBeVisible()
  await expect(page.getByLabel(`Ore remaining: ${supplyBeforePurchase.Ore + 1}`)).toBeVisible()
  await expect(page.getByLabel(`Development Cards remaining: ${supplyBeforePurchase['Development Cards'] - 1}`)).toBeVisible()
  const supplyAfterPurchase = await supplySnapshot(page)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Save: saved')).toBeVisible()

  await page.reload()
  await page.getByRole('button', { name: 'Continue saved game' }).click()
  await expect(page.getByRole('article', { name: 'Knight Development Card, Bought this turn' })).toBeVisible()
  for (const [label, count] of Object.entries(supplyAfterPurchase)) {
    await expect(page.getByLabel(`${label} remaining: ${count}`)).toBeVisible()
  }
  const reloadedHtml = await page.locator('html').evaluate((element) => element.outerHTML)
  expect(reloadedHtml).not.toContain('developmentDeck')
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
