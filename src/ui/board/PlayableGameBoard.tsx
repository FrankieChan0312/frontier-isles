import { Box } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useId } from 'react'
import type { KeyboardEvent } from 'react'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import type { TerrainType } from '@frontier-isles/game-core/model/board-state'
import type { EdgeId, TileId, VertexId } from '@frontier-isles/game-core/model/ids'
import type { PlayerColor } from '@frontier-isles/game-core/model/player'
import { createBoardSvgLayout } from './board-layout.ts'
import { PortLayer } from './PortLayer.tsx'

const TERRAIN_COLORS: Readonly<Record<TerrainType, string>> = {
  FOREST: '#3f7356',
  HILLS: '#b76643',
  PASTURE: '#92b86b',
  FIELDS: '#d9bb57',
  MOUNTAINS: '#8b9290',
  DESERT: '#d8bd82',
}

const PLAYER_COLORS: Readonly<Record<PlayerColor, string>> = {
  RED: '#c4473d',
  BLUE: '#3575ad',
  ORANGE: '#d77b2f',
  WHITE: '#f5f2e8',
}

export interface PlayableGameBoardProps {
  readonly view: PlayerView
  readonly legalVertexIds?: readonly VertexId[]
  readonly legalEdgeIds?: readonly EdgeId[]
  readonly legalTileIds?: readonly TileId[]
  readonly onVertexSelect?: (vertexId: VertexId) => void
  readonly onEdgeSelect?: (edgeId: EdgeId) => void
  readonly onTileSelect?: (tileId: TileId) => void
}

function activateOnKeyboard(event: KeyboardEvent<SVGGElement>, activate: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  activate()
}

