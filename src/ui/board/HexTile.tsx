import { useTheme } from '@mui/material/styles'
import type { TileSvgLayout } from './board-layout.ts'

export interface HexTileProps {
  readonly tile: TileSvgLayout
}

export function HexTile({ tile }: HexTileProps): React.JSX.Element {
  const theme = useTheme()
  const visualSurfaceVariant = Math.abs(tile.coordinate.q + tile.coordinate.r) % 2

  return (
    <polygon
      data-surface-variant={visualSurfaceVariant}
      data-tile-id={tile.tileId}
      fill={visualSurfaceVariant === 0 ? theme.palette.background.paper : theme.palette.grey[100]}
      points={tile.pointString}
      stroke={theme.palette.primary.dark}
      strokeLinejoin="round"
      strokeWidth={2}
    />
  )
}

