import type { AiAgent } from '../ai-agent.ts'
import { simulateCoreAiGame } from './core-ai-simulation.ts'

describe('core AI deterministic simulations', () => {
  it('produces an identical summary for an identical seed', async () => {
    const first = await simulateCoreAiGame('CORE-AI-DETERMINISM')
    const second = await simulateCoreAiGame('CORE-AI-DETERMINISM')
    expect(first).toEqual(second)
  }, 30_000)

  it('rejects invalid AI output through the normal engine with a complete trace', async () => {
    const invalidAgent: AiAgent = {
      chooseNextCommand: () => Promise.resolve({ type: 'END_TURN' }),
    }
    await expect(simulateCoreAiGame('CORE-AI-INVALID', { agent: invalidAgent }))
      .rejects.toThrow(/seed=CORE-AI-INVALID.*phase=SETUP_SETTLEMENT.*command=END_TURN/)
  })
})
