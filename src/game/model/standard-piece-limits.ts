import type { StandardBuildType } from './standard-build-costs.ts'

export const STANDARD_ROAD_PIECE_LIMIT = 15
export const STANDARD_SETTLEMENT_PIECE_LIMIT = 5
export const STANDARD_CITY_PIECE_LIMIT = 4

export const STANDARD_PIECE_LIMITS: Readonly<Record<StandardBuildType, number>> =
  Object.freeze({
    ROAD: STANDARD_ROAD_PIECE_LIMIT,
    SETTLEMENT: STANDARD_SETTLEMENT_PIECE_LIMIT,
    CITY: STANDARD_CITY_PIECE_LIMIT,
  })
