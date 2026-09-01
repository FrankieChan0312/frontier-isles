import { Box, Button, Container, Paper, Stack, Typography } from '@mui/material'

export function App(): React.JSX.Element {
  return (
    <Box component="main" sx={{ alignItems: 'center', display: 'flex', minHeight: '100vh', py: 4 }}>
      <Container maxWidth="sm">
        <Paper elevation={6} sx={{ px: { xs: 3, sm: 6 }, py: { xs: 5, sm: 7 } }}>
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
      </Container>
    </Box>
  )
}
