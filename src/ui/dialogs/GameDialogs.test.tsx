import { ThemeProvider } from '@mui/material'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { CommandId, TileId, TradeId } from '@frontier-isles/game-core/model/ids'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { createBalancedDiscardState, createNoDiscardRobberMoveState } from '@frontier-isles/game-core/engine/task-07-controlled-seven.test-helper'
import {
  createGoldenDomesticTradeStart,
  createInitialGoldenOffer,
} from '@frontier-isles/game-core/engine/task-11-trading.test-helper'
import { GOLDEN_PLAYER_IDS } from '@frontier-isles/game-core/engine/task-05-golden-fixture.test-helper'
import { frontierTheme } from '../../theme/frontier-theme.ts'
import {
  DiscardDecisionDialog,
  DomesticTradeDialog,
  TradeResponseDialog,
  RobberTargetDialog,
} from './GameDialogs.tsx'

function themed(element: React.JSX.Element): React.JSX.Element {
  return <ThemeProvider theme={frontierTheme}>{element}</ThemeProvider>
}

describe('game decision dialogs', () => {
  it('opens robber target controls only for the projected acting player', () => {
    const state = createNoDiscardRobberMoveState()
    const result = gameEngine.execute(state, {
      commandId: 'command:ui:robber-actor' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: state.stateVersion,
      command: { type: 'MOVE_ROBBER', tileId: 'tile:-2,2' as TileId },
    })
    if (!result.ok) throw new Error(`Robber fixture failed: ${result.violation.code}`)
    const observer = gameEngine.createPlayerView(result.state, GOLDEN_PLAYER_IDS.human)
    expect(observer.pendingDecision?.type).toBe('CHOOSE_ROBBER_TARGET')
    const { rerender } = render(themed(<RobberTargetDialog busy={false} onSubmit={vi.fn()} view={observer} />))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const actor = gameEngine.createPlayerView(result.state, GOLDEN_PLAYER_IDS.sentinel)
    rerender(themed(<RobberTargetDialog busy={false} onSubmit={vi.fn()} view={actor} />))
    expect(screen.getByRole('dialog', { name: 'Choose a player to steal from' })).toBeInTheDocument()
  })

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

  it('replaces both sides of an AI offer without capping requests to the Human hand', async () => {
    const user = userEvent.setup()
    const state = createGoldenDomesticTradeStart()
    const offer = createInitialGoldenOffer()
    const proposal = gameEngine.execute(state, {
      commandId: 'command:ui-dialog:counter-editor' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: state.stateVersion,
      command: { type: 'PROPOSE_TRADE', offer },
    })
    if (!proposal.ok) throw new Error(`Trade fixture failed: ${proposal.violation.code}`)
    const view = gameEngine.createPlayerView(proposal.state, GOLDEN_PLAYER_IDS.human)
    const onSubmit = vi.fn()
    render(themed(
      <DomesticTradeDialog
        busy={false}
        onClose={vi.fn()}
        onSubmit={onSubmit}
        open
        previousOffer={offer}
        tradeId={'trade:ui:replacement-counter' as TradeId}
        view={view}
      />,
    ))

    expect(screen.getByText('Replace the complete terms with Sentinel.')).toBeInTheDocument()
    const aiWool = screen.getByLabelText('AI gives / You receive Wool')
    const humanBrick = screen.getByLabelText('You give / AI receives Brick')
    expect(aiWool).not.toHaveAttribute('max')
    expect(humanBrick).toHaveAttribute('max', '2')

    await user.clear(aiWool)
    await user.type(aiWool, '2')
    await user.clear(humanBrick)
    await user.type(humanBrick, '2')
    await user.click(screen.getByRole('button', { name: 'Send counter' }))

    expect(onSubmit).toHaveBeenCalledWith({
      ...offer,
      tradeId: 'trade:ui:replacement-counter',
      proposedById: GOLDEN_PLAYER_IDS.human,
      parentTradeId: offer.tradeId,
      initiatorGives: { ...offer.initiatorGives, WOOL: 2 },
      counterpartyGives: { ...offer.counterpartyGives, BRICK: 2 },
    })
  })

  it('blocks empty and overlapping counter terms with non-private explanations', async () => {
    const user = userEvent.setup()
    const state = createGoldenDomesticTradeStart()
    const offer = createInitialGoldenOffer()
    const proposal = gameEngine.execute(state, {
      commandId: 'command:ui-dialog:counter-validation' as CommandId,
      actorId: GOLDEN_PLAYER_IDS.sentinel,
      expectedStateVersion: state.stateVersion,
      command: { type: 'PROPOSE_TRADE', offer },
    })
    if (!proposal.ok) throw new Error(`Trade fixture failed: ${proposal.violation.code}`)
    const view = gameEngine.createPlayerView(proposal.state, GOLDEN_PLAYER_IDS.human)
    render(themed(
      <DomesticTradeDialog
        busy={false}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        open
        previousOffer={offer}
        tradeId={'trade:ui:invalid-counter' as TradeId}
        view={view}
      />,
    ))

    const aiBrick = screen.getByLabelText('AI gives / You receive Brick')
    await user.clear(aiBrick)
    await user.type(aiBrick, '1')
    expect(screen.getByText('The same resource cannot appear on both sides.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send counter' })).toBeDisabled()
    expect(document.body.textContent).not.toContain('Sentinel has')
  })
})
