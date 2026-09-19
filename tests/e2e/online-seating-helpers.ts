import { expect, type Browser, type BrowserContext } from '@playwright/test'
import { observeOnline, type OnlineObserver } from './online-helpers.ts'

export async function openSeatingBrowsers(browser: Browser, humans: 3 | 4, url = '/'): Promise<{
  readonly observers: readonly OnlineObserver[]; readonly roomCode: string; readonly close: () => Promise<void>
}> {
  const contexts: BrowserContext[] = []
  const observers: OnlineObserver[] = []
  const seats = ['NORTH', 'EAST', 'SOUTH', 'WEST'] as const
  const sizes = [{ width: 1440, height: 900 }, { width: 1024, height: 768 }, { width: 480, height: 800 }]
  const close = async (): Promise<void> => { for (const context of contexts) await context.close() }
  try {
    let roomCode = ''
    for (let index = 0; index < humans; index += 1) {
      const context = await browser.newContext({ viewport: sizes[index % sizes.length] ?? { width: 1440, height: 900 } })
      contexts.push(context)
      const observer = observeOnline(await context.newPage())
      observers.push(observer)
      await observer.page.goto(url)
      await observer.page.getByLabel('Your name').fill(`Seated Human ${index + 1}`)
      if (index === 0) await observer.page.getByRole('button', { name: 'Create online Room' }).click()
      else {
        await observer.page.getByLabel('Room code').fill(roomCode)
        await observer.page.getByRole('button', { name: 'Join online Room' }).click()
      }
      await expect(observer.page.getByTestId('room-code')).toBeVisible()
      roomCode = await observer.page.getByTestId('room-code').innerText()
    }
    const host = observers[0]
    if (host === undefined) throw new Error('Missing seated Host.')
    if (humans === 3) {
      await host.page.getByLabel('AI profile for WEST').click()
      await host.page.getByRole('option', { name: 'MERCHANT' }).click()
      await expect(host.page.getByTestId('seat-WEST')).toContainText('AI')
    }
    for (const [index, observer] of observers.entries()) {
      await observer.page.getByRole('switch', { name: 'I am Ready' }).click()
      await expect(host.page.getByTestId(`seat-${seats[index]}`)).toContainText('Ready')
    }
    await expect(host.page.getByRole('button', { name: 'Start Game' })).toBeEnabled()
    await host.page.getByRole('button', { name: 'Start Game' }).click()
    for (const observer of observers) {
      await expect(observer.page.getByText(/Online Multiplayer · Room/)).toBeVisible()
      await expect.poll(() => observer.updates.length).toBeGreaterThan(0)
    }
    return { observers, roomCode, close }
  } catch (error: unknown) { await close(); throw error }
}
