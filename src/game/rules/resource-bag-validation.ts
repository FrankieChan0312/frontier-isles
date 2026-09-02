import { RESOURCE_TYPES } from '../model/resource.ts'
import type { ResourceBag, ResourceType } from '../model/resource.ts'

export function isCompleteResourceBag(value: unknown): value is ResourceBag {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  if (Object.getPrototypeOf(value) !== Object.prototype) return false
  const record = value as Readonly<Record<string, unknown>>
  const keys = Object.keys(record)
  if (
    keys.length !== RESOURCE_TYPES.length
    || !keys.every((key) => RESOURCE_TYPES.includes(key as ResourceType))
  ) return false
  return RESOURCE_TYPES.every((resource) => {
    const count = record[resource]
    return Number.isSafeInteger(count) && Number(count) >= 0
  })
}

export function countResourceCards(resources: ResourceBag): number {
  if (!isCompleteResourceBag(resources)) {
    throw new Error('Cannot count an invalid resource bag.')
  }
  return RESOURCE_TYPES.reduce((total, resource) => total + resources[resource], 0)
}