export function PlayableGameBoard({
  view,
  legalVertexIds = [],
  legalEdgeIds = [],
  legalTileIds = [],
  onVertexSelect,
  onEdgeSelect,
  onTileSelect,
}: PlayableGameBoardProps): React.JSX.Element {
  const theme = useTheme()
  const titleId = useId()
  const descriptionId = useId()
  const board = view.publicGame.board
  const layout = createBoardSvgLayout(board.topology)
  const { minX, minY, width, height } = layout.viewBox
  const playerColorById = new Map([
    [view.self.id, view.self.color],
    ...view.opponents.map((player) => [player.id, player.color] as const),
  ])
  const legalVertices = new Set(legalVertexIds)
  const legalEdges = new Set(legalEdgeIds)
  const legalTiles = new Set(legalTileIds)

  return (
    <Box
      sx={{
        aspectRatio: layout.aspectRatio,
        maxHeight: { xs: '58vh', lg: 'calc(100vh - 180px)' },
        maxWidth: '100%',
        mx: 'auto',
        width: '100%',
      }}
    >
      <svg
        aria-labelledby={`${titleId} ${descriptionId}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox={`${minX} ${minY} ${width} ${height}`}
        width="100%"
        height="100%"
        style={{ display: 'block', filter: 'drop-shadow(0 14px 24px rgba(20, 45, 40, .18))' }}
      >
        <title id={titleId}>Frontier Isles game board</title>
        <desc id={descriptionId}>
          Nineteen terrain tiles with public roads, buildings, ports, number tokens, and robber.
          Highlighted targets are legal for the current Human decision.
        </desc>
        <style>{`.legal-target:focus-visible > * { stroke: #163f39; stroke-width: 8px; }`}</style>
        <rect x={minX} y={minY} width={width} height={height} rx={26} fill="#b9d9db" />
        <g data-layer="tiles">
          {layout.tiles.map((tile) => {
            const content = board.tileContents[tile.tileId]
            if (content === undefined) return null
            return (
              <g key={tile.tileId} data-tile-id={tile.tileId}>
                <polygon
                  fill={TERRAIN_COLORS[content.terrain]}
                  points={tile.pointString}
                  stroke="rgba(255,255,255,.78)"
                  strokeLinejoin="round"
                  strokeWidth={3}
                />
                <text
                  x={tile.center.x}
                  y={tile.center.y - (content.numberToken === null ? 0 : 25)}
                  fill="rgba(25,42,38,.78)"
                  fontFamily={theme.typography.fontFamily}
                  fontSize={10}
                  fontWeight={700}
                  letterSpacing={1}
                  textAnchor="middle"
                >
                  {content.terrain}
                </text>
                {content.numberToken === null ? null : (
                  <g data-number-token={content.numberToken}>
                    <circle cx={tile.center.x} cy={tile.center.y + 3} r={18} fill="#fff8e8" />
                    <text
                      x={tile.center.x}
                      y={tile.center.y + 4}
                      dominantBaseline="central"
                      fill={content.numberToken === 6 || content.numberToken === 8 ? '#a92d28' : '#263b36'}
                      fontFamily={theme.typography.fontFamily}
                      fontSize={18}
                      fontWeight={700}
                      textAnchor="middle"
                    >
                      {content.numberToken}
                    </text>
                  </g>
                )}
              </g>
            )
          })}
        </g>
        <PortLayer ports={layout.ports} />
        <g data-layer="roads">
          {layout.edges.map((edge) => {
            const road = board.edgeOccupancy[edge.edgeId]
            if (road === null || road === undefined) return null
            const color = playerColorById.get(road.ownerId)
            return (
              <g key={edge.edgeId} data-edge-id={edge.edgeId}>
              <line
                x1={edge.from.x}
                x2={edge.to.x}
                y1={edge.from.y}
                y2={edge.to.y}
                stroke="#263b36"
                strokeLinecap="round"
                strokeWidth={11}
              />
              <line
                x1={edge.from.x}
                x2={edge.to.x}
                y1={edge.from.y}
                y2={edge.to.y}
                stroke={color === undefined ? '#263b36' : PLAYER_COLORS[color]}
                strokeLinecap="round"
                strokeWidth={7}
              />
              </g>
            )
          })}
        </g>
        <g data-layer="buildings">
          {layout.vertices.map((vertex) => {
            const building = board.vertexOccupancy[vertex.vertexId]
            if (building === null || building === undefined) return null
            const color = playerColorById.get(building.ownerId)
            const fill = color === undefined ? '#263b36' : PLAYER_COLORS[color]
            return building.type === 'CITY' ? (
              <rect
                key={vertex.vertexId}
                data-building="CITY"
                data-vertex-id={vertex.vertexId}
                x={vertex.point.x - 10}
                y={vertex.point.y - 10}
                width={20}
                height={20}
                rx={3}
                fill={fill}
                stroke="#263b36"
                strokeWidth={2}
                transform={`rotate(45 ${vertex.point.x} ${vertex.point.y})`}
              />
            ) : (
              <path
                key={vertex.vertexId}
                data-building="SETTLEMENT"
                data-vertex-id={vertex.vertexId}
                d={`M ${vertex.point.x - 10} ${vertex.point.y + 8} L ${vertex.point.x - 10} ${vertex.point.y - 2} L ${vertex.point.x} ${vertex.point.y - 12} L ${vertex.point.x + 10} ${vertex.point.y - 2} L ${vertex.point.x + 10} ${vertex.point.y + 8} Z`}
                fill={fill}
                stroke="#263b36"
                strokeWidth={2}
              />
            )
          })}
        </g>
        <g data-layer="robber" pointerEvents="none">
          {layout.tiles.filter((tile) => tile.tileId === board.robberTileId).map((tile) => (
            <g key={tile.tileId} transform={`translate(${tile.center.x + 28} ${tile.center.y + 21})`}>
              <circle r={11} fill="#263b36" opacity={0.92} />
              <text
                y={1}
                dominantBaseline="central"
                fill="#ffffff"
                fontFamily={theme.typography.fontFamily}
                fontSize={11}
                fontWeight={700}
                textAnchor="middle"
              >
                R
              </text>
            </g>
          ))}
        </g>
        <g data-layer="legal-targets">
          {layout.tiles.filter((tile) => legalTiles.has(tile.tileId)).map((tile) => (
            <g
              key={tile.tileId}
              aria-label={`Move robber to ${tile.tileId}`}
              className="legal-target"
              data-legal-tile-id={tile.tileId}
              onClick={() => onTileSelect?.(tile.tileId)}
              onKeyDown={(event) => activateOnKeyboard(event, () => onTileSelect?.(tile.tileId))}
              role="button"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
            >
              <polygon
                points={tile.pointString}
                fill="rgba(255,255,255,.12)"
                stroke="#fff7c7"
                strokeDasharray="8 6"
                strokeWidth={5}
              />
            </g>
          ))}
          {layout.edges.filter((edge) => legalEdges.has(edge.edgeId)).map((edge) => (
            <g
              key={edge.edgeId}
              aria-label={`Build road on ${edge.edgeId}`}
              className="legal-target"
              data-legal-edge-id={edge.edgeId}
              onClick={() => onEdgeSelect?.(edge.edgeId)}
              onKeyDown={(event) => activateOnKeyboard(event, () => onEdgeSelect?.(edge.edgeId))}
              role="button"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
            >
              <line
                x1={edge.from.x}
                x2={edge.to.x}
                y1={edge.from.y}
                y2={edge.to.y}
                stroke="#fff7c7"
                strokeLinecap="round"
                strokeWidth={15}
                opacity={0.86}
              />
              <line
                x1={edge.from.x}
                x2={edge.to.x}
                y1={edge.from.y}
                y2={edge.to.y}
                stroke={theme.palette.primary.dark}
                strokeDasharray="7 5"
                strokeLinecap="round"
                strokeWidth={5}
              />
            </g>
          ))}
          {layout.vertices.filter((vertex) => legalVertices.has(vertex.vertexId)).map((vertex) => (
            <g
              key={vertex.vertexId}
              aria-label={`Build on ${vertex.vertexId}`}
              className="legal-target"
              data-legal-vertex-id={vertex.vertexId}
              onClick={() => onVertexSelect?.(vertex.vertexId)}
              onKeyDown={(event) => activateOnKeyboard(event, () => onVertexSelect?.(vertex.vertexId))}
              role="button"
              tabIndex={0}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={vertex.point.x} cy={vertex.point.y} r={13} fill="#fff7c7" />
              <circle
                cx={vertex.point.x}
                cy={vertex.point.y}
                r={8}
                fill={theme.palette.primary.main}
                stroke="#ffffff"
                strokeWidth={2}
              />
            </g>
          ))}
        </g>
      </svg>
    </Box>
  )
}
