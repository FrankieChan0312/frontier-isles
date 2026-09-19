import type {
  BoardTopology,
  PortDefinition,
  PortKind,
} from '../model/board-state.ts'
import type { PortId } from '../model/ids.ts'
import { deriveOrderedCoastlineEdgeIds } from './coastline.ts'
import { createPortId } from './topology-ids.ts'

export type NinePortKinds = readonly [
  PortKind,
  PortKind,
  PortKind,
  PortKind,
  PortKind,
  PortKind,
  PortKind,
  PortKind,
  PortKind,
]

export const STANDARD_PORT_SLOT_EDGE_INDICES = [0, 3, 6, 10, 13, 16, 20, 23, 26] as const

function clonePortKind(kind: PortKind): PortKind {
  return kind.type === 'GENERIC'
    ? { type: 'GENERIC' }
    : { type: 'RESOURCE', resource: kind.resource }
}

export function createStandardPorts(
  topology: BoardTopology,
  portKinds: NinePortKinds,
): Readonly<Record<PortId, PortDefinition>> {
  if (portKinds.length !== 9) {
    throw new Error(`Standard board requires exactly nine port kinds; received ${portKinds.length}.`)
  }

  const coastlineEdgeIds = deriveOrderedCoastlineEdgeIds(topology)
  const ports: Record<PortId, PortDefinition> = {}

  for (let slotIndex = 0; slotIndex < STANDARD_PORT_SLOT_EDGE_INDICES.length; slotIndex += 1) {
    const coastlineIndex = STANDARD_PORT_SLOT_EDGE_INDICES[slotIndex]
    const kind = portKinds[slotIndex]
    const edgeId = coastlineIndex === undefined ? undefined : coastlineEdgeIds[coastlineIndex]

    if (kind === undefined || edgeId === undefined) {
      throw new Error(`Cannot resolve standard port slot ${slotIndex}.`)
    }

    const edge = topology.edges[edgeId]

    if (edge === undefined || !edge.coastal) {
      throw new Error(`Standard port slot ${slotIndex} does not reference a coastal edge.`)
    }

    const portId = createPortId(edgeId)
    ports[portId] = {
      id: portId,
      edgeId,
      vertexIds: [edge.vertexIds[0], edge.vertexIds[1]],
      kind: clonePortKind(kind),
    }
  }

  return ports
}

