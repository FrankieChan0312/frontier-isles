import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { CommandId } from '../../game/model/ids.ts'
import { gameEngine } from '../../game/engine/game-engine.ts'
import { createBalancedDiscardState } from '../../game/engine/task-07-controlled-seven.test-helper.ts'
import {
  createGoldenDomesticTradeStart,
  createInitialGoldenOffer,
} from '../../game/engine/task-11-trading.test-helper.ts'
import { GOLDEN_PLAYER_IDS } from '../../game/engine/task-05-golden-fixture.test-helper.ts'
import { frontierTheme } from '../../theme/frontier-theme.ts'
import { DiscardDecisionDialog, TradeResponseDialog } from './GameDialogs.tsx'

function themed(element: React.JSX.Element): React.JSX.Element {
  return <ThemeProvider theme={frontierTheme}>{element}</ThemeProvider>
}

describe('game decision dialogs', () => {
  it('requires the exact engine-projected discard quantity and caps the Human hand', async () => {
    const user = userEvent.setup()
    const state = createBalancedDiscardState()
    const view = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.human)
    const onSubmit = vi.fn()
    render(themed(<DiscardDecisionDialog busy={false} onSubmit={onSubmit} view={view} />))

    expect(screen.getByRole('dialog', { name: /Discard 4 resources/ })).toBeInTheDocument()
    const brick = screen.getByLabelText('Resources to discard Brick')
    await user.clear(brick)
    await user.type(brick, '4')
    await user.click(screen.getByRole('button', { name: 'Discard selected' }))
    expect(onSubmit).toHaveBeenCalledWith({ LUMBER: 0, BRICK: 4, WOOL: 0, GRAIN: 0, ORE: 0 })
  })

  it('renders a redacted incoming offer and exposes projected accept, reject, and counter actions', async () => {
    const user = userEvent.setup()
    const state = createGoldenDomesticTradeStart()
    const offer = createInitialGoldenOffer()
    const result = gameEngine.execute(state, {
      commandId: 'command:ui-dialog:offer' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: state.stateVersion,
      command: { type: 'PROPOSE_TRADE', offer },
    })
    if (!result.ok) throw new Error(`Trade fixture failed: ${result.violation.code}`)
    const view = gameEngine.createPlayerView(result.state, GOLDEN_PLAYER_IDS.human)
    const onAccept = vi.fn()
    const onReject = vi.fn()
    const onCounter = vi.fn()
    render(themed(
      <TradeResponseDialog
        busy={false}
        counterDialogOpen={false}
        onAccept={onAccept}
        onCounter={onCounter}
        onReject={onReject}
        view={view}
      />,
    ))

    expect(screen.getByText('You give: 1 Brick')).toBeInTheDocument()
    expect(screen.getByText('You receive: 1 Lumber')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Counter' }))
    expect(onCounter).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toContain('2 Brick')
  })
})
