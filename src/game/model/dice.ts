export type DieValue = 1 | 2 | 3 | 4 | 5 | 6

export type DiceTotal = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12

export type NumberToken = 2 | 3 | 4 | 5 | 6 | 8 | 9 | 10 | 11 | 12

export interface DiceRoll {
  readonly dice: readonly [DieValue, DieValue]
  readonly total: DiceTotal
}

