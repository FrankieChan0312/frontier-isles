import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { createCompletedGoldenSetup, GOLDEN_PLAYER_IDS } from '@frontier-isles/game-core/engine/task-05-golden-fixture.test-helper'
import type { GameUpdate } from '../gateways/game-gateway.ts'
import { createGameSessionStore } from './game-session-store.ts'

it('keeps only the current viewer projection and clears private event history on identity changes', () => {
  const state = createCompletedGoldenSetup()
  const view = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.human)
  const update: GameUpdate = { view, events: [{ type: 'TURN_ENDED', playerId: view.self.id, turnNumber: state.turn.turnNumber }],
    connectionStatus: 'READY', saveStatus: 'IDLE', aiThinking: false, error: null, submitting: true, resynchronizing: true }
  const store = createGameSessionStore()
  store.getState().applyGatewayUpdate(update)
  expect(store.getState().submitting).toBe(true)
  expect(store.getState().resynchronizing).toBe(true)
  expect(store.getState().recentEvents).toHaveLength(1)
  const other = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.sentinel)
  store.getState().applyGatewayUpdate({ ...update, view: other, events: [], submitting: false })
  expect(store.getState().view).toEqual(other)
  expect(store.getState().recentEvents).toEqual([])
  expect(store.getState()).not.toHaveProperty('state')
  store.getState().applyGatewayUpdate({ ...update, view: null, events: [] })
  expect(store.getState().recentEvents).toEqual([])
})
