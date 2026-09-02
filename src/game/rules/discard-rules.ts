import type { RuleViolation } from '../contracts/errors.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import type { ResourceBag } from '../model/resource.ts'

function invalidDiscard(reason: string): RuleViolation {
  return { code: 'INVALID_DISCARD', details: { reason } }
}

export function validateDiscardSelection(
  selection: ResourceBag,
  holdings: ResourceBag,
  requiredCount: number,
): RuleViolation | null {
  if (selection === null || typeof selection !== 'object' || Array.isArray(selection)) {
    return invalidDiscard('MALFORMED_RESOURCE_BAG')
  }
  const keys = Object.keys(selection)
  if (
    keys.length !== RESOURCE_TYPES.length
    || keys.some((key) => !RESOURCE_TYPES.some((resource) => resource === key))
    || RESOURCE_TYPES.some((resource) => !Object.hasOwn(selection, resource))
  ) {
    return invalidDiscard('MALFORMED_RESOURCE_BAG')
  }
  if (!Number.isSafeInteger(requiredCount) || requiredCount <= 0) {
    throw new Error(`Invalid discard state: required count ${requiredCount} must be positive and safe.`)
  }

  let selectedTotal = 0
  for (const resource of RESOURCE_TYPES) {
    const selected = selection[resource]
    if (!Number.isSafeInteger(selected) || selected < 0) {
      return invalidDiscard('INVALID_RESOURCE_COUNT')
    }
    if (selected > holdings[resource]) return invalidDiscard('SELECTION_EXCEEDS_HOLDINGS')
    selectedTotal += selected
    if (!Number.isSafeInteger(selectedTotal)) return invalidDiscard('INVALID_RESOURCE_COUNT')
  }
  if (selectedTotal !== requiredCount) {
    return {
      code: 'INVALID_DISCARD',
      details: { reason: 'WRONG_TOTAL', required: requiredCount, selected: selectedTotal },
    }
  }
  return null
}
