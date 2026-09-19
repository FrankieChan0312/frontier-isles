import { ThemeProvider } from '@mui/material'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { frontierTheme } from '../../theme/frontier-theme.ts'
import { HomePage, type HomePageProps } from './HomePage.tsx'

function renderHome(overrides: Partial<HomePageProps> = {}): void {
  const props: HomePageProps = {
    busy: false,
    error: null,
    hasSavedGame: false,
    humanName: 'Explorer',
    onContinue: vi.fn(),
    onCreateOnlineRoom: vi.fn(),
    onDeleteSave: vi.fn(),
    onGenerateSeed: vi.fn(),
    onHumanNameChange: vi.fn(),
    onJoinOnlineRoom: vi.fn(),
    onOnlineRoomCodeChange: vi.fn(),
    onSeedChange: vi.fn(),
    onStart: vi.fn(),
    onlineRoomCode: '',
    seed: 'TEST-SEED',
    ...overrides,
  }
  render(
    <ThemeProvider theme={frontierTheme}>
      <HomePage {...props} />
    </ThemeProvider>,
  )
}

describe('HomePage online entry', () => {
  it('keeps Single Player and invokes online Room creation', async () => {
    const user = userEvent.setup()
    const createRoom = vi.fn()
    const startSinglePlayer = vi.fn()
    renderHome({ onCreateOnlineRoom: createRoom, onStart: startSinglePlayer })

    expect(screen.getByRole('heading', { name: 'Single Player' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Start new game' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Create online Room' }))

    expect(createRoom).toHaveBeenCalledOnce()
    expect(startSinglePlayer).not.toHaveBeenCalled()
  })

  it('normalizes a typed Room code and enables Join only at six characters', async () => {
    const user = userEvent.setup()
    const codeChange = vi.fn()
    const joinRoom = vi.fn()
    const { rerender } = render(
      <ThemeProvider theme={frontierTheme}>
        <HomePage
          busy={false}
          error={null}
          hasSavedGame={false}
          humanName="Explorer"
          onContinue={vi.fn()}
          onCreateOnlineRoom={vi.fn()}
          onDeleteSave={vi.fn()}
          onGenerateSeed={vi.fn()}
          onHumanNameChange={vi.fn()}
          onJoinOnlineRoom={joinRoom}
          onOnlineRoomCodeChange={codeChange}
          onSeedChange={vi.fn()}
          onStart={vi.fn()}
          onlineRoomCode="abc"
          seed="TEST-SEED"
        />
      </ThemeProvider>,
    )
    expect(screen.getByRole('button', { name: 'Join online Room' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Room code'), { target: { value: 'abc2d' } })
    expect(codeChange).toHaveBeenLastCalledWith('ABC2D')

    rerender(
      <ThemeProvider theme={frontierTheme}>
        <HomePage
          busy={false}
          error="Room not found."
          hasSavedGame={false}
          humanName="Explorer"
          onContinue={vi.fn()}
          onCreateOnlineRoom={vi.fn()}
          onDeleteSave={vi.fn()}
          onGenerateSeed={vi.fn()}
          onHumanNameChange={vi.fn()}
          onJoinOnlineRoom={joinRoom}
          onOnlineRoomCodeChange={codeChange}
          onSeedChange={vi.fn()}
          onStart={vi.fn()}
          onlineRoomCode="ABC234"
          seed="TEST-SEED"
        />
      </ThemeProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Room not found.')
    await user.click(screen.getByRole('button', { name: 'Join online Room' }))
    expect(joinRoom).toHaveBeenCalledOnce()
  })
})
