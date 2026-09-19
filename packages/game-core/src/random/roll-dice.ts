import type { DiceRoll, DiceTotal, DieValue } from '../model/dice.ts'
import type { RandomState } from '../model/game-state.ts'
import { nextRandomInt } from './seeded-random.ts'
import type { RandomResult } from './seeded-random.ts'

function isDieValue(value: number): value is DieValue {
  return Number.isInteger(value) && value >= 1 && value <= 6
}

function isDiceTotal(value: number): value is DiceTotal {
  return Number.isInteger(value) && value >= 2 && value <= 12
}

export function rollDice(random: RandomState): RandomResult<DiceRoll> {
  const firstResult = nextRandomInt(random, 1, 7)
  const secondResult = nextRandomInt(firstResult.random, 1, 7)
  const firstDie = firstResult.value
  const secondDie = secondResult.value
  const total = firstDie + secondDie

  if (!isDieValue(firstDie) || !isDieValue(secondDie) || !isDiceTotal(total)) {
    throw new Error(
      `Invalid dice roll: expected two values from 1 through 6 and a total from 2 through 12; received [${firstDie}, ${secondDie}] total ${total}.`,
    )
  }

  return {
    value: {
      dice: [firstDie, secondDie],
      total,
    },
    random: secondResult.random,
  }
}
