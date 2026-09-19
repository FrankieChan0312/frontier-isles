import { describe, expect, it } from 'vitest'
import { simulateOnlineGame } from './online-game-simulation.js'

describe('complete authoritative mixed seating games over Socket.IO', () => {
  it.each([2, 3, 4] as const)('%i Humans reach the same legal winner on a repeated seed', async (humans) => {
    const seed = 'GOAL-B-ONLINE-001'
    const first = await simulateOnlineGame(humans, seed)
    const repeated = await simulateOnlineGame(humans, seed)
    expect(repeated).toEqual(first)
    expect(first.commands).toBeGreaterThan(16)
    expect(first.finalVersion).toBe(first.commands)
    expect(first.humanCommands).toBeGreaterThan(0)
    expect(first.aiCommands).toBe(humans === 4 ? 0 : first.commands - first.humanCommands)
    if (humans < 4) expect(first.aiCommands).toBeGreaterThan(0)
    expect(first.publicScores.some((score) => score.points >= 10)).toBe(true)
  }, 180_000)
})
