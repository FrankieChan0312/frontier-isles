import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import type { CommandId, TradeId } from '@frontier-isles/game-core/model/ids'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { createCompletedGoldenSetup, GOLDEN_PLAYER_IDS } from '@frontier-isles/game-core/engine/task-05-golden-fixture.test-helper'
import { createBalancedDiscardState } from '@frontier-isles/game-core/engine/task-07-controlled-seven.test-helper'
import { createGoldenDomesticTradeStart, createInitialGoldenOffer } from '@frontier-isles/game-core/engine/task-11-trading.test-helper'
import { frontierTheme } from '../../theme/frontier-theme.ts'
import { createBrowserGameConfig } from '../../app/browser-game.ts'
import { GamePage, type GamePageProps } from './GamePage.tsx'

function props(view: PlayerView, extra: Partial<GamePageProps> = {}): GamePageProps {
  return { view, events: [], buildMode: null, aiThinking: false, saveStatus: 'IDLE', error: null,
    busy: false, canRestart: false, onBuildModeChange: vi.fn(), onCommand: vi.fn(), onSave: vi.fn(),
    onRestart: vi.fn(), onNewGame: vi.fn(), createTradeId: () => 'trade:ui-test' as TradeId, ...extra }
}
function page(value: GamePageProps): React.JSX.Element {
  return <ThemeProvider theme={frontierTheme}><GamePage {...value} /></ThemeProvider>
}
const paused: NonNullable<GamePageProps['online']> = {
  roomCode: 'ABC234', status: 'Connected', onResync: vi.fn(), resyncDisabled: false, paused: true, presence: null,
}

