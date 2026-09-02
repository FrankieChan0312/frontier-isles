import type { RandomState } from '../model/game-state.ts'
import { RANDOM_ALGORITHM_ID } from '../model/ruleset.ts'

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193
const ZERO_STATE_FALLBACK = 0x6d2b79f5
const UINT32_RANGE = 0x1_0000_0000
const UINT32_MAX = UINT32_RANGE - 1

export interface RandomResult<T> {
  readonly value: T
  readonly random: RandomState
}

function assertValidRandomState(random: RandomState): void {
  if (random.algorithm !== RANDOM_ALGORITHM_ID) {
    throw new Error(
      `Invalid random state: expected algorithm ${RANDOM_ALGORITHM_ID}; received ${random.algorithm}.`,
    )
  }
  if (typeof random.seed !== 'string' || random.seed.length === 0) {
    throw new Error('Invalid random state: seed must be a non-empty string.')
  }
  if (!Number.isInteger(random.state) || random.state < 1 || random.state > UINT32_MAX) {
    throw new Error(
      `Invalid random state: state must be an unsigned 32-bit integer from 1 through ${UINT32_MAX}.`,
    )
  }
  if (!Number.isSafeInteger(random.drawCount) || random.drawCount < 0) {
    throw new Error('Invalid random state: drawCount must be a non-negative safe integer.')
  }
}

function cloneRandomState(random: RandomState): RandomState {
  return {
    algorithm: random.algorithm,
    seed: random.seed,
    state: random.state,
    drawCount: random.drawCount,
  }
}

export function createInitialRandomState(seed: string): RandomState {
  if (seed.length === 0) {
    throw new Error('Cannot create a random state from an empty seed.')
  }

  let hash = FNV_OFFSET_BASIS
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash ^ seed.charCodeAt(index)) >>> 0
    hash = Math.imul(hash, FNV_PRIME) >>> 0
  }

  if (hash === 0) {
    hash = ZERO_STATE_FALLBACK
  }

  return {
    algorithm: RANDOM_ALGORITHM_ID,
    seed,
    state: hash,
    drawCount: 0,
  }
}

export function nextRandomUint32(random: RandomState): RandomResult<number> {
  assertValidRandomState(random)
  if (random.drawCount === Number.MAX_SAFE_INTEGER) {
    throw new Error('Invalid random state: drawCount cannot be incremented safely.')
  }

  let nextState = random.state >>> 0
  nextState = (nextState ^ ((nextState << 13) >>> 0)) >>> 0
  nextState = (nextState ^ (nextState >>> 17)) >>> 0
  nextState = (nextState ^ ((nextState << 5) >>> 0)) >>> 0

  if (nextState === 0) {
    throw new Error('Invalid random transition: XORSHIFT32 produced the forbidden zero state.')
  }

  return {
    value: nextState,
    random: {
      algorithm: random.algorithm,
      seed: random.seed,
      state: nextState,
      drawCount: random.drawCount + 1,
    },
  }
}

export function nextRandomFloat(random: RandomState): RandomResult<number> {
  const draw = nextRandomUint32(random)
  return {
    value: draw.value / UINT32_RANGE,
    random: draw.random,
  }
}

export function nextRandomInt(
  random: RandomState,
  minInclusive: number,
  maxExclusive: number,
): RandomResult<number> {
  assertValidRandomState(random)
  if (!Number.isSafeInteger(minInclusive) || !Number.isSafeInteger(maxExclusive)) {
    throw new Error('Random integer bounds must both be safe integers.')
  }

  const span = maxExclusive - minInclusive
  if (maxExclusive <= minInclusive || span < 1 || span > UINT32_RANGE) {
    throw new Error(
      `Random integer range must be half-open with a span from 1 through ${UINT32_RANGE}.`,
    )
  }

  const limit = Math.floor(UINT32_RANGE / span) * span
  let currentRandom = cloneRandomState(random)

  for (;;) {
    const draw = nextRandomUint32(currentRandom)
    currentRandom = draw.random
    if (draw.value < limit) {
      return {
        value: minInclusive + (draw.value % span),
        random: currentRandom,
      }
    }
  }
}

export function shuffleWithRandom<T>(
  items: readonly T[],
  random: RandomState,
): RandomResult<readonly T[]> {
  assertValidRandomState(random)
  const shuffled = [...items]
  let currentRandom = cloneRandomState(random)

  for (let index = shuffled.length - 1; index >= 1; index -= 1) {
    const draw = nextRandomInt(currentRandom, 0, index + 1)
    currentRandom = draw.random
    const selected = shuffled[draw.value]
    const current = shuffled[index]
    if (selected === undefined || current === undefined) {
      throw new Error(`Immutable Fisher-Yates could not resolve indices ${draw.value} and ${index}.`)
    }
    shuffled[index] = selected
    shuffled[draw.value] = current
  }

  return { value: shuffled, random: currentRandom }
}
