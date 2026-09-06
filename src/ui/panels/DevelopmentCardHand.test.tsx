import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { GOLDEN_PLAYER_IDS } from '@frontier-isles/game-core/engine/task-05-golden-fixture.test-helper'
import { moveStandardCardToPlayer } from '@frontier-isles/game-core/engine/task-10-development-card.test-helper'
import { createGoldenDomesticTradeStart } from '@frontier-isles/game-core/engine/task-11-trading.test-helper'
import { frontierTheme } from '../../theme/frontier-theme.ts'
import { DevelopmentCardHand } from './DevelopmentCardHand.tsx'

function themed(element: React.JSX.Element): React.JSX.Element {
  return <ThemeProvider theme={frontierTheme}>{element}</ThemeProvider>
}

describe('DevelopmentCardHand', () => {
  it('identifies every owner card, explains its effect/status, and exposes only legal play actions', async () => {
    const user = userEvent.setup()
    let state = createGoldenDomesticTradeStart()
    state = moveStandardCardToPlayer(
      state,
      GOLDEN_PLAYER_IDS.sentinel,
      'KNIGHT',
      'IN_HAND',
      state.turn.turnNumber,
    )
    state = moveStandardCardToPlayer(state, GOLDEN_PLAYER_IDS.sentinel, 'ROAD_BUILDING')
    state = moveStandardCardToPlayer(state, GOLDEN_PLAYER_IDS.sentinel, 'INVENTION', 'PLAYED')
    state = moveStandardCardToPlayer(state, GOLDEN_PLAYER_IDS.sentinel, 'MONOPOLY')
    state = moveStandardCardToPlayer(state, GOLDEN_PLAYER_IDS.sentinel, 'VICTORY_POINT')
    state = moveStandardCardToPlayer(state, GOLDEN_PLAYER_IDS.sentinel, 'VICTORY_POINT')
    const projected = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.sentinel)
    const lastCard = projected.self.developmentCards.at(-1)
    if (lastCard === undefined) throw new Error('Expected second Victory Point card.')
    const view = {
      ...projected,
      self: {
        ...projected.self,
        developmentCards: projected.self.developmentCards.map((card) =>
          card.id === lastCard.id ? { ...card, status: 'REVEALED' as const } : card,
        ),
      },
    }
    const onPlay = vi.fn()
    render(themed(<DevelopmentCardHand busy={false} onPlay={onPlay} view={view} />))

    expect(screen.getByRole('heading', { name: 'Development Cards' })).toBeInTheDocument()
    expect(screen.getByText('Bought this turn')).toBeInTheDocument()
    expect(screen.getAllByText('Playable')).toHaveLength(2)
    expect(screen.getByText('Already played')).toBeInTheDocument()
    expect(screen.getByText('Hidden Victory Point')).toBeInTheDocument()
    expect(screen.getByText('Revealed Victory Point')).toBeInTheDocument()
    expect(screen.getByText('Move the robber and steal one random resource from an adjacent opponent. It does not trigger discards.')).toBeInTheDocument()
    expect(screen.getByText('Build up to two legal roads without paying resources.')).toBeInTheDocument()
    expect(screen.getByText('Take exactly two available resources from the bank; both may be the same type.')).toBeInTheDocument()
    expect(screen.getByText('Choose one resource type and take all cards of that type from every opponent.')).toBeInTheDocument()
    expect(screen.getAllByText('A hidden +1 victory point that is automatically revealed when required to win.')).toHaveLength(2)

    expect(screen.getByRole('button', { name: /Play Knight\. Unavailable: Bought this turn/ })).toBeDisabled()
    expect(screen.getByText(/Cannot play: Bought this turn/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Play Invention. Unavailable: This card has already been played.' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Victory Point/ })).not.toBeInTheDocument()

    const roadButton = screen.getByRole('button', { name: 'Play Road Building' })
    expect(roadButton).toBeEnabled()
    await user.click(roadButton)
    const roadCard = view.self.developmentCards.find((card) => card.type === 'ROAD_BUILDING')
    expect(onPlay).toHaveBeenCalledWith(roadCard?.id)
  })
})
