import { RESOURCE_TYPES } from '../model/resource.ts'
import type { ResourceBag, ResourceType } from '../model/resource.ts'

export interface ResourcePaymentResult {
  readonly playerResources: ResourceBag
  readonly bankResources: ResourceBag
}

function assertValidResourceBag(resources: ResourceBag, label: string): void {
  const keys = Object.keys(resources)
  if (
    keys.length !== RESOURCE_TYPES.length
    || !keys.every((key) => RESOURCE_TYPES.includes(key as ResourceType))
  ) {
    throw new Error(`${label} must contain exactly the five accepted resource keys.`)
  }
  for (const resource of RESOURCE_TYPES) {
    const count = resources[resource]
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new Error(`${label} ${resource} must be a non-negative safe integer.`)
    }
  }
}

export function canAffordResourceCost(
  resources: ResourceBag,
  cost: ResourceBag,
): boolean {
  assertValidResourceBag(resources, 'Player resources')
  assertValidResourceBag(cost, 'Build cost')
  return RESOURCE_TYPES.every((resource) => resources[resource] >= cost[resource])
}

export function payResourceCostToBank(
  playerResources: ResourceBag,
  bankResources: ResourceBag,
  cost: ResourceBag,
): ResourcePaymentResult {
  assertValidResourceBag(playerResources, 'Player resources')
  assertValidResourceBag(bankResources, 'Bank resources')
  assertValidResourceBag(cost, 'Build cost')
  if (!canAffordResourceCost(playerResources, cost)) {
    throw new Error('Cannot pay a resource cost the player cannot afford.')
  }

  const nextPlayer = { ...playerResources } as Record<ResourceType, number>
  const nextBank = { ...bankResources } as Record<ResourceType, number>
  for (const resource of RESOURCE_TYPES) {
    const nextBankCount = nextBank[resource] + cost[resource]
    if (!Number.isSafeInteger(nextBankCount)) {
      throw new Error(`Bank ${resource} cannot be incremented safely.`)
    }
    nextPlayer[resource] -= cost[resource]
    nextBank[resource] = nextBankCount
  }
  return { playerResources: nextPlayer, bankResources: nextBank }
}
