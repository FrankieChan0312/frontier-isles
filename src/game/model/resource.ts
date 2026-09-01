export const RESOURCE_TYPES = ['LUMBER', 'BRICK', 'WOOL', 'GRAIN', 'ORE'] as const

export type ResourceType = (typeof RESOURCE_TYPES)[number]

export type ResourceBag = Readonly<Record<ResourceType, number>>

export function createEmptyResourceBag(): ResourceBag {
  return {
    LUMBER: 0,
    BRICK: 0,
    WOOL: 0,
    GRAIN: 0,
    ORE: 0,
  }
}

