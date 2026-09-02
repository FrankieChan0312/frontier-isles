import {
  STANDARD_BUILD_COSTS,
  STANDARD_CITY_COST,
  STANDARD_ROAD_COST,
  STANDARD_SETTLEMENT_COST,
} from './standard-build-costs.ts'
import {
  STANDARD_CITY_PIECE_LIMIT,
  STANDARD_PIECE_LIMITS,
  STANDARD_ROAD_PIECE_LIMIT,
  STANDARD_SETTLEMENT_PIECE_LIMIT,
} from './standard-piece-limits.ts'

describe('standard paid-building configuration', () => {
  it('exports the exact readonly road, settlement, and city costs', () => {
    expect(STANDARD_ROAD_COST).toEqual({ LUMBER: 1, BRICK: 1, WOOL: 0, GRAIN: 0, ORE: 0 })
    expect(STANDARD_SETTLEMENT_COST).toEqual({ LUMBER: 1, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 0 })
    expect(STANDARD_CITY_COST).toEqual({ LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 2, ORE: 3 })
    expect(STANDARD_BUILD_COSTS).toEqual({
      ROAD: STANDARD_ROAD_COST,
      SETTLEMENT: STANDARD_SETTLEMENT_COST,
      CITY: STANDARD_CITY_COST,
    })
    expect(Object.isFrozen(STANDARD_BUILD_COSTS)).toBe(true)
    expect(Object.values(STANDARD_BUILD_COSTS).every(Object.isFrozen)).toBe(true)
  })

  it('exports exact standard physical-piece limits', () => {
    expect(STANDARD_ROAD_PIECE_LIMIT).toBe(15)
    expect(STANDARD_SETTLEMENT_PIECE_LIMIT).toBe(5)
    expect(STANDARD_CITY_PIECE_LIMIT).toBe(4)
    expect(STANDARD_PIECE_LIMITS).toEqual({ ROAD: 15, SETTLEMENT: 5, CITY: 4 })
    expect(Object.isFrozen(STANDARD_PIECE_LIMITS)).toBe(true)
  })
})
