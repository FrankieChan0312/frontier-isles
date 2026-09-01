import { createEmptyResourceBag, RESOURCE_TYPES } from './resource.ts'

describe('resource contracts', () => {
  it('keeps the frozen resource order', () => {
    expect(RESOURCE_TYPES).toEqual(['LUMBER', 'BRICK', 'WOOL', 'GRAIN', 'ORE'])
  })

  it('creates a fresh zero-filled resource bag', () => {
    const first = createEmptyResourceBag()
    const second = createEmptyResourceBag()

    expect(first).toEqual({ LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 })
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
  })
})

