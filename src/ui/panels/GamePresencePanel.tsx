import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Stack, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { AI_PROFILE_IDS, aiProfileIdSchema, type AiProfileId, type RoomSnapshot, type SeatId } from '@frontier-isles/realtime-contracts'

export interface GamePresencePanelProps {
  readonly snapshot: RoomSnapshot
  readonly selfSeatId: SeatId
  readonly connected: boolean
  readonly busy: boolean
  readonly onReplace: (seatId: SeatId, profileId: AiProfileId) => void
  readonly onClose: () => void
}

export function GamePresencePanel({ snapshot, selfSeatId, connected, busy, onReplace, onClose }: GamePresencePanelProps): React.JSX.Element | null {
  const presence = snapshot.gamePresence
  const [now, setNow] = useState(() => Date.now())
  const [profiles, setProfiles] = useState<Readonly<Partial<Record<SeatId, AiProfileId>>>>({})
  const reconnecting = presence?.disconnectedSeats.some((seat) => !seat.replacementRequired) ?? false
  useEffect(() => {
    if (!reconnecting) return
    const timer = setInterval(() => { setNow(Date.now()) }, 1_000)
    return () => { clearInterval(timer) }
  }, [reconnecting])
  if (presence === undefined || presence.lifecycleStatus === 'FINISHED' || presence.lifecycleStatus === 'CLOSED') return null
  const paused = presence.lifecycleStatus === 'PAUSED_RECONNECTING' || presence.lifecycleStatus === 'PAUSED_REPLACEMENT_REQUIRED'
  const isHost = snapshot.hostSeatId === selfSeatId
  return <Box component="section" aria-label="Online game presence" sx={{ mb: 2, minWidth: 0 }}>
    <Alert aria-label="Game presence" aria-live="polite" role="status" severity={paused || !connected ? 'warning' : 'info'}>
      {!connected ? 'Disconnected. Waiting to resume your Room session.' : paused ? presence.lifecycleStatus === 'PAUSED_REPLACEMENT_REQUIRED'
        ? 'Game paused. A Human seat needs a replacement decision.' : 'Game paused. Waiting for Humans to reconnect.'
        : presence.lifecycleStatus === 'ERROR' ? 'The server could not continue this game.' : 'Game active. All required Humans are connected.'}
    </Alert>
    {presence.disconnectedSeats.length === 0 ? null : <Stack spacing={1.5} sx={{ mt: 1.5 }}>
      {presence.disconnectedSeats.map((disconnected) => {
        const seat = snapshot.seats.find((candidate) => candidate.seatId === disconnected.seatId)
        const name = seat?.occupancy === 'HUMAN' ? seat.displayName : disconnected.seatId
        const remaining = Math.max(0, Math.ceil((disconnected.reconnectDeadlineMs - now) / 1_000))
        const profileId = profiles[disconnected.seatId] ?? 'BUILDER'
        return <Stack key={disconnected.seatId} direction={{ xs: 'column', sm: 'row' }} spacing={1.5}
          sx={{ alignItems: { xs: 'stretch', sm: 'center' }, minWidth: 0 }}>
          <Typography sx={{ flex: 1, overflowWrap: 'anywhere' }}>{name} ({disconnected.seatId}): {disconnected.replacementRequired
            ? 'Reconnect grace expired. Replacement required.' : remaining > 0 ? `Disconnected. Reconnect within ${remaining}s.` : 'Waiting for the server to confirm reconnect expiry.'}</Typography>
          {!disconnected.replacementRequired || !isHost ? null : <>
            <FormControl disabled={busy || !connected} size="small" sx={{ minWidth: { xs: 0, sm: 175 } }}>
              <InputLabel id={`replacement-profile-${disconnected.seatId}`}>AI profile for {disconnected.seatId}</InputLabel>
              <Select labelId={`replacement-profile-${disconnected.seatId}`} label={`AI profile for ${disconnected.seatId}`} value={profileId}
                onChange={(event) => { const parsed = aiProfileIdSchema.safeParse(event.target.value); if (parsed.success) setProfiles((previous) => ({ ...previous, [disconnected.seatId]: parsed.data })) }}>
                {AI_PROFILE_IDS.map((id) => <MenuItem key={id} value={id}>{id[0]}{id.slice(1).toLowerCase()}</MenuItem>)}
              </Select>
            </FormControl>
            <Button disabled={busy || !connected} onClick={() => onReplace(disconnected.seatId, profileId)} variant="contained">Replace {disconnected.seatId} with AI</Button>
          </>}
        </Stack>
      })}
      {presence.lifecycleStatus !== 'PAUSED_REPLACEMENT_REQUIRED' ? null : <>
        <Typography variant="body2">AI replacement keeps the same player position and is permanent for this game.</Typography>
        {isHost ? <Button disabled={busy || !connected} onClick={onClose} sx={{ alignSelf: 'flex-start' }} color="error" variant="outlined">Close Game</Button>
          : <Typography>Waiting for the Host to replace the expired seat or close the game.</Typography>}
      </>}
    </Stack>}
    {presence.replacements.map((replacement) => <Typography key={replacement.seatId} sx={{ mt: 1 }} variant="body2">
      {replacement.seatId} is now controlled by {replacement.profileId[0]}{replacement.profileId.slice(1).toLowerCase()} AI.
    </Typography>)}
  </Box>
}
