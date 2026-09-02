import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material'
import { GameBoard } from '../ui/board/GameBoard.tsx'
import { STANDARD_BOARD_PREVIEW_TOPOLOGY } from '../ui/board/standard-board-preview.ts'

export function App(): React.JSX.Element {
  return (
    <Box component="main" sx={{ alignItems: 'center', display: 'flex', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="lg">
        <Stack spacing={3}>
          <Paper elevation={6} sx={{ px: { xs: 3, sm: 6 }, py: { xs: 4, sm: 5 } }}>
            <Stack spacing={3} sx={{ textAlign: 'center' }}>
              <Typography component="h1" variant="h2">
                Frontier Isles
              </Typography>
              <Typography component="p" variant="h5">
                Single-player strategy game
              </Typography>
              <Typography color="text.secondary">Architecture foundation ready</Typography>
              <Button disabled variant="contained">
                New Game — Not implemented
              </Button>
            </Stack>
          </Paper>
          <Paper
            aria-label="Standard board preview"
            component="section"
            elevation={4}
            sx={{ p: { xs: 1.5, sm: 3 } }}
          >
            <GameBoard topology={STANDARD_BOARD_PREVIEW_TOPOLOGY} />
          </Paper>
        </Stack>
      </Container>
    </Box>
  )
}
