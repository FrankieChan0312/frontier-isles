import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import { frontierTheme } from '../../theme/frontier-theme.ts'
import { GameBoard } from './GameBoard.tsx'
import { STANDARD_BOARD_PREVIEW_TOPOLOGY } from './standard-board-preview.ts'

function renderBoard(showDebugOverlay = false): ReturnType<typeof render> {
  return render(
    <ThemeProvider theme={frontierTheme}>
      <GameBoard
        topology={STANDARD_BOARD_PREVIEW_TOPOLOGY}
        showDebugOverlay={showDebugOverlay}
      />
    </ThemeProvider>,
  )
}

describe('GameBoard', () => {
  it('renders one accessible responsive raw SVG with default metadata', () => {
    const { container } = renderBoard()
    const board = screen.getByRole('img', { name: /Frontier Isles board/ })

    expect(board.tagName.toLowerCase()).toBe('svg')
    expect(board).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet')
    expect(board).toHaveAttribute('viewBox')
    expect(container.querySelectorAll('[data-layer="background"] rect')).toHaveLength(1)
    expect(board.querySelector('title')).toHaveTextContent('Frontier Isles board')
    expect(board.querySelector('desc')).toHaveTextContent(
      'A standard nineteen-tile island board with nine coastal ports.',
    )
  })

  it('renders 19 neutral tiles, 9 stable ports, and the preview label distribution', () => {
    const { container } = renderBoard()
    const tiles = container.querySelectorAll('[data-layer="tiles"] polygon[data-tile-id]')
    const ports = container.querySelectorAll('[data-layer="ports"] > g[data-port-id]')

    expect(tiles).toHaveLength(19)
    expect(ports).toHaveLength(9)
    expect(new Set([...tiles].map((tile) => tile.getAttribute('data-tile-id'))).size).toBe(19)
    expect(new Set([...ports].map((port) => port.getAttribute('data-port-id'))).size).toBe(9)
    expect(screen.getAllByText('3:1')).toHaveLength(4)
    expect(screen.getAllByText(/(?:LUM|BRK|WOL|GRN|ORE) 2:1/)).toHaveLength(5)
  })

  it('renders the complete debug graph only when requested', () => {
    const { container, rerender } = renderBoard()

    expect(container.querySelectorAll('[data-layer="debug-edges"] line')).toHaveLength(0)
    expect(container.querySelectorAll('[data-layer="debug-vertices"] circle')).toHaveLength(0)
    expect(container.querySelectorAll('[data-layer="debug-labels"] text')).toHaveLength(0)

    rerender(
      <ThemeProvider theme={frontierTheme}>
        <GameBoard topology={STANDARD_BOARD_PREVIEW_TOPOLOGY} showDebugOverlay />
      </ThemeProvider>,
    )

    expect(container.querySelectorAll('[data-layer="debug-edges"] line')).toHaveLength(72)
    expect(container.querySelectorAll('[data-layer="debug-vertices"] circle')).toHaveLength(54)
    expect(container.querySelectorAll('[data-layer="debug-labels"] text')).toHaveLength(19)
    expect(container.querySelector('[data-layer="debug-edges"]')).toHaveAttribute(
      'pointer-events',
      'none',
    )
  })
})

