import { compareCodeUnits } from '../board/topology-ids.ts'
import type { BoardState } from '../model/board-state.ts'
import type { PlayerId, PortId } from '../model/ids.ts'

export function deriveControlledPortIds(
  board: BoardState,
  playerId: PlayerId,
): readonly PortId[] {
  return (Object.keys(board.topology.ports) as PortId[])
    .filter((portId) => {
      const port = board.topology.ports[portId]
      if (port === undefined) return false
      return port.vertexIds.some(
        (vertexId) => board.vertexOccupancy[vertexId]?.ownerId === playerId,
      )
    })
    .sort(compareCodeUnits)
}
