import '@fontsource/roboto/latin-300.css'
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-700.css'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/app.tsx'
import { frontierTheme } from './theme/frontier-theme.ts'

const rootElement = document.getElementById('root')

if (rootElement === null) {
  throw new Error('Application root element was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <ThemeProvider theme={frontierTheme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StrictMode>,
)
