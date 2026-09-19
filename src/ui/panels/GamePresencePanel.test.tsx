import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deriveStartReadiness, roomSeatsSchema, roomSnapshotSchema, REALTIME_PROTOCOL_VERSION } from '@frontier-isles/realtime-contracts'
import { GamePresencePanel } from './GamePresencePanel.tsx'

function snapshot(expired = false) {
  const seats = roomSeatsSchema.parse([
    { seatId: 'NORTH', occupancy: 'HUMAN', displayName: 'Host', ready: true, connectionStatus: 'CONNECTED' },
    { seatId: 'EAST', occupancy: 'HUMAN', displayName: 'East Human', ready: true, connectionStatus: expired ? 'DISCONNECTED' : 'RECONNECTING' },
    ...(['SOUTH', 'WEST'] as const).map((seatId) => ({ seatId, occupancy: 'AI', profileId: 'BUILDER', ready: true, connectionStatus: 'CONNECTED' })),
  ])
  return roomSnapshotSchema.parse({ protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: 'ABC234', revision: 8,
    gameId: 'game:presence', lifecycleStatus: 'ACTIVE', hostSeatId: 'NORTH', seats,
    startReadiness: deriveStartReadiness(seats, 'ACTIVE'), gamePresence: {
      lifecycleStatus: expired ? 'PAUSED_REPLACEMENT_REQUIRED' : 'PAUSED_RECONNECTING',
      disconnectedSeats: [{ seatId: 'EAST', reconnectDeadlineMs: Date.now() + 1_000, replacementRequired: expired }],
      replacements: [], abandonedDeadlineMs: expired ? Date.now() + 100_000 : null,
    } })
}
afterEach(() => { vi.useRealTimers() })
describe('public paused-game controls', () => {
  it('shows a countdown without granting authority when the local clock reaches zero and clears its timer', () => {
    vi.useFakeTimers()
    const replace = vi.fn()
    const view = render(<GamePresencePanel snapshot={snapshot()} selfSeatId="NORTH" connected busy={false} onReplace={replace} onClose={vi.fn()} />)
    expect(screen.getByRole('status', { name: 'Game presence' })).toHaveTextContent('Game paused')
    expect(screen.getByText(/Reconnect within 1s/)).toBeVisible()
    act(() => { vi.advanceTimersByTime(2_000) })
    expect(screen.getByText(/Waiting for the server to confirm/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /Replace/ })).toBeNull()
    expect(replace).not.toHaveBeenCalled()
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('sends only the public seat and explicitly selected profile through the Host control', () => {
    const replace = vi.fn()
    const close = vi.fn()
    render(<GamePresencePanel snapshot={snapshot(true)} selfSeatId="NORTH" connected busy={false} onReplace={replace} onClose={close} />)
    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'AI profile for EAST' }))
    fireEvent.click(screen.getByRole('option', { name: 'Sentinel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Replace EAST with AI' }))
    expect(replace).toHaveBeenCalledExactlyOnceWith('EAST', 'SENTINEL')
    fireEvent.click(screen.getByRole('button', { name: 'Close Game' }))
    expect(close).toHaveBeenCalledOnce()
    expect(document.body.textContent).not.toMatch(/resources|developmentCards|sessionId|token|GameState/u)
  })
  it('shows the waiting-for-Host message and disables Host actions on a detached connection', () => {
    const props = { snapshot: snapshot(true), connected: true, busy: false, onReplace: vi.fn(), onClose: vi.fn() }
    const view = render(<GamePresencePanel {...props} selfSeatId="EAST" />)
    expect(screen.getByText(/Waiting for the Host/)).toBeVisible()
    expect(screen.queryByRole('button', { name: /Replace/ })).toBeNull()
    view.rerender(<GamePresencePanel {...props} selfSeatId="NORTH" connected={false} />)
    expect(screen.getByRole('button', { name: /Replace/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Close Game' })).toBeDisabled()
    expect(screen.getByRole('status', { name: 'Game presence' })).toHaveTextContent('Disconnected')
  })
  it('announces that the game is active again after presence clears', () => {
    const paused = snapshot()
    const props = { connected: true, busy: false, onReplace: vi.fn(), onClose: vi.fn(), selfSeatId: 'NORTH' as const }
    const view = render(<GamePresencePanel {...props} snapshot={paused} />)
    const seats = roomSeatsSchema.parse(paused.seats.map((seat) => seat.occupancy === 'HUMAN' ? { ...seat, connectionStatus: 'CONNECTED' } : seat))
    const active = roomSnapshotSchema.parse({ ...paused, seats, startReadiness: deriveStartReadiness(seats, 'ACTIVE'),
      gamePresence: { lifecycleStatus: 'ACTIVE', disconnectedSeats: [], replacements: [], abandonedDeadlineMs: null } })
    view.rerender(<GamePresencePanel {...props} snapshot={active} />)
    expect(screen.getByRole('status', { name: 'Game presence' })).toHaveTextContent('Game active. All required Humans are connected.')
    expect(screen.queryByText(/Reconnect within/)).toBeNull()
  })
})
