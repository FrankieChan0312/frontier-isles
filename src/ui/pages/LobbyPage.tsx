import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Container,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import {
  AI_PROFILE_IDS,
  aiProfileIdSchema,
  type AiProfileId,
  type RoomSnapshot,
  type SeatId,
  type SeatSnapshot,
  type StartReadinessBlockerCode,
} from '@frontier-isles/realtime-contracts'
import type { LobbyConnectionState } from '../../application/gateways/lobby-gateway.ts'

export interface LobbyPageProps {
  readonly busy: boolean
  readonly connectionState: LobbyConnectionState
  readonly error: string | null
  readonly selfSeatId: SeatId
  readonly snapshot: RoomSnapshot
  readonly onCopyRoomCode: () => void
  readonly onLeave: () => void
  readonly onReadyChange: (ready: boolean) => void
  readonly onSetAiSeat: (seatId: SeatId, profileId: AiProfileId | null) => void
}

const BLOCKER_LABELS: Readonly<Record<StartReadinessBlockerCode, string>> = {
  ROOM_NOT_WAITING: 'The Room is no longer waiting.',
  SEATS_NOT_FULL: 'Fill all four seats with Humans or AI.',
  NOT_ENOUGH_HUMANS: 'At least two Human players are required.',
  HUMANS_NOT_CONNECTED: 'Wait for every Human player to reconnect.',
  HUMANS_NOT_READY: 'Every Human player must be Ready.',
}

function connectionLabel(state: LobbyConnectionState): string {
  if (state === 'CONNECTING') return 'Connecting'
  if (state === 'CONNECTED') return 'Connected'
  if (state === 'RECONNECTING') return 'Reconnecting'
  return 'Disconnected'
}

function occupancyLabel(seat: SeatSnapshot): string {
  if (seat.occupancy === 'EMPTY') return 'Empty'
  if (seat.occupancy === 'AI') return `${seat.profileId[0]}${seat.profileId.slice(1).toLowerCase()} AI`
  return seat.displayName
}

