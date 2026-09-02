import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useId } from 'react'
import type { BoardTopology } from '../../game/model/board-state.ts'
import { BoardDebugLayer } from './BoardDebugLayer.tsx'
import { createBoardSvgLayout } from './board-layout.ts'
import { HexTile } from './HexTile.tsx'
import { PortLayer } from './PortLayer.tsx'

const DEFAULT_BOARD_TITLE = 'Frontier Isles board'
const DEFAULT_BOARD_DESCRIPTION = 'A standard nineteen-tile island board with nine coastal ports.'

export interface GameBoardProps {
  readonly topology: BoardTopology
  readonly title?: string
  readonly description?: string
  readonly showDebugOverlay?: boolean
}

export function GameBoard({
  topology,
  title = DEFAULT_BOARD_TITLE,
  description = DEFAULT_BOARD_DESCRIPTION,
  showDebugOverlay = false,
}: GameBoardProps): React.JSX.Element {
  const theme = useTheme()
  const titleId = useId()
  const descriptionId = useId()
  const layout = createBoardSvgLayout(topology)
  const { minX, minY, width, height } = layout.viewBox

  return (
    <Box sx={{ aspectRatio: layout.aspectRatio, maxWidth: '100%', width: '100%' }}>
      <svg
        aria-labelledby={`${titleId} ${descriptionId}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox={`${minX} ${minY} ${width} ${height}`}
        width="100%"
        height="100%"
        style={{ display: 'block' }}
      >
        <title id={titleId}>{title}</title>
        <desc id={descriptionId}>{description}</desc>
        <g data-layer="background">
          <rect
            x={minX}
            y={minY}
            width={width}
            height={height}
            rx={20}
            fill={theme.palette.primary.light}
            opacity={0.3}
          />
        </g>
        <g data-layer="tiles">
          {layout.tiles.map((tile) => (
            <HexTile key={tile.tileId} tile={tile} />
          ))}
        </g>
        <PortLayer ports={layout.ports} />
        {showDebugOverlay ? <BoardDebugLayer layout={layout} /> : null}
      </svg>
    </Box>
  )
}

