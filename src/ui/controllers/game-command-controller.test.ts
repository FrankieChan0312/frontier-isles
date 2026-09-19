import type { EdgeId, VertexId } from '@frontier-isles/game-core/model/ids'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { createBrowserGameConfig } from '../../app/browser-game.ts'
import { createGoldenPaidBuildingStart } from '@frontier-isles/game-core/engine/task-08-paid-building.test-helper'
import { GOLDEN_PLAYER_IDS } from '@frontier-isles/game-core/engine/task-05-golden-fixture.test-helper'
import {
  commandForEdgeSelection,
  commandForVertexSelection,
  legalEdgesForMode,
  legalVerticesForMode,
} from './game-command-controller.ts'

describe('game command controller', () => {
  it('constructs setup commands only from engine-projected legal targets', () => {
    const state = gameEngine.createGame(createBrowserGameConfig('Tester', 'UI-CONTROLLER'), 'UI-CONTROLLER')
    const actorId = state.turn.currentPlayerId
    const view = gameEngine.createPlayerView(state, actorId)
    const vertexId = view.legalActions.legalInitialSettlementVertexIds?.[0]
    if (vertexId === undefined) throw new Error('Expected a legal setup vertex.')

    expect(commandForVertexSelection(view, vertexId, null)).toEqual({
      type: 'PLACE_INITIAL_SETTLEMENT',
      vertexId,
    })
    expect(legalVerticesForMode(view, null)).toContain(vertexId)
    expect(commandForVertexSelection(view, 'vertex:invalid' as VertexId, null)).toBeNull()
  })

  it('refuses an edge that is absent from every projected legal list', () => {
    const state = gameEngine.createGame(createBrowserGameConfig('Tester', 'UI-CONTROLLER'), 'UI-CONTROLLER')
    const view = gameEngine.createPlayerView(state, state.turn.currentPlayerId)

    expect(commandForEdgeSelection(view, 'edge:invalid' as EdgeId)).toBeNull()
    expect(legalEdgesForMode(view, 'ROAD')).not.toContain('edge:invalid')
  })

  it('uses paid-build edges when the normal-phase setup projection is an empty array', () => {
    const state = createGoldenPaidBuildingStart()
    const view = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.sentinel)

    expect(view.legalActions.legalInitialRoadEdgeIds).toEqual([])
    expect(legalEdgesForMode(view, 'ROAD')).toEqual(view.legalActions.legalRoadEdgeIds)
    expect(legalEdgesForMode(view, 'ROAD').length).toBeGreaterThan(0)
  })
})
