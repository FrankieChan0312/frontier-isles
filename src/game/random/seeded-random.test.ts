import type { RandomState } from '../model/game-state.ts'
import { RANDOM_ALGORITHM_ID } from '../model/ruleset.ts'
import {
  createInitialRandomState,
  nextRandomFloat,
  nextRandomInt,
  nextRandomUint32,
  shuffleWithRandom,
} from './seeded-random.ts'

const GOLDEN_SEED = 'FRONTIER-ISLES-TASK-04'

describe('seeded random', () => {
  it.each([
    [GOLDEN_SEED, 1554738384],
    ['ABC', 1552166763],
    ['島', 1933845321],
    ['😀', 3409036472],
  ] as const)('hashes UTF-16 seed %j to the frozen state', (seed, expectedState) => {
    expect(createInitialRandomState(seed)).toEqual({
      algorithm: RANDOM_ALGORITHM_ID,
      seed,
      state: expectedState,
      drawCount: 0,
    })
  })

  it('rejects only the empty seed and preserves non-empty seed text exactly', () => {
    expect(() => createInitialRandomState('')).toThrow(/empty seed/)
    expect(createInitialRandomState('   ').seed).toBe('   ')
    expect(createInitialRandomState(' ABC ').seed).toBe(' ABC ')
  })

  it('matches the first ten frozen XORSHIFT32 draws', () => {
    const expected = [
      387972424, 4268206963, 1781534743, 1852458446, 4238426695, 1238421075,
      1397378462, 1170840738, 3185645068, 2067524124,
    ]
    let random = createInitialRandomState(GOLDEN_SEED)
    const actual: number[] = []

    for (let index = 0; index < expected.length; index += 1) {
      const draw = nextRandomUint32(random)
      actual.push(draw.value)
      random = draw.random
    }

    expect(actual).toEqual(expected)
    expect(random).toEqual({
      algorithm: RANDOM_ALGORITHM_ID,
      seed: GOLDEN_SEED,
      state: 2067524124,
      drawCount: 10,
    })
  })

  it('returns fresh random states without mutating its input', () => {
    const initial = createInitialRandomState(GOLDEN_SEED)
    const snapshot = structuredClone(initial)
    const uintDraw = nextRandomUint32(initial)
    const floatDraw = nextRandomFloat(initial)
    const intDraw = nextRandomInt(initial, -4, 7)

    expect(initial).toEqual(snapshot)
    expect(uintDraw.random).not.toBe(initial)
    expect(floatDraw.random).not.toBe(initial)
    expect(intDraw.random).not.toBe(initial)
    expect(uintDraw.random.seed).toBe(initial.seed)
  })

  it('creates finite floats in the half-open unit interval using one draw', () => {
    let random = createInitialRandomState('FLOATS')
    for (let index = 0; index < 64; index += 1) {
      const result = nextRandomFloat(random)
      expect(Number.isFinite(result.value)).toBe(true)
      expect(result.value).toBeGreaterThanOrEqual(0)
      expect(result.value).toBeLessThan(1)
      expect(result.random.drawCount).toBe(random.drawCount + 1)
      random = result.random
    }
  })

  it('uses half-open integer bounds and rejects invalid ranges', () => {
    let random = createInitialRandomState('INTEGERS')
    for (let index = 0; index < 128; index += 1) {
      const result = nextRandomInt(random, -3, 5)
      expect(result.value).toBeGreaterThanOrEqual(-3)
      expect(result.value).toBeLessThan(5)
      random = result.random
    }

    expect(() => nextRandomInt(random, 2, 2)).toThrow(/half-open/)
    expect(() => nextRandomInt(random, 3, 2)).toThrow(/half-open/)
    expect(() => nextRandomInt(random, 0.5, 2)).toThrow(/safe integers/)
    expect(() => nextRandomInt(random, 0, 0x1_0000_0001)).toThrow(/span/)
  })

  it('counts rejected bounded-integer draws in the returned state', () => {
    const supplied: RandomState = {
      algorithm: RANDOM_ALGORITHM_ID,
      seed: 'REJECTION-ANCHOR',
      state: 8192,
      drawCount: 7,
    }

    expect(nextRandomInt(supplied, 0, 2147483649)).toEqual({
      value: 13148770,
      random: {
        algorithm: RANDOM_ALGORITHM_ID,
        seed: 'REJECTION-ANCHOR',
        state: 13148770,
        drawCount: 9,
      },
    })
  })

  it('matches the frozen immutable Fisher-Yates shuffle anchor', () => {
    const input = ['A', 'B', 'C', 'D', 'E'] as const
    const result = shuffleWithRandom(input, createInitialRandomState(GOLDEN_SEED))

    expect(result.value).toEqual(['C', 'A', 'B', 'D', 'E'])
    expect(result.random.state).toBe(1852458446)
    expect(result.random.drawCount).toBe(4)
    expect(input).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('returns fresh empty and singleton arrays while consuming zero draws', () => {
    const random = createInitialRandomState('SMALL-SHUFFLES')
    const empty: readonly string[] = []
    const singleton = ['ONLY'] as const
    const emptyResult = shuffleWithRandom(empty, random)
    const singletonResult = shuffleWithRandom(singleton, random)

    expect(emptyResult.value).toEqual([])
    expect(emptyResult.value).not.toBe(empty)
    expect(singletonResult.value).toEqual(['ONLY'])
    expect(singletonResult.value).not.toBe(singleton)
    expect(emptyResult.random).toEqual(random)
    expect(emptyResult.random).not.toBe(random)
    expect(singletonResult.random.drawCount).toBe(0)
  })

  it('preserves duplicate multisets without mutating the input', () => {
    const input = Object.freeze(['A', 'B', 'A', 'C', 'B'])
    const snapshot = [...input]
    const result = shuffleWithRandom(input, createInitialRandomState('DUPLICATES'))

    expect([...result.value].sort()).toEqual([...input].sort())
    expect(input).toEqual(snapshot)
    expect(result.value).not.toBe(input)
  })

  it.each([
    { algorithm: 'OTHER', seed: 'VALID', state: 1, drawCount: 0 },
    { algorithm: RANDOM_ALGORITHM_ID, seed: '', state: 1, drawCount: 0 },
    { algorithm: RANDOM_ALGORITHM_ID, seed: 'VALID', state: 0, drawCount: 0 },
    { algorithm: RANDOM_ALGORITHM_ID, seed: 'VALID', state: 0x1_0000_0000, drawCount: 0 },
    { algorithm: RANDOM_ALGORITHM_ID, seed: 'VALID', state: 1.5, drawCount: 0 },
    { algorithm: RANDOM_ALGORITHM_ID, seed: 'VALID', state: 1, drawCount: -1 },
    { algorithm: RANDOM_ALGORITHM_ID, seed: 'VALID', state: 1, drawCount: 1.5 },
  ])('rejects invalid supplied random state %j', (invalid) => {
    expect(() => nextRandomUint32(invalid as RandomState)).toThrow(/Invalid random state/)
    expect(() => shuffleWithRandom([], invalid as RandomState)).toThrow(/Invalid random state/)
  })

  it('keeps Math.random out of every production TypeScript source file', () => {
    const sources = import.meta.glob('../../**/*.{ts,tsx}', {
      eager: true,
      query: '?raw',
      import: 'default',
    })
    const offenders = Object.entries(sources)
      .filter(([path]) => !path.includes('.test.'))
      .filter(([, source]) => typeof source === 'string' && source.includes('Math.random'))
      .map(([path]) => path)

    expect(offenders).toEqual([])
  })
})
