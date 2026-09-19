import type { PlayerEventView } from '@frontier-isles/game-core/contracts/player-events'
import type { GameUpdate } from '../gateways/game-gateway.ts'
import { createGameSessionStore } from './game-session-store.ts'
import { createUiInteractionStore } from './ui-interaction-store.ts'

describe('application Zustand stores', () => {
  it('stores only gateway redacted session updates and bounded event history', () => {
    const store = createGameSessionStore()
    const event: PlayerEventView = {
      type: 'TURN_STARTED',
      playerId: 'player:test' as never,
      turnNumber: 1,
    }
    const update: GameUpdate = {
      view: null,
      events: Array<PlayerEventView>(110).fill(event),
      connectionStatus: 'READY',
      aiThinking: true,
      saveStatus: 'SAVED',
      error: null,
    }
    store.getState().applyGatewayUpdate(update)
    expect(store.getState()).toMatchObject({
      view: null,
      connectionStatus: 'READY',
      aiThinking: true,
      saveStatus: 'SAVED',
      error: null,
    })
    expect(store.getState().recentEvents).toHaveLength(100)
    expect(store.getState()).not.toHaveProperty('gameState')
    expect(store.getState()).not.toHaveProperty('players')
    expect(store.getState()).not.toHaveProperty('bank')
  })

  it('keeps UI interaction state separate and clamps presentation-only zoom', () => {
    const store = createUiInteractionStore()
    store.getState().setSelectedBuildMode('ROAD')
    store.getState().setOpenDialog('TRADE')
    store.getState().setBoardZoom(9)
    expect(store.getState()).toMatchObject({
      selectedBuildMode: 'ROAD',
      openDialog: 'TRADE',
      boardZoom: 2,
    })
    expect(store.getState()).not.toHaveProperty('view')
    expect(store.getState()).not.toHaveProperty('resources')
    expect(store.getState()).not.toHaveProperty('legalActions')
  })
})
