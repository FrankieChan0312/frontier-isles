import { createStore } from 'zustand/vanilla'
import type { StoreApi } from 'zustand/vanilla'
import type { EdgeId, TileId, VertexId } from '@frontier-isles/game-core/model/ids'

export type BuildMode = 'ROAD' | 'SETTLEMENT' | 'CITY' | null
export type OpenDialog =
  | 'DISCARD'
  | 'ROBBER'
  | 'TRADE'
  | 'MARITIME_TRADE'
  | 'DEVELOPMENT_CARD'
  | 'VICTORY'
  | null

export interface UiInteractionStoreState {
  readonly hoveredTileId: TileId | null
  readonly hoveredEdgeId: EdgeId | null
  readonly hoveredVertexId: VertexId | null
  readonly selectedBuildMode: BuildMode
  readonly selectedBoardObjectId: TileId | EdgeId | VertexId | null
  readonly openDialog: OpenDialog
  readonly boardZoom: number
  readonly sidebarOpen: boolean
  readonly setHoveredTileId: (tileId: TileId | null) => void
  readonly setHoveredEdgeId: (edgeId: EdgeId | null) => void
  readonly setHoveredVertexId: (vertexId: VertexId | null) => void
  readonly setSelectedBuildMode: (mode: BuildMode) => void
  readonly setSelectedBoardObjectId: (id: TileId | EdgeId | VertexId | null) => void
  readonly setOpenDialog: (dialog: OpenDialog) => void
  readonly setBoardZoom: (zoom: number) => void
  readonly setSidebarOpen: (open: boolean) => void
  readonly reset: () => void
}

const INITIAL_UI_STATE = {
  hoveredTileId: null,
  hoveredEdgeId: null,
  hoveredVertexId: null,
  selectedBuildMode: null,
  selectedBoardObjectId: null,
  openDialog: null,
  boardZoom: 1,
  sidebarOpen: true,
} as const

export function createUiInteractionStore(): StoreApi<UiInteractionStoreState> {
  return createStore<UiInteractionStoreState>((set) => ({
    ...INITIAL_UI_STATE,
    setHoveredTileId: (hoveredTileId): void => set({ hoveredTileId }),
    setHoveredEdgeId: (hoveredEdgeId): void => set({ hoveredEdgeId }),
    setHoveredVertexId: (hoveredVertexId): void => set({ hoveredVertexId }),
    setSelectedBuildMode: (selectedBuildMode): void => set({ selectedBuildMode }),
    setSelectedBoardObjectId: (selectedBoardObjectId): void => set({ selectedBoardObjectId }),
    setOpenDialog: (openDialog): void => set({ openDialog }),
    setBoardZoom: (boardZoom): void => set({ boardZoom: Math.min(2, Math.max(0.6, boardZoom)) }),
    setSidebarOpen: (sidebarOpen): void => set({ sidebarOpen }),
    reset: (): void => set(INITIAL_UI_STATE),
  }))
}

export type UiInteractionStore = StoreApi<UiInteractionStoreState>
