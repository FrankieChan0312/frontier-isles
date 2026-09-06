import { render, screen } from '@testing-library/react'
import { gameEngine } from '@frontier-isles/game-core/engine/game-engine'
import { createCompletedGoldenSetup, GOLDEN_PLAYER_IDS } from '@frontier-isles/game-core/engine/task-05-golden-fixture.test-helper'
import { PlayerPanels } from './PlayerPanels.tsx'

it('distinguishes the viewer from another Human using only public opponent fields', () => {
  const view = gameEngine.createPlayerView(createCompletedGoldenSetup(), GOLDEN_PLAYER_IDS.human)
  const onlineView = { ...view, opponents: view.opponents.map((player, index) => index === 0
    ? { ...player, controller: { type: 'HUMAN' as const } } : player) }
  render(<PlayerPanels view={onlineView} />)
  expect(screen.getAllByText('You')).toHaveLength(1)
  expect(screen.getAllByText('Human')).toHaveLength(1)
  expect(screen.getByRole('region', { name: 'Players' })).not.toHaveTextContent('actualVictoryPoints')
})
