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
    MuiCssBaseline: {
      styleOverrides: {
        'html, body, #root': {
          minWidth: 0,
          overflowX: 'hidden',
        },
        '@media (prefers-reduced-motion: reduce)': {
          '*, *::before, *::after': {
            animationDuration: '0.01ms !important',
            animationIterationCount: '1 !important',
            scrollBehavior: 'auto !important',
            transitionDuration: '0.01ms !important',
          },
        },
      },
    },
    MuiButtonBase: {
      styleOverrides: {
        root: {
          '&&.Mui-focusVisible': {
            // Two opaque bands remain distinguishable on both paper and the dark header.
            boxShadow: '0 0 0 3px #fffdf8',
            outline: '3px solid #20312d',
            outlineOffset: 3,
            transition: 'none',
          },
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          // The switch clips at its container: draw both bands inside its moving base.
          '&&&.Mui-focusVisible': {
            boxShadow: 'inset 0 0 0 3px #fffdf8',
            outline: '3px solid #20312d',
            outlineOffset: -6,
            transition: 'none',
          },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: '1px solid rgba(49, 92, 85, 0.16)',
        },
      },
    },
  },
})
