import { useTheme } from '@mui/material/styles'
import type { BoardSvgLayout } from './board-layout.ts'

export interface BoardDebugLayerProps {
  readonly layout: BoardSvgLayout
}

export function BoardDebugLayer({ layout }: BoardDebugLayerProps): React.JSX.Element {
  const theme = useTheme()

  return (
    <>
      <g data-layer="debug-edges" pointerEvents="none">
        {layout.edges.map((edge) => (
          <line
            key={edge.edgeId}
            data-edge-id={edge.edgeId}
            x1={edge.from.x}
            x2={edge.to.x}
            y1={edge.from.y}
            y2={edge.to.y}
            stroke={theme.palette.text.secondary}
            strokeDasharray="5 5"
            strokeOpacity={0.45}
            strokeWidth={1}
          />
        ))}
      </g>
      <g data-layer="debug-vertices" pointerEvents="none">
        {layout.vertices.map((vertex) => (
          <circle
            key={vertex.vertexId}
            cx={vertex.point.x}
            cy={vertex.point.y}
            data-vertex-id={vertex.vertexId}
            fill={theme.palette.secondary.main}
            r={3}
          />
        ))}
      </g>
      <g data-layer="debug-labels" pointerEvents="none">
        {layout.tiles.map((tile) => (
          <text
            key={tile.tileId}
            x={tile.center.x}
            y={tile.center.y}
            data-tile-id={tile.tileId}
            dominantBaseline="central"
            fill={theme.palette.text.secondary}
            fontFamily={theme.typography.fontFamily}
            fontSize={11}
            textAnchor="middle"
          >
            ({tile.coordinate.q},{tile.coordinate.r})
          </text>
        ))}
      </g>
    </>
  )
}

