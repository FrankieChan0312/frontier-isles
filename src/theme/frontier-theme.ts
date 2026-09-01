import { createTheme } from '@mui/material/styles'

export const frontierTheme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#315c55',
      contrastText: '#ffffff',
    },
    secondary: {
      main: '#b46d3c',
    },
    background: {
      default: '#eaf0ec',
      paper: '#fffdf8',
    },
    text: {
      primary: '#20312d',
      secondary: '#52645f',
    },
  },
  shape: {
    borderRadius: 16,
  },
  typography: {
    fontFamily: 'Roboto, Arial, sans-serif',
    h2: {
      fontSize: 'clamp(2.5rem, 9vw, 4rem)',
      fontWeight: 700,
      letterSpacing: '-0.04em',
    },
    h5: {
      fontWeight: 400,
    },
    button: {
      fontWeight: 500,
      textTransform: 'none',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(49, 92, 85, 0.16)',
        },
      },
    },
  },
})

