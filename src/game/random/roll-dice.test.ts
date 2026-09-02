import type { RandomState } from '../model/game-state.ts'
import { RANDOM_ALGORITHM_ID } from '../model/ruleset.ts'
import { rollDice } from './roll-dice.ts'
import { nextRandomUint32 } from './seeded-random.ts'

function randomState(state: number, drawCount = 84): RandomState {
  return {
    algorithm: RANDOM_ALGORITHM_ID,
    seed: 'FRONTIER-ISLES-TASK-05',
    state,
    drawCount,
  }
}

describe('rollDice', () => {
  it('matches the frozen post-setup ordered dice and random anchor', () => {
    const input = randomState(3364541899)
    const firstRaw = nextRandomUint32(input)
    const secondRaw = nextRandomUint32(firstRaw.random)
    expect(firstRaw.value).toBe(3561776786)
    expect(secondRaw.value).toBe(1264537981)
    const result = rollDice(input)
    expect(result.value).toEqual({ dice: [3, 2], total: 5 })
    expect(result.random).toEqual({
      algorithm: RANDOM_ALGORITHM_ID,
      seed: 'FRONTIER-ISLES-TASK-05',
      state: 1264537981,
      drawCount: 86,
    })
  })

  it('matches the controlled total-seven anchor without sorting the dice', () => {
    const result = rollDice(randomState(259))
    expect(result.value).toEqual({ dice: [6, 1], total: 7 })
    expect(result.random.state).toBe(68079378)
    expect(result.random.drawCount).toBe(86)
  })

  it('returns fresh serializable data without mutating its input', () => {
    const input = randomState(3364541899)
    const snapshot = structuredClone(input)
    const result = rollDice(input)
    expect(input).toEqual(snapshot)
    expect(result.random).not.toBe(input)
    expect(JSON.parse(JSON.stringify(result))).toEqual(result)
  })

  it('reuses accepted random-state validation', () => {
    expect(() => rollDice({ ...randomState(1), state: 0 })).toThrow(/random state/i)
  })
})
