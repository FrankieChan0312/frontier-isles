import { expect, test } from '@playwright/test'
import { gameCommandAcknowledgementSchema, gameCommandRequestSchema, type GameCommandRequest } from '@frontier-isles/realtime-contracts'
import { expectOnlinePrivacy, expectSharedPublicState, openOnlineBrowsers } from './online-helpers.ts'

test('a lost game acknowledgement retries the same request once and shows one public effect', async ({ browser }) => {
  const requests: GameCommandRequest[] = []
  let dropId: string | null = null
  let dropped = false
  const game = await openOnlineBrowsers(browser, 'Ada Host', async (page) => {
    await page.routeWebSocket(/socket\.io/u, (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string') {
          const match = /^42(\d+)(\[.*)$/su.exec(message)
          if (match?.[1] !== undefined && match[2] !== undefined) {
            const packet: unknown = JSON.parse(match[2])
            if (Array.isArray(packet) && packet[0] === 'game:command') {
              const request = gameCommandRequestSchema.parse(packet[1])
              requests.push(request)
              dropId ??= match[1]
            }
          }
        }
        server.send(message)
      })
      server.onMessage((message) => {
        if (typeof message === 'string' && !dropped && dropId !== null && message.startsWith(`43${dropId}[`)) {
          dropped = true
          return
        }
        socket.send(message)
      })
    })
  })
  try {
    await game.host.page.getByRole('button', { name: /^Build on vertex:/ }).first().press('Enter')
    await expectSharedPublicState([game.host, game.joiner], 1)
    await expect(game.host.page.getByRole('status', { name: 'Command delivery' })).toContainText('Sending command')
    await expect.poll(() => requests.length, { timeout: 15_000 }).toBe(2)
    expect(dropped).toBe(true)
    expect(requests[0]).toEqual(requests[1])
    await expect(game.host.page.getByRole('status', { name: 'Command delivery' })).toContainText('Connected')
    await expect(game.joiner.page.locator('[data-layer="buildings"] [data-vertex-id]')).toHaveCount(1)
    expect(game.host.current().view.stateVersion).toBe(1)
    expect(game.joiner.updates.flatMap((update) => update.events).filter((event) => event.type === 'SETTLEMENT_BUILT')).toHaveLength(1)
    await game.host.page.getByRole('button', { name: /^Build road on edge:/ }).first().press('Enter')
    await expectSharedPublicState([game.host, game.joiner], 2)
    await expectOnlinePrivacy(game.host, game.roomCode, 'NORTH')
    await expectOnlinePrivacy(game.joiner, game.roomCode, 'EAST')
  } finally { await game.close() }
})

test('simultaneous exact and conflicting wire replays have one effect and a safe conflict result', async ({ browser }) => {
  let replayed = false
  const outcomes: { readonly accepted?: boolean; readonly errorCode?: string }[] = []
  const game = await openOnlineBrowsers(browser, 'Ada Host', async (page) => {
    await page.routeWebSocket(/socket\.io/u, (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (typeof message === 'string' && !replayed) {
          const match = /^(42\d+)(\[.*)$/su.exec(message)
          if (match?.[1] !== undefined && match[2] !== undefined) {
            const packet: unknown = JSON.parse(match[2])
            if (Array.isArray(packet) && packet[0] === 'game:command') {
              const request = gameCommandRequestSchema.parse(packet[1])
              replayed = true
              server.send(message)
              server.send(message)
              server.send(`${match[1]}${JSON.stringify(['game:command', { ...request, command: { type: 'END_TURN' } }])}`)
              return
            }
          }
        }
        server.send(message)
      })
      server.onMessage((message) => {
        if (typeof message === 'string') {
          const match = /^43\d+(\[.*)$/su.exec(message)
          if (match?.[1] !== undefined) {
            const packet: unknown = JSON.parse(match[1])
            if (Array.isArray(packet)) {
              const ack = gameCommandAcknowledgementSchema.safeParse(packet[0])
              if (ack.success) outcomes.push(ack.data.ok ? { accepted: ack.data.data.accepted } : { errorCode: ack.data.error.code })
            }
          }
        }
        socket.send(message)
      })
    })
  })
  try {
    await game.host.page.getByRole('button', { name: /^Build on vertex:/ }).first().press('Enter')
    await expectSharedPublicState([game.host, game.joiner], 1)
    await expect.poll(() => outcomes.filter((outcome) => outcome.accepted).length).toBe(2)
    expect(outcomes).toContainEqual({ errorCode: 'COMMAND_ID_CONFLICT' })
    await expect(game.joiner.page.locator('[data-layer="buildings"] [data-vertex-id]')).toHaveCount(1)
    expect(game.host.current().view.stateVersion).toBe(1)
    expect(game.joiner.updates.flatMap((update) => update.events).filter((event) => event.type === 'SETTLEMENT_BUILT')).toHaveLength(1)
    await expectOnlinePrivacy(game.host, game.roomCode, 'NORTH')
    expect(game.joiner.errors).toEqual([])
  } finally { await game.close() }
})
