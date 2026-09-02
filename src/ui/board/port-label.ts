import type { PortKind } from '../../game/model/board-state.ts'
import type { ResourceType } from '../../game/model/resource.ts'
import { assertNever } from '../../game/model/assert-never.ts'

function formatResourcePortLabel(resource: ResourceType): string {
  switch (resource) {
    case 'LUMBER':
      return 'LUM 2:1'
    case 'BRICK':
      return 'BRK 2:1'
    case 'WOOL':
      return 'WOL 2:1'
    case 'GRAIN':
      return 'GRN 2:1'
    case 'ORE':
      return 'ORE 2:1'
    default:
      return assertNever(resource)
  }
}

function formatResourcePortAccessibleLabel(resource: ResourceType): string {
  switch (resource) {
    case 'LUMBER':
      return 'Lumber port, trade two lumber for one'
    case 'BRICK':
      return 'Brick port, trade two brick for one'
    case 'WOOL':
      return 'Wool port, trade two wool for one'
    case 'GRAIN':
      return 'Grain port, trade two grain for one'
    case 'ORE':
      return 'Ore port, trade two ore for one'
    default:
      return assertNever(resource)
  }
}

export function formatPortLabel(kind: PortKind): string {
  switch (kind.type) {
    case 'GENERIC':
      return '3:1'
    case 'RESOURCE':
      return formatResourcePortLabel(kind.resource)
    default:
      return assertNever(kind)
  }
}

export function formatPortAccessibleLabel(kind: PortKind): string {
  switch (kind.type) {
    case 'GENERIC':
      return 'Generic port, trade three for one'
    case 'RESOURCE':
      return formatResourcePortAccessibleLabel(kind.resource)
    default:
      return assertNever(kind)
  }
}
