import type { ResourceBag } from './resource.ts'

export type StandardBuildType = 'ROAD' | 'SETTLEMENT' | 'CITY'

export const STANDARD_ROAD_COST: ResourceBag = Object.freeze({
  LUMBER: 1,
  BRICK: 1,
  WOOL: 0,
  GRAIN: 0,
  ORE: 0,
})

export const STANDARD_SETTLEMENT_COST: ResourceBag = Object.freeze({
  LUMBER: 1,
  BRICK: 1,
  WOOL: 1,
  GRAIN: 1,
  ORE: 0,
})

export const STANDARD_CITY_COST: ResourceBag = Object.freeze({
  LUMBER: 0,
  BRICK: 0,
  WOOL: 0,
  GRAIN: 2,
  ORE: 3,
})

export const STANDARD_BUILD_COSTS: Readonly<Record<StandardBuildType, ResourceBag>> =
  Object.freeze({
    ROAD: STANDARD_ROAD_COST,
    SETTLEMENT: STANDARD_SETTLEMENT_COST,
    CITY: STANDARD_CITY_COST,
  })
