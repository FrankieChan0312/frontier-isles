import { ThemeProvider } from '@mui/material'
import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { createBrowserGameConfig } from '../../app/browser-game.ts'
import { frontierTheme } from '../../theme/frontier-theme.ts'
import { PlayableGameBoard } from './PlayableGameBoard.tsx'

describe('PlayableGameBoard', () => {
  it('renders public terrain, tokens, robber, ports, pieces, and keyboard legal targets', () => {
    const state = gameEngine.createGame(createBrowserGameConfig('Tester', 'PLAYABLE-BOARD'), 'PLAYABLE-BOARD')
    const actorId = state.turn.currentPlayerId
    const view = gameEngine.createPlayerView(state, actorId)
    const legalVertexIds = view.legalActions.legalInitialSettlementVertexIds ?? []
    const onVertexSelect = vi.fn()
    const { container } = render(
      <ThemeProvider theme={frontierTheme}>
        <PlayableGameBoard legalVertexIds={legalVertexIds} onVertexSelect={onVertexSelect} view={view} />
      </ThemeProvider>,
    )

    expect(screen.getByRole('img', { name: /Frontier Isles game board/ })).toBeInTheDocument()
    expect(container.querySelectorAll('[data-layer="tiles"] [data-tile-id]')).toHaveLength(19)
    expect(container.querySelectorAll('[data-layer="ports"] [data-port-id]')).toHaveLength(9)
    expect(container.querySelectorAll('[data-number-token]')).toHaveLength(18)
    expect(container.querySelectorAll('[data-layer="robber"] circle')).toHaveLength(1)
    expect(container.querySelectorAll('[data-legal-vertex-id]')).toHaveLength(legalVertexIds.length)
    const firstTarget = screen.getAllByRole('button', { name: /Build on vertex:/ })[0]
    if (firstTarget === undefined) throw new Error('Expected a keyboard-operable target.')
    fireEvent.keyDown(firstTarget, { key: 'Enter' })
    expect(onVertexSelect).toHaveBeenCalledWith(legalVertexIds[0])
  })
})
