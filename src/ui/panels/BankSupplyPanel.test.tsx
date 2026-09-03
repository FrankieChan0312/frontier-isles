import { render, screen } from '@testing-library/react'
import { gameEngine } from '../../game/engine/game-engine.ts'
import { GOLDEN_PLAYER_IDS } from '../../game/engine/task-05-golden-fixture.test-helper.ts'
import { createGoldenDomesticTradeStart } from '../../game/engine/task-11-trading.test-helper.ts'
import { BankSupplyPanel } from './BankSupplyPanel.tsx'

describe('BankSupplyPanel', () => {
  it('renders every public supply count, including zero, without deck identities', () => {
    const state = createGoldenDomesticTradeStart()
    const view = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.human)
    const zeroView = {
      ...view,
      publicGame: {
        ...view.publicGame,
        bank: {
          resources: { ...view.publicGame.bank.resources, ORE: 0 },
          developmentDeckCount: 0,
        },
      },
    }
    const { container } = render(<BankSupplyPanel view={zeroView} />)

    expect(screen.getByRole('region', { name: 'Bank / Supply' })).toBeVisible()
    expect(screen.getByLabelText('Lumber remaining: 17')).toBeVisible()
    expect(screen.getByLabelText('Brick remaining: 17')).toBeVisible()
    expect(screen.getByLabelText('Wool remaining: 18')).toBeVisible()
    expect(screen.getByLabelText('Grain remaining: 18')).toBeVisible()
    expect(screen.getByLabelText('Ore remaining: 0')).toHaveTextContent('0')
    expect(screen.getByLabelText('Development Cards remaining: 0')).toHaveTextContent('0')
    expect(container.innerHTML).not.toContain('development-card:')
    expect(container.innerHTML).not.toContain('developmentDeck')
  })

  it('updates directly from the latest PlayerView rather than retaining UI-owned counts', () => {
    const state = createGoldenDomesticTradeStart()
    const view = gameEngine.createPlayerView(state, GOLDEN_PLAYER_IDS.human)
    const { rerender } = render(<BankSupplyPanel view={view} />)
    expect(screen.getByLabelText('Brick remaining: 17')).toBeVisible()

    rerender(<BankSupplyPanel view={{
      ...view,
      publicGame: {
        ...view.publicGame,
        bank: {
          ...view.publicGame.bank,
          resources: { ...view.publicGame.bank.resources, BRICK: 19 },
        },
      },
    }} />)

    expect(screen.getByLabelText('Brick remaining: 19')).toBeVisible()
    expect(screen.queryByLabelText('Brick remaining: 17')).not.toBeInTheDocument()
  })
})
