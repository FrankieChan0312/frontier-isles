import type { ResourceBag } from '../model/resource.ts'
import { validateDiscardSelection } from './discard-rules.ts'

const holdings: ResourceBag = { LUMBER: 2, BRICK: 3, WOOL: 1, GRAIN: 2, ORE: 0 }

describe('discard rules', () => {
  it('accepts an exact affordable five-resource selection', () => {
    expect(validateDiscardSelection(
      { LUMBER: 1, BRICK: 2, WOOL: 0, GRAIN: 1, ORE: 0 },
      holdings,
      4,
    )).toBeNull()
  })

  it('returns INVALID_DISCARD for wrong totals and unaffordable selections', () => {
    expect(validateDiscardSelection(
      { LUMBER: 1, BRICK: 1, WOOL: 0, GRAIN: 1, ORE: 0 },
      holdings,
      4,
    )?.code).toBe('INVALID_DISCARD')
    expect(validateDiscardSelection(
      { LUMBER: 0, BRICK: 4, WOOL: 0, GRAIN: 0, ORE: 0 },
      holdings,
      4,
    )?.code).toBe('INVALID_DISCARD')
  })

  it('rejects negative, fractional, missing, and extra runtime shapes', () => {
    const fixtures = [
      { LUMBER: -1, BRICK: 3, WOOL: 0, GRAIN: 2, ORE: 0 },
      { LUMBER: 0.5, BRICK: 2, WOOL: 0, GRAIN: 1.5, ORE: 0 },
      { LUMBER: 1, BRICK: 2, WOOL: 0, GRAIN: 1 },
      { LUMBER: 1, BRICK: 2, WOOL: 0, GRAIN: 1, ORE: 0, GOLD: 0 },
    ]
    for (const fixture of fixtures) {
      expect(validateDiscardSelection(fixture as unknown as ResourceBag, holdings, 4)?.code)
        .toBe('INVALID_DISCARD')
    }
  })

  it('throws when authoritative required-discard data is corrupt', () => {
    expect(() => validateDiscardSelection(
      { LUMBER: 1, BRICK: 2, WOOL: 0, GRAIN: 1, ORE: 0 },
      holdings,
      0,
    )).toThrow(/required count/)
  })
})
