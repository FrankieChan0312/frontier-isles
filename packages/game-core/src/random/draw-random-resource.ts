import type { RandomState } from '../model/game-state.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import type { ResourceBag, ResourceType } from '../model/resource.ts'
import { nextRandomInt } from './seeded-random.ts'
import type { RandomResult } from './seeded-random.ts'

function assertResourceBag(resources: ResourceBag): number {
  if (resources === null || typeof resources !== 'object' || Array.isArray(resources)) {
    throw new Error('Invalid random resource bag: expected an object with all five resource counts.')
  }
  const keys = Object.keys(resources)
  if (
    keys.length !== RESOURCE_TYPES.length
    || keys.some((key) => !RESOURCE_TYPES.some((resource) => resource === key))
  ) {
    throw new Error('Invalid random resource bag: expected exactly the five accepted resource keys.')
  }

  let total = 0
  for (const resource of RESOURCE_TYPES) {
    if (!Object.hasOwn(resources, resource)) {
      throw new Error(`Invalid random resource bag: missing ${resource}.`)
    }
    const count = resources[resource]
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(
        `Invalid random resource bag: ${resource} must be a non-negative safe integer.`,
      )
    }
    total += count
    if (!Number.isSafeInteger(total)) {
      throw new Error('Invalid random resource bag: total card count exceeds safe-integer range.')
    }
  }
  if (total === 0) throw new Error('Invalid random resource bag: cannot draw from an empty bag.')
  return total
}

export function drawRandomResourceFromBag(
  resources: ResourceBag,
  random: RandomState,
): RandomResult<ResourceType> {
  const total = assertResourceBag(resources)
  const selection = nextRandomInt(random, 0, total)
  let cumulative = 0
  for (const resource of RESOURCE_TYPES) {
    cumulative += resources[resource]
    if (selection.value < cumulative) {
      return { value: resource, random: selection.random }
    }
  }
  throw new Error(
    `Invalid random resource selection: index ${selection.value} did not resolve within ${total} cards.`,
  )
}
