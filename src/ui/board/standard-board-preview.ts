import { createStandardBoardTopology } from '../../game/board/standard-board-topology.ts'
import type { NinePortKinds } from '../../game/board/port-slots.ts'

export const STANDARD_BOARD_PREVIEW_PORT_KINDS = [
  { type: 'GENERIC' },
  { type: 'RESOURCE', resource: 'LUMBER' },
  { type: 'GENERIC' },
  { type: 'RESOURCE', resource: 'BRICK' },
  { type: 'GENERIC' },
  { type: 'RESOURCE', resource: 'WOOL' },
  { type: 'GENERIC' },
  { type: 'RESOURCE', resource: 'GRAIN' },
  { type: 'RESOURCE', resource: 'ORE' },
] as const satisfies NinePortKinds

export const STANDARD_BOARD_PREVIEW_TOPOLOGY = createStandardBoardTopology(
  STANDARD_BOARD_PREVIEW_PORT_KINDS,
)