export function LobbyPage({
  busy,
  connectionState,
  error,
  selfSeatId,
  snapshot,
  onCopyRoomCode,
  onLeave,
  onReadyChange,
  onSetAiSeat,
}: LobbyPageProps): React.JSX.Element {
  const isHost = snapshot.hostSeatId === selfSeatId

  return (
    <Box
      component="main"
      sx={{
        background: 'linear-gradient(145deg, #dcebe6, #b8d5d0)',
        minHeight: '100vh',
        overflowX: 'hidden',
        py: { xs: 2, sm: 4 },
      }}
    >
      <Container maxWidth="lg">
        <Stack spacing={2.5}>
          <Paper sx={{ p: { xs: 2.5, sm: 3.5 } }}>
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              sx={{
                alignItems: { xs: 'stretch', sm: 'center' },
                justifyContent: 'space-between',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography color="text.secondary" variant="overline">Online Multiplayer Lobby</Typography>
                <Typography component="h1" variant="h3">Frontier Isles</Typography>
                <Stack
                  direction="row"
                  sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1, mt: 1 }}
                >
                  <Typography component="span" variant="h6">Room</Typography>
                  <Chip data-testid="room-code" label={snapshot.roomCode} />
                  <Button onClick={onCopyRoomCode} size="small" variant="outlined">Copy code</Button>
                </Stack>
              </Box>
              <Stack spacing={1} sx={{ alignItems: { xs: 'flex-start', sm: 'flex-end' } }}>
                <Chip
                  color={connectionState === 'CONNECTED' ? 'success' : 'warning'}
                  label={connectionLabel(connectionState)}
                />
                <Typography color="text.secondary" variant="caption">
                  Authoritative Room revision {snapshot.revision}
                </Typography>
              </Stack>
            </Stack>
          </Paper>

          {error === null ? null : <Alert severity="error">{error}</Alert>}

          <Box
            aria-label="Room seats"
            component="section"
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
            }}
          >
            {snapshot.seats.map((seat) => {
              const ownSeat = seat.seatId === selfSeatId
              const hostSeat = seat.seatId === snapshot.hostSeatId
              return (
                <Card
                  data-connection={seat.occupancy === 'EMPTY' ? '' : seat.connectionStatus}
                  data-display-name={seat.occupancy === 'HUMAN' ? seat.displayName : ''}
                  data-host={String(hostSeat)}
                  data-occupancy={seat.occupancy}
                  data-profile={seat.occupancy === 'AI' ? seat.profileId : ''}
                  data-ready={seat.occupancy === 'EMPTY' ? '' : String(seat.ready)}
                  data-seat-id={seat.seatId}
                  data-testid={`seat-${seat.seatId}`}
                  key={seat.seatId}
                  variant="outlined"
                >
                  <CardContent>
                    <Stack spacing={1.5}>
                      <Stack
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: 'center', justifyContent: 'space-between' }}
                      >
                        <Typography component="h2" variant="h6">{seat.seatId}</Typography>
                        <Stack direction="row" spacing={0.75}>
                          {hostSeat ? <Chip color="primary" label="Host" size="small" /> : null}
                          {ownSeat ? <Chip label="You" size="small" variant="outlined" /> : null}
                        </Stack>
                      </Stack>
                      <Typography sx={{ overflowWrap: 'anywhere' }}>{occupancyLabel(seat)}</Typography>
                      {seat.occupancy === 'EMPTY' ? (
                        <Chip label="Empty" size="small" sx={{ alignSelf: 'flex-start' }} />
                      ) : (
                        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1 }}>
                          <Chip
                            color={seat.ready ? 'success' : 'default'}
                            label={seat.ready ? 'Ready' : 'Not Ready'}
                            size="small"
                          />
                          <Chip label={seat.connectionStatus.toLowerCase()} size="small" variant="outlined" />
                        </Stack>
                      )}
                      {ownSeat && seat.occupancy === 'HUMAN' ? (
                        <FormControlLabel
                          control={(
                            <Switch
                              checked={seat.ready}
                              disabled={busy || connectionState !== 'CONNECTED'}
                              onChange={(event) => onReadyChange(event.target.checked)}
                            />
                          )}
                          label="I am Ready"
                        />
                      ) : null}
                      {isHost && seat.occupancy !== 'HUMAN' ? (
                        <FormControl disabled={busy || connectionState !== 'CONNECTED'} fullWidth size="small">
                          <InputLabel id={`ai-profile-${seat.seatId}`}>AI profile for {seat.seatId}</InputLabel>
                          <Select
                            label={`AI profile for ${seat.seatId}`}
                            labelId={`ai-profile-${seat.seatId}`}
                            onChange={(event) => {
                              const value: string = event.target.value
                              onSetAiSeat(seat.seatId, value === '' ? null : aiProfileIdSchema.parse(value))
                            }}
                            value={seat.occupancy === 'AI' ? seat.profileId : ''}
                          >
                            <MenuItem value="">Empty</MenuItem>
                            {AI_PROFILE_IDS.map((profileId) => (
                              <MenuItem key={profileId} value={profileId}>{profileId}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      ) : null}
                    </Stack>
                  </CardContent>
                </Card>
              )
            })}
          </Box>

          <Paper sx={{ p: { xs: 2.5, sm: 3 } }}>
            <Stack spacing={2}>
              <Box>
                <Typography component="h2" variant="h6">Start readiness</Typography>
                {snapshot.startReadiness.ready ? (
                  <Typography color="success.main">All future start conditions are met.</Typography>
                ) : (
                  <Stack component="ul" spacing={0.5} sx={{ mb: 0, mt: 1, pl: 2.5 }}>
                    {snapshot.startReadiness.blockers.map((blocker) => (
                      <Typography component="li" key={blocker} variant="body2">
                        {BLOCKER_LABELS[blocker]}
                      </Typography>
                    ))}
                  </Stack>
                )}
              </Box>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button disabled fullWidth variant="contained">Start Game — Milestone B</Button>
                <Button color="error" disabled={busy} onClick={onLeave} variant="outlined">
                  Leave Room
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </Stack>
      </Container>
    </Box>
  )
}
