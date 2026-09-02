import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material'
import { App } from './app.tsx'
import { frontierTheme } from '../theme/frontier-theme.ts'

describe('App', () => {
  it('renders the project foundation landing screen', () => {
    render(
      <ThemeProvider theme={frontierTheme}>
        <App />
      </ThemeProvider>,
    )

    expect(screen.getByRole('heading', { level: 1, name: 'Frontier Isles' })).toBeInTheDocument()
    expect(screen.getByText('Single-player strategy game')).toBeInTheDocument()
    expect(screen.getByText('Architecture foundation ready')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New Game — Not implemented' })).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Standard board preview' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Frontier Isles board/ })).toBeInTheDocument()
  })
})
