import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Container,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'

export interface HomePageProps {
  readonly humanName: string
  readonly seed: string
  readonly hasSavedGame: boolean
  readonly busy: boolean
  readonly error: string | null
  readonly onHumanNameChange: (name: string) => void
  readonly onSeedChange: (seed: string) => void
  readonly onGenerateSeed: () => void
  readonly onStart: () => void
  readonly onContinue: () => void
  readonly onDeleteSave: () => void
}

export function HomePage({
  humanName,
  seed,
  hasSavedGame,
  busy,
  error,
  onHumanNameChange,
  onSeedChange,
  onGenerateSeed,
  onStart,
  onContinue,
  onDeleteSave,
}: HomePageProps): React.JSX.Element {
  return (
    <Box
      component="main"
      sx={{
        alignItems: 'center',
        background: 'radial-gradient(circle at 15% 20%, #f8e6b5 0, transparent 30%), linear-gradient(145deg, #dcebe6, #b8d5d0)',
        display: 'flex',
        minHeight: '100vh',
        overflowX: 'hidden',
        py: { xs: 2, sm: 5 },
      }}
    >
      <Container maxWidth="sm">
        <Paper elevation={10} sx={{ overflow: 'hidden' }}>
          <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', px: { xs: 3, sm: 5 }, py: 4 }}>
            <Typography component="p" sx={{ letterSpacing: 3, opacity: 0.8 }} variant="overline">
              An original island strategy game
            </Typography>
            <Typography component="h1" variant="h2">Frontier Isles</Typography>
            <Typography sx={{ mt: 1 }} variant="h6">Build routes, trade wisely, reach ten points.</Typography>
          </Box>
          <Stack spacing={2.5} sx={{ p: { xs: 3, sm: 5 } }}>
            {error === null ? null : <Alert severity="error">{error}</Alert>}
            <TextField
              autoComplete="name"
              fullWidth
              slotProps={{ htmlInput: { maxLength: 32 } }}
              label="Your name"
              onChange={(event) => onHumanNameChange(event.target.value)}
              value={humanName}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                fullWidth
                helperText="The displayed seed reproduces board and dice randomness."
                slotProps={{ htmlInput: { maxLength: 64 } }}
                label="Game seed"
                onChange={(event) => onSeedChange(event.target.value)}
                value={seed}
              />
              <Button disabled={busy} onClick={onGenerateSeed} sx={{ minWidth: 142 }} variant="outlined">
                Generate seed
              </Button>
            </Stack>
            <Button
              disabled={busy || seed.trim().length === 0}
              onClick={onStart}
              size="large"
              variant="contained"
            >
              {busy ? 'Preparing the isles…' : 'Start new game'}
            </Button>
            {hasSavedGame ? (
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <Button disabled={busy} fullWidth onClick={onContinue} variant="outlined">
                  Continue saved game
                </Button>
                <Button color="error" disabled={busy} onClick={onDeleteSave}>
                  Delete save
                </Button>
              </Stack>
            ) : null}
            <Accordion disableGutters elevation={0}>
              <AccordionSummary aria-controls="quick-rules" id="quick-rules-heading">
                <Typography sx={{ fontWeight: 700 }}>How to play</Typography>
              </AccordionSummary>
              <AccordionDetails id="quick-rules">
                <Typography color="text.secondary" variant="body2">
                  Place two starting settlements and roads. On each turn roll, collect resources,
                  then build or trade. Roads extend your network; settlements and cities earn
                  points. Development cards grant one-time advantages. Move the robber after a
                  seven. The first player to ten points wins. Highlighted board targets are the
                  legal choices for your current decision.
                </Typography>
              </AccordionDetails>
            </Accordion>
          </Stack>
        </Paper>
      </Container>
    </Box>
  )
}
