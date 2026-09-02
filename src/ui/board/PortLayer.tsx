import { useTheme } from '@mui/material/styles'
import type { PortSvgLayout } from './board-layout.ts'

export interface PortLayerProps {
  readonly ports: readonly PortSvgLayout[]
}

export function PortLayer({ ports }: PortLayerProps): React.JSX.Element {
  const theme = useTheme()

  return (
    <g data-layer="ports">
      {ports.map((port) => (
        <g
          key={port.portId}
          aria-label={port.accessibleLabel}
          data-edge-id={port.edgeId}
          data-port-id={port.portId}
          role="group"
        >
          <line
            x1={port.edgeMidpoint.x}
            x2={port.markerCenter.x}
            y1={port.edgeMidpoint.y}
            y2={port.markerCenter.y}
            stroke={theme.palette.secondary.dark}
            strokeLinecap="round"
            strokeWidth={3}
          />
          <rect
            x={port.markerCenter.x - port.markerWidth / 2}
            y={port.markerCenter.y - port.markerHeight / 2}
            width={port.markerWidth}
            height={port.markerHeight}
            rx={8}
            fill={theme.palette.background.paper}
            stroke={theme.palette.secondary.dark}
            strokeWidth={2}
          />
          <text
            x={port.markerCenter.x}
            y={port.markerCenter.y}
            dominantBaseline="central"
            fill={theme.palette.text.primary}
            fontFamily={theme.typography.fontFamily}
            fontSize={12}
            fontWeight={700}
            textAnchor="middle"
          >
            {port.label}
          </text>
        </g>
      ))}
    </g>
  )
}

