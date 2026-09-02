import type { HexCoordinate } from '../model/board-state.ts'

export const STANDARD_BOARD_RADIUS = 2 as const

export interface CubeCoordinate {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface IntegerCornerCoordinate {
  readonly x: number
  readonly y: number
  readonly z: number
}

export type CornerIndex = 0 | 1 | 2 | 3 | 4 | 5

export const ORDERED_CORNER_INDICES = [0, 1, 2, 3, 4, 5] as const

const ORDERED_CORNER_OFFSETS: readonly [
  IntegerCornerCoordinate,
  IntegerCornerCoordinate,
  IntegerCornerCoordinate,
  IntegerCornerCoordinate,
  IntegerCornerCoordinate,
  IntegerCornerCoordinate,
] = [
  { x: 2, y: -1, z: -1 },
  { x: 1, y: 1, z: -2 },
  { x: -1, y: 2, z: -1 },
  { x: -2, y: 1, z: 1 },
  { x: -1, y: -1, z: 2 },
  { x: 1, y: -2, z: 1 },
]

export function axialToCubeCoordinate(coordinate: HexCoordinate): CubeCoordinate {
  return {
    x: coordinate.q,
    y: -coordinate.q - coordinate.r,
    z: coordinate.r,
  }
}

export function createIntegerCornerCoordinate(
  coordinate: HexCoordinate,
  cornerIndex: CornerIndex,
): IntegerCornerCoordinate {
  const center = axialToCubeCoordinate(coordinate)
  const offset = ORDERED_CORNER_OFFSETS[cornerIndex]

  return {
    x: 3 * center.x + offset.x,
    y: 3 * center.y + offset.y,
    z: 3 * center.z + offset.z,
  }
}

export function createStandardAxialCoordinates(): readonly HexCoordinate[] {
  const coordinates: HexCoordinate[] = []

  for (let q = -STANDARD_BOARD_RADIUS; q <= STANDARD_BOARD_RADIUS; q += 1) {
    for (let r = -STANDARD_BOARD_RADIUS; r <= STANDARD_BOARD_RADIUS; r += 1) {
      const cube = axialToCubeCoordinate({ q, r })
      const distance = Math.max(Math.abs(cube.x), Math.abs(cube.y), Math.abs(cube.z))

      if (distance <= STANDARD_BOARD_RADIUS) {
        coordinates.push({ q, r })
      }
    }
  }

  return coordinates.sort((left, right) => left.q - right.q || left.r - right.r)
}

