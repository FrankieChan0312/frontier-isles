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
  it('renders four canonical seats, connection/readiness, and Milestone B start boundary', () => {
    render(
      <ThemeProvider theme={frontierTheme}>
        <LobbyPage
          busy={false}
          connectionState="CONNECTED"
          error="A public-safe failure."
          onCopyRoomCode={vi.fn()}
          onLeave={vi.fn()}
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
    expect(screen.getByRole('button', { name: 'Start Game — Milestone B' })).toBeDisabled()
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
