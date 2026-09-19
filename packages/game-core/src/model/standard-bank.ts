import type { ResourceBag } from './resource.ts'

export const STANDARD_BANK_RESOURCE_COUNT = 19

export function createStandardBankResources(): ResourceBag {
  return {
    LUMBER: STANDARD_BANK_RESOURCE_COUNT,
    BRICK: STANDARD_BANK_RESOURCE_COUNT,
    WOOL: STANDARD_BANK_RESOURCE_COUNT,
    GRAIN: STANDARD_BANK_RESOURCE_COUNT,
    ORE: STANDARD_BANK_RESOURCE_COUNT,
  }
}