describe('viewer-specific game guidance', () => {
  it.each(['settlement', 'road'] as const)('guides only the projected setup %s actor', (step) => {
    let state = gameEngine.createGame(createBrowserGameConfig('Tester', 'UI-CONTROLLER'), 'UI-CONTROLLER')
    if (step === 'road') {
      const actor = gameEngine.createPlayerView(state, state.turn.currentPlayerId)
      const vertexId = actor.legalActions.legalInitialSettlementVertexIds?.[0]
      if (vertexId === undefined) throw new Error('Expected projected settlement target.')
      const result = gameEngine.execute(state, { commandId: 'command:guidance:setup' as CommandId,
        actorId: actor.self.id, expectedStateVersion: state.stateVersion, command: { type: 'PLACE_INITIAL_SETTLEMENT', vertexId } })
      if (!result.ok) throw new Error('Expected valid initial placement.')
      state = result.state
    }
    const actor = gameEngine.createPlayerView(state, state.turn.currentPlayerId)
    const waitingId = state.playerOrder.find((id) => id !== actor.self.id)
    if (waitingId === undefined) throw new Error('Expected another player.')
    const waiting = gameEngine.createPlayerView(state, waitingId)
    expect(waiting.self.id).not.toBe(actor.self.id)
    const { rerender } = render(page(props(actor)))
    expect(screen.getByRole('status', { name: 'Action guidance' })).toHaveTextContent(step === 'settlement'
      ? 'Choose a highlighted vertex for your settlement.' : 'Choose a highlighted edge for your road.')
    rerender(page(props(waiting)))
    expect(screen.getAllByText('Waiting for another player’s decision.')).toHaveLength(1)
    expect(screen.queryByText(/Choose a highlighted/)).not.toBeInTheDocument()
    rerender(page(props(actor, { busy: true, online: paused })))
    expect(screen.getByRole('status', { name: 'Action guidance' })).toHaveTextContent('Game paused.')
    expect(screen.queryByRole('button', { name: /Build on vertex:|Build road on edge:/ })).not.toBeInTheDocument()
  })

  it('distinguishes roll, waiting, submission, resynchronization and reconnection', () => {
    const state = createCompletedGoldenSetup()
    const actor = gameEngine.createPlayerView(state, state.turn.currentPlayerId)
    const { rerender } = render(page(props(actor)))
    expect(screen.getByRole('status', { name: 'Action guidance' })).toHaveTextContent('Roll the dice')
    expect(screen.getByRole('button', { name: 'Roll dice' })).toBeEnabled()
    rerender(page(props(gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.human))))
    expect(screen.getByRole('status', { name: 'Action guidance' })).toHaveTextContent('Waiting for another player')
    for (const status of ['Sending command', 'Resynchronizing', 'Reconnecting', 'Resync required']) {
      rerender(page(props(actor, { busy: true, online: { ...paused, status, paused: status !== 'Sending command' } })))
      expect(screen.getByRole('status', { name: 'Action guidance' })).toHaveTextContent(status)
      expect(screen.getByRole('status', { name: 'Action guidance' })).not.toHaveTextContent(/Roll the dice|Choose/)
      expect(screen.getByRole('button', { name: 'Roll dice' })).toBeDisabled()
    }
  })

  it('preserves a non-current discard decision across pause and resume', async () => {
    const view = gameEngine.createPlayerView(createBalancedDiscardState(), GOLDEN_PLAYER_IDS.human)
    expect(view.self.id).not.toBe(view.publicGame.turn.currentPlayerId)
    const value = props(view)
    const { container, rerender } = render(page(value))
    expect(container.querySelector('[aria-label="Action guidance"]')).toHaveTextContent('Choose exactly 4 cards to discard.')
    expect(screen.getByRole('dialog', { name: 'Discard 4 resources' })).toBeVisible()
    rerender(page({ ...value, busy: true, online: paused }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Action guidance' })).toHaveTextContent('Game paused.')
    rerender(page(value))
    const user = userEvent.setup()
    await user.clear(screen.getByLabelText('Resources to discard Brick'))
    await user.type(screen.getByLabelText('Resources to discard Brick'), '4')
    await user.click(screen.getByRole('button', { name: 'Discard selected' }))
    expect(value.onCommand).toHaveBeenCalledWith({ type: 'DISCARD_RESOURCES', resources: { LUMBER: 0, BRICK: 4, WOOL: 0, GRAIN: 0, ORE: 0 } })
  })

  it('preserves a non-current trade response across pause and resume', async () => {
    const state = createGoldenDomesticTradeStart()
    const offer = createInitialGoldenOffer()
    const result = gameEngine.execute(state, { commandId: 'command:guidance:trade' as CommandId,
      actorId: state.turn.currentPlayerId, expectedStateVersion: state.stateVersion, command: { type: 'PROPOSE_TRADE', offer } })
    if (!result.ok) throw new Error('Expected valid trade fixture.')
    const view = gameEngine.createPlayerView(result.state, GOLDEN_PLAYER_IDS.human)
    expect(view.self.id).not.toBe(view.publicGame.turn.currentPlayerId)
    const value = props(view)
    const { container, rerender } = render(page(value))
    expect(container.querySelector('[aria-label="Action guidance"]')).toHaveTextContent('Respond to the proposed trade.')
    expect(screen.getByRole('button', { name: 'Accept' })).toBeEnabled()
    rerender(page({ ...value, busy: true, online: paused }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Action guidance' })).toHaveTextContent('Game paused.')
    rerender(page(value))
    await userEvent.setup().click(screen.getByRole('button', { name: 'Accept' }))
    expect(value.onCommand).toHaveBeenCalledWith({ type: 'ACCEPT_TRADE', tradeId: offer.tradeId })
  })

  it('suppresses an obsolete build selection and ends guidance at victory', () => {
    const state = createCompletedGoldenSetup()
    const view = gameEngine.createPlayerView(state, state.turn.currentPlayerId)
    const { container, rerender } = render(page(props(view, { buildMode: 'ROAD' })))
    expect(screen.getByRole('status', { name: 'Action guidance' })).toHaveTextContent('Roll the dice')
    expect(screen.queryByRole('button', { name: 'Cancel build selection' })).not.toBeInTheDocument()
    // Presentation-only completed projection; authority still belongs to the gateway.
    rerender(page(props({ ...view, publicGame: { ...view.publicGame, winnerId: view.self.id } }, { busy: true })))
    expect(container.querySelector('[aria-label="Action guidance"]')).toHaveTextContent('The game is complete.')
  })
})
