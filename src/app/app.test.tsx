import { ThemeProvider } from '@mui/material'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { CommandEnvelope } from '../game/contracts/commands.ts'
import type { PlayerEventView } from '../game/contracts/player-events.ts'
import type { PlayerView } from '../game/contracts/views.ts'
import type { GameConfig } from '../game/model/game-config.ts'
import type { GameState } from '../game/model/game-state.ts'
import type { PlayerId } from '../game/model/ids.ts'
import { gameEngine } from '../game/engine/game-engine.ts'
import { createPlayerEventViews } from '../game/selectors/player-event-view.ts'
import type {
  CommandResponse,
  GameGateway,
  GameUpdate,
} from '../application/gateways/game-gateway.ts'
import { frontierTheme } from '../theme/frontier-theme.ts'
import { createBrowserGameConfig } from './browser-game.ts'
import { App } from './app.tsx'

function humanStartSeed(): string {
  for (let index = 0; index < 100; index += 1) {
    const seed = `UI-START-${index}`
    const state = gameEngine.createGame(createBrowserGameConfig('Avery', seed), seed)
    const first = state.players[state.turn.currentPlayerId]
    if (first?.controller.type === 'HUMAN') return seed
  }
  throw new Error('No deterministic Human-start seed found.')
}

class TestGameGateway implements GameGateway {
  readonly submitted: CommandEnvelope[] = []
  readonly #listeners = new Set<(update: GameUpdate) => void>()
  #state: GameState | null = null
  #humanPlayerId: PlayerId | null = null
  #saved = false

  constructor(saved = false) {
    this.#saved = saved
  }

  subscribe(listener: (update: GameUpdate) => void): () => void {
    this.#listeners.add(listener)
    listener(this.#update([]))
    return () => this.#listeners.delete(listener)
  }

  createGame(config: GameConfig, seed: string): Promise<PlayerView> {
    this.#state = gameEngine.createGame(config, seed)
    const human = Object.values(this.#state.players).find((player) => player.controller.type === 'HUMAN')
    if (human === undefined) throw new Error('Test config needs a Human.')
    this.#humanPlayerId = human.id
    this.#saved = true
    this.#publish([])
    return Promise.resolve(this.#view())
  }

  submit(envelope: CommandEnvelope): Promise<CommandResponse> {
    this.submitted.push(envelope)
    const state = this.#requireState()
    const result = gameEngine.execute(state, envelope)
    if (!result.ok) return Promise.resolve({ ok: false, violation: result.violation, view: this.#view() })
    this.#state = result.state
    const events = createPlayerEventViews(result.events, this.#requireHuman())
    this.#publish(events)
    return Promise.resolve({ ok: true, view: this.#view(), events })
  }

  saveGame(): Promise<void> {
    this.#saved = true
    this.#publish([])
    return Promise.resolve()
  }

  loadGame(): Promise<PlayerView> {
    return this.loadLatestGame()
  }

  loadLatestGame(): Promise<PlayerView> {
    if (this.#state === null) {
      const seed = humanStartSeed()
      return this.createGame(createBrowserGameConfig('Saved Explorer', seed), seed)
    }
    this.#publish([])
    return Promise.resolve(this.#view())
  }

  hasSavedGame(): Promise<boolean> {
    return Promise.resolve(this.#saved)
  }

  deleteSavedGame(): Promise<void> {
    this.#saved = false
    return Promise.resolve()
  }

  #requireState(): GameState {
    if (this.#state === null) throw new Error('No test game.')
    return this.#state
  }

  #requireHuman(): PlayerId {
    if (this.#humanPlayerId === null) throw new Error('No test Human.')
    return this.#humanPlayerId
  }

  #view(): PlayerView {
    return gameEngine.createPlayerView(this.#requireState(), this.#requireHuman())
  }

  #update(events: readonly PlayerEventView[]): GameUpdate {
    return {
      view: this.#state === null ? null : this.#view(),
      events,
      connectionStatus: this.#state === null ? 'IDLE' : 'READY',
      aiThinking: false,
      saveStatus: this.#saved ? 'SAVED' : 'IDLE',
      error: null,
    }
  }

  #publish(events: readonly PlayerEventView[]): void {
    const update = this.#update(events)
    for (const listener of this.#listeners) listener(update)
  }
}

function renderApp(gateway: GameGateway, seed: string): ReturnType<typeof render> {
  return render(
    <ThemeProvider theme={frontierTheme}>
      <App gateway={gateway} seedFactory={() => seed} />
    </ThemeProvider>,
  )
}

describe('App', () => {
  it('starts a gateway-backed game and submits an engine-projected SVG setup target', async () => {
    const user = userEvent.setup()
    const gateway = new TestGameGateway()
    const seed = humanStartSeed()
    const { container } = renderApp(gateway, seed)

    expect(screen.getByRole('heading', { level: 1, name: 'Frontier Isles' })).toBeInTheDocument()
    expect(screen.getByLabelText('Your name')).toHaveValue('Explorer')
    expect(screen.getByLabelText('Game seed')).toHaveValue(seed)
    expect(screen.getByText(/displayed seed reproduces board/i)).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Your name'))
    await user.type(screen.getByLabelText('Your name'), 'Avery')
    await user.click(screen.getByRole('button', { name: 'Start new game' }))

    expect(await screen.findByRole('img', { name: /Frontier Isles game board/ })).toBeInTheDocument()
    expect(screen.getByText(/Turn 0 · Avery · Setup settlement/)).toBeInTheDocument()
    expect(container.querySelectorAll('[data-layer="tiles"] [data-tile-id]')).toHaveLength(19)
    const legalTargets = await screen.findAllByRole('button', { name: /Build on vertex:/ })
    const firstTarget = legalTargets[0]
    if (firstTarget === undefined) throw new Error('Expected a legal SVG setup target.')
    await user.click(firstTarget)

    await waitFor(() => expect(gateway.submitted[0]?.command.type).toBe('PLACE_INITIAL_SETTLEMENT'))
    expect(document.body.textContent).not.toContain('developmentDeck')
    expect(document.body.textContent).not.toContain('random')
  })

  it('continues and deletes a saved game from the Home screen', async () => {
    const user = userEvent.setup()
    const seed = humanStartSeed()
    const gateway = new TestGameGateway(true)
    renderApp(gateway, seed)

    const continueButton = await screen.findByRole('button', { name: 'Continue saved game' })
    await user.click(continueButton)
    expect((await screen.findAllByText(/Saved Explorer/)).length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'New game' }))
    await user.click(await screen.findByRole('button', { name: 'Delete save' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Continue saved game' })).not.toBeInTheDocument())
  })
})
