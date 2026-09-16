import { ThemeProvider } from '@mui/material'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  REALTIME_PROTOCOL_VERSION,
  roomSnapshotSchema,
} from '@frontier-isles/realtime-contracts'
import { frontierTheme } from '../../theme/frontier-theme.ts'
import { LobbyPage } from './LobbyPage.tsx'

const SNAPSHOT = roomSnapshotSchema.parse({
  protocolVersion: REALTIME_PROTOCOL_VERSION,
  roomCode: 'ABC234',
  revision: 1,
  lifecycleStatus: 'WAITING',
  hostSeatId: 'NORTH',
  seats: [
    {
      seatId: 'NORTH',
      occupancy: 'HUMAN',
      displayName: 'Ada',
      ready: false,
      connectionStatus: 'CONNECTED',
    },
    {
      seatId: 'EAST',
      occupancy: 'HUMAN',
      displayName: 'Grace',
      ready: true,
      connectionStatus: 'CONNECTED',
    },
    { seatId: 'SOUTH', occupancy: 'EMPTY' },
    { seatId: 'WEST', occupancy: 'EMPTY' },
  ],
  startReadiness: {
    ready: false,
    blockers: ['SEATS_NOT_FULL', 'HUMANS_NOT_READY'],
  },
})

describe('LobbyPage', () => {
  it.each(['NORTH', 'EAST'] as const)('enables an eligible start only for the Host, viewed from %s', async (selfSeatId) => {
    const onStart = vi.fn()
    const snapshot = roomSnapshotSchema.parse({ ...SNAPSHOT, seats: [
      { ...SNAPSHOT.seats[0], ready: true }, SNAPSHOT.seats[1],
      { seatId: 'SOUTH', occupancy: 'AI', profileId: 'BUILDER', ready: true, connectionStatus: 'CONNECTED' },
      { seatId: 'WEST', occupancy: 'AI', profileId: 'MERCHANT', ready: true, connectionStatus: 'CONNECTED' },
    ], startReadiness: { ready: true, blockers: [] } })
    render(<ThemeProvider theme={frontierTheme}><LobbyPage busy={false} connectionState="CONNECTED"
      error={null} onCopyRoomCode={vi.fn()} onLeave={vi.fn()} onStart={onStart} onReadyChange={vi.fn()}
      onSetAiSeat={vi.fn()} selfSeatId={selfSeatId} snapshot={snapshot} /></ThemeProvider>)
    const button = screen.getByRole('button', { name: 'Start Game' })
    expect(screen.getByRole('status', { name: 'Lobby guidance' })).toHaveTextContent(selfSeatId === 'NORTH'
      ? 'All start conditions are met.' : 'Waiting for the Host to start.')
    if (selfSeatId === 'NORTH') {
      expect(button).toBeEnabled()
      await userEvent.setup().click(button)
      expect(onStart).toHaveBeenCalledOnce()
    } else expect(button).toBeDisabled()
  })

  it.each(['CONNECTING', 'RECONNECTING', 'DISCONNECTED', 'BUSY'] as const)('does not invite a ready viewer to start while %s', (state) => {
    const snapshot = roomSnapshotSchema.parse({ ...SNAPSHOT, seats: [
      { ...SNAPSHOT.seats[0], ready: true }, SNAPSHOT.seats[1],
      { seatId: 'SOUTH', occupancy: 'AI', profileId: 'BUILDER', ready: true, connectionStatus: 'CONNECTED' },
      { seatId: 'WEST', occupancy: 'AI', profileId: 'MERCHANT', ready: true, connectionStatus: 'CONNECTED' },
    ], startReadiness: { ready: true, blockers: [] } })
    render(<ThemeProvider theme={frontierTheme}><LobbyPage busy={state === 'BUSY'} connectionState={state === 'BUSY' ? 'CONNECTED' : state}
      error={null} onCopyRoomCode={vi.fn()} onLeave={vi.fn()} onStart={vi.fn()} onReadyChange={vi.fn()}
      onSetAiSeat={vi.fn()} selfSeatId="NORTH" snapshot={snapshot} /></ThemeProvider>)
    expect(screen.getByRole('status', { name: 'Lobby guidance' })).toHaveTextContent(state === 'BUSY'
      ? 'Updating the Room. Please wait.' : 'Waiting for the current Room state.')
    expect(screen.queryByText('All start conditions are met.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeDisabled()
  })

  it('renders four canonical seats, connection/readiness, and an ineligible start boundary', () => {
    render(
      <ThemeProvider theme={frontierTheme}>
        <LobbyPage
          busy={false}
          connectionState="CONNECTED"
          error="A public-safe failure."
          onCopyRoomCode={vi.fn()}
          onLeave={vi.fn()}
          onStart={vi.fn()}
          onReadyChange={vi.fn()}
          onSetAiSeat={vi.fn()}
          selfSeatId="NORTH"
          snapshot={SNAPSHOT}
        />
      </ThemeProvider>,
    )

    expect(screen.getByTestId('room-code')).toHaveTextContent('ABC234')
    expect(screen.getByRole('alert')).toHaveTextContent('A public-safe failure.')
    expect(screen.getAllByTestId(/^seat-/u).map((seat) => seat.getAttribute('data-testid'))).toEqual([
      'seat-NORTH',
      'seat-EAST',
      'seat-SOUTH',
      'seat-WEST',
    ])
    expect(within(screen.getByTestId('seat-NORTH')).getByText('Host')).toBeVisible()
    expect(screen.getByText('Fill all four seats with Humans or AI.')).toBeVisible()
    expect(screen.getByText('Every Human player must be Ready.')).toBeVisible()
    expect(screen.getByRole('status', { name: 'Lobby guidance' })).toHaveTextContent('Waiting for the start conditions below.')
    expect(screen.getByRole('button', { name: 'Start Game' })).toBeDisabled()
  })

  it('routes only own Ready and Host AI controls through callbacks', async () => {
    const user = userEvent.setup()
    const readyChange = vi.fn()
    const setAiSeat = vi.fn()
    render(
      <ThemeProvider theme={frontierTheme}>
        <LobbyPage
          busy={false}
          connectionState="CONNECTED"
          error={null}
          onCopyRoomCode={vi.fn()}
          onLeave={vi.fn()}
          onStart={vi.fn()}
          onReadyChange={readyChange}
          onSetAiSeat={setAiSeat}
          selfSeatId="NORTH"
          snapshot={SNAPSHOT}
        />
      </ThemeProvider>,
    )

    await user.click(screen.getByRole('switch', { name: 'I am Ready' }))
    expect(readyChange).toHaveBeenCalledWith(true)
    expect(screen.getAllByRole('combobox')).toHaveLength(2)

    await user.click(screen.getByLabelText('AI profile for SOUTH'))
    await user.click(screen.getByRole('option', { name: 'BUILDER' }))
    expect(setAiSeat).toHaveBeenCalledWith('SOUTH', 'BUILDER')
  })
})
