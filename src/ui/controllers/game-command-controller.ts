import type { GameCommand } from '../../game/contracts/commands.ts'
import type { PlayerView } from '../../game/contracts/views.ts'
import type { EdgeId, TileId, VertexId } from '../../game/model/ids.ts'
import type { BuildMode } from '../../application/stores/ui-interaction-store.ts'

export function commandForVertexSelection(
  view: PlayerView,
  vertexId: VertexId,
  buildMode: BuildMode,
): GameCommand | null {
  if (view.legalActions.legalInitialSettlementVertexIds?.includes(vertexId) === true) {
    return { type: 'PLACE_INITIAL_SETTLEMENT', vertexId }
  }
  if (buildMode === 'SETTLEMENT' && view.legalActions.legalSettlementVertexIds.includes(vertexId)) {
    return { type: 'BUILD_SETTLEMENT', vertexId }
  }
  if (buildMode === 'CITY' && view.legalActions.legalCityUpgradeVertexIds.includes(vertexId)) {
    return { type: 'UPGRADE_CITY', vertexId }
  }
  return null
}

export function commandForEdgeSelection(
  view: PlayerView,
  edgeId: EdgeId,
): GameCommand | null {
  if (view.legalActions.legalInitialRoadEdgeIds?.includes(edgeId) === true) {
    return { type: 'PLACE_INITIAL_ROAD', edgeId }
  }
  if (view.legalActions.legalRoadEdgeIds.includes(edgeId)) return { type: 'BUILD_ROAD', edgeId }
  return null
}

export function commandForTileSelection(
  view: PlayerView,
  tileId: TileId,
): GameCommand | null {
  return view.legalActions.legalRobberTileIds.includes(tileId)
    ? { type: 'MOVE_ROBBER', tileId }
    : null
}

export function legalVerticesForMode(
  view: PlayerView,
  buildMode: BuildMode,
): readonly VertexId[] {
  if ((view.legalActions.legalInitialSettlementVertexIds?.length ?? 0) > 0) {
    return view.legalActions.legalInitialSettlementVertexIds ?? []
  }
  if (buildMode === 'SETTLEMENT') return view.legalActions.legalSettlementVertexIds
  if (buildMode === 'CITY') return view.legalActions.legalCityUpgradeVertexIds
  return []
}

export function legalEdgesForMode(
  view: PlayerView,
  buildMode: BuildMode,
): readonly EdgeId[] {
  if ((view.legalActions.legalInitialRoadEdgeIds?.length ?? 0) > 0) {
    return view.legalActions.legalInitialRoadEdgeIds ?? []
  }
  if (view.publicGame.turn.phase === 'FREE_ROAD_PLACEMENT' || buildMode === 'ROAD') {
    return view.legalActions.legalRoadEdgeIds
  }
  return []
}
