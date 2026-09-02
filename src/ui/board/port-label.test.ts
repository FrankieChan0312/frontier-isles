import type { PortKind } from '../../game/model/board-state.ts'
import { formatPortAccessibleLabel, formatPortLabel } from './port-label.ts'

describe('port labels', () => {
  it.each<readonly [PortKind, string, string]>([
    [{ type: 'GENERIC' }, '3:1', 'Generic port, trade three for one'],
    [
      { type: 'RESOURCE', resource: 'LUMBER' },
      'LUM 2:1',
      'Lumber port, trade two lumber for one',
    ],
    [
      { type: 'RESOURCE', resource: 'BRICK' },
      'BRK 2:1',
      'Brick port, trade two brick for one',
    ],
    [
      { type: 'RESOURCE', resource: 'WOOL' },
      'WOL 2:1',
      'Wool port, trade two wool for one',
    ],
    [
      { type: 'RESOURCE', resource: 'GRAIN' },
      'GRN 2:1',
      'Grain port, trade two grain for one',
    ],
    [
      { type: 'RESOURCE', resource: 'ORE' },
      'ORE 2:1',
      'Ore port, trade two ore for one',
    ],
  ])('formats %j exhaustively', (kind, visualLabel, accessibleLabel) => {
    expect(formatPortLabel(kind)).toBe(visualLabel)
    expect(formatPortAccessibleLabel(kind)).toBe(accessibleLabel)
  })
})

