import type { RandomState } from '../model/game-state.ts'
import { RANDOM_ALGORITHM_ID } from '../model/ruleset.ts'
import type { ResourceBag } from '../model/resource.ts'
import { drawRandomResourceFromBag } from './draw-random-resource.ts'

function random(): RandomState {
  return {
    algorithm: RANDOM_ALGORITHM_ID,
    seed: 'FRONTIER-ISLES-TASK-05',
    state: 68079378,
    drawCount: 86,
  }
}

describe('drawRandomResourceFromBag', () => {
  it('matches the exact multi-resource cumulative-order anchor', () => {
    const result = drawRandomResourceFromBag(
      { LUMBER: 2, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 1 },
      random(),
    )
    expect(result.value).toBe('GRAIN')
    expect(result.random).toEqual({
      algorithm: RANDOM_ALGORITHM_ID,
      seed: 'FRONTIER-ISLES-TASK-05',
      state: 1618009444,
      drawCount: 87,
    })
  })

  it('represents each resource in canonical RESOURCE_TYPES order', () => {
    const fixtures = [
      [{ LUMBER: 6, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 }, 'LUMBER'],
      [{ LUMBER: 0, BRICK: 6, WOOL: 0, GRAIN: 0, ORE: 0 }, 'BRICK'],
      [{ LUMBER: 0, BRICK: 0, WOOL: 6, GRAIN: 0, ORE: 0 }, 'WOOL'],
      [{ LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 6, ORE: 0 }, 'GRAIN'],
      [{ LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 6 }, 'ORE'],
    ] as const satisfies readonly (readonly [ResourceBag, string])[]
    for (const [bag, expected] of fixtures) {
      expect(drawRandomResourceFromBag(bag, random()).value).toBe(expected)
    }
  })

  it('draws from a one-card bag and still consumes one bounded draw', () => {
    const result = drawRandomResourceFromBag(
      { LUMBER: 0, BRICK: 0, WOOL: 1, GRAIN: 0, ORE: 0 },
      random(),
    )
    expect(result.value).toBe('WOOL')
    expect(result.random).toMatchObject({ state: 1618009444, drawCount: 87 })
  })

  it('rejects empty, negative, fractional, unsafe, missing, and extra resource bags', () => {
    expect(() => drawRandomResourceFromBag(
      { LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
      random(),
    )).toThrow(/empty/)
    expect(() => drawRandomResourceFromBag(
      { LUMBER: -1, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
      random(),
    )).toThrow(/non-negative safe integer/)
    expect(() => drawRandomResourceFromBag(
      { LUMBER: 1.5, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
      random(),
    )).toThrow(/non-negative safe integer/)
    expect(() => drawRandomResourceFromBag(
      { LUMBER: Number.MAX_SAFE_INTEGER + 1, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 },
      random(),
    )).toThrow(/safe integer/)
    expect(() => drawRandomResourceFromBag(
      { LUMBER: 1, BRICK: 0, WOOL: 0, GRAIN: 0 } as unknown as ResourceBag,
      random(),
    )).toThrow(/exactly/)
    expect(() => drawRandomResourceFromBag(
      { LUMBER: 1, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0, GOLD: 1 } as unknown as ResourceBag,
      random(),
    )).toThrow(/exactly/)
  })

  it('does not mutate inputs and returns plain JSON-compatible data', () => {
    const bag: ResourceBag = { LUMBER: 2, BRICK: 1, WOOL: 1, GRAIN: 1, ORE: 1 }
    const inputRandom = random()
    const bagSnapshot = structuredClone(bag)
    const randomSnapshot = structuredClone(inputRandom)
    const result = drawRandomResourceFromBag(bag, inputRandom)
    expect(bag).toEqual(bagSnapshot)
    expect(inputRandom).toEqual(randomSnapshot)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })
})
