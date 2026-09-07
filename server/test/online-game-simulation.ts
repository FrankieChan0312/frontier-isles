import { createHash } from 'node:crypto'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { PlayerView } from '@frontier-isles/game-core/contracts/views'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import type { AiProfileId, PlayerId } from '@frontier-isles/game-core/model/ids'
import { createOnlineGame } from '@frontier-isles/game-core/engine/create-game'
import { assertTradingState } from '@frontier-isles/game-core/engine/trading-invariants'
import { deriveActualVictoryPoints } from '@frontier-isles/game-core/rules/scoring'
import { rollDice } from '@frontier-isles/game-core/random/roll-dice'
import { nextRandomInt } from '@frontier-isles/game-core/random/seeded-random'
import { PersonalityAiAgent } from '@frontier-isles/game-ai/personality-ai-agent'
import { createAiCommandKey } from '@frontier-isles/game-ai/core-ai-agent'
import { DEFAULT_AI_SAFETY_LIMITS } from '@frontier-isles/game-ai/ai-agent'
import { CANONICAL_SEAT_IDS, REALTIME_PROTOCOL_VERSION, gameCommandAcknowledgementSchema, gameCommandRequestSchema, type GameUpdate, type SeatId } from '@frontier-isles/realtime-contracts'
import { networkGame, networkSnapshot, startNetworkGame } from './game-network-helpers.js'
import { requireValue, successData } from './game-test-helpers.js'

export interface OnlineSimulationSummary {
  readonly humans: number
  readonly seed: string
  readonly winnerSeat: string
  readonly commands: number
  readonly humanCommands: number
  readonly aiCommands: number
  readonly turns: number
  readonly finalVersion: number
  readonly randomDraws: number
  readonly publicScores: readonly { readonly seat: SeatId; readonly points: number }[]
  readonly commandTypes: readonly GameCommand['type'][]
  readonly publicTraceHash: string
}

function seat(id: PlayerId): string { return requireValue(id.split(':').at(-1)) }
function identity(view: PlayerView): string {
  const turn = view.publicGame.turn
  return turn.setup === null ? `${turn.turnNumber}:${turn.currentPlayerId}`
    : `setup:${turn.setup.round}:${turn.setup.placementIndex}:${turn.currentPlayerId}`
}
function freezeTree(value: unknown): void {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return
  for (const child of Object.values(value)) freezeTree(child)
  Object.freeze(value)
}

/** Test-only Human automation. Each decision gets only that Human's network PlayerView. */
export async function simulateOnlineGame(humans: 2 | 3 | 4, seed: string): Promise<OnlineSimulationSummary> {
  const maxCommands = 5_000
  const maxTurns = 1_000
  const trace: string[] = []
  const digest = createHash('sha256')
  const commandTypes = new Set<GameCommand['type']>()
  let previous: GameState | null = null
  let current: GameState | null = null
  let transitionFailure: string | null = null
  let humanCommands = 0
  const network = await networkGame(humans, {
    createState: (config, gameSeed) => {
      const state = createOnlineGame(config, gameSeed)
      assertTradingState(state)
      freezeTree(state)
      previous = state
      current = state
      return state
    },
    afterTransition: (state, command) => {
      const before = requireValue(previous)
      const publicStep = `${state.stateVersion}:turn=${seat(before.turn.currentPlayerId)}:${command.type}:${state.turn.phase}:${state.turn.turnNumber}`
      trace.push(publicStep)
      if (trace.length > 25) trace.shift()
      try {
        assertTradingState(state) // Includes topology, resource/card/piece/score and RNG invariants.
        if (state === before || state.stateVersion !== before.stateVersion + 1) throw new Error('Version/immutability invariant')
        const expectedRandom = command.type === 'ROLL_DICE' ? rollDice(before.random).random
          : command.type === 'STEAL_FROM_PLAYER' ? nextRandomInt(before.random, 0,
            Object.values(requireValue(before.players[command.targetPlayerId]).resources).reduce((sum, count) => sum + count, 0)).random
            : before.random
        if (JSON.stringify(state.random) !== JSON.stringify(expectedRandom)) throw new Error('RNG transition invariant')
        if (expectedRandom === before.random && state.random !== before.random) throw new Error('Unexpected RNG replacement')
        if (state.stateVersion > maxCommands || state.turn.turnNumber > maxTurns) throw new Error('Explicit game safety bound')
        if (state.winnerId !== null && deriveActualVictoryPoints(state, state.winnerId) < 10) throw new Error('Winner score invariant')
        freezeTree(state)
      } catch {
        transitionFailure = `Invariant or bound failed at ${publicStep}`
        throw new Error(transitionFailure)
      }
      commandTypes.add(command.type)
      digest.update(`${publicStep}\n`)
      previous = state
      current = state
    },
  }, seed)
  const agent = new PersonalityAiAgent()
  const histories = new Map<PlayerId, { readonly turn: string; readonly keys: string[] }>()
  const profiles = ['MERCHANT', 'SENTINEL', 'BUILDER', 'MERCHANT'] as const
  let operation = 'start-game'
  let failureMessage: string
  try {
    await startNetworkGame(network)
    const game = requireValue(network.service.getGameSession(network.snapshot().roomCode))
    for (let step = 0; step < maxCommands; step += 1) {
      operation = 'advance-server-ai'
      await game.advanceAi()
      if (transitionFailure !== null || game.lifecycleStatus === 'ERROR') throw new Error(transitionFailure ?? 'Server AI failed')
      const views: GameUpdate[] = []
      for (const [index, client] of network.clients.entries()) {
        operation = `snapshot:${requireValue(CANONICAL_SEAT_IDS[index])}`
        views.push(await networkSnapshot(network, client))
      }
      operation = 'verify-viewer-and-public-state'
      const first = requireValue(views[0])
      if (views.some((update, index) => update.view.self.id !== game.playerForSession(requireValue(network.members[index]).credential.sessionId)
        || JSON.stringify(update.view.publicGame) !== JSON.stringify(first.view.publicGame))) throw new Error('Viewer/public synchronization invariant')
      // The shared helper validates each incoming publication and retains history for focused
      // event tests. Complete games use current snapshots, so release their unused old views.
      for (const captured of network.updates) captured.length = 0
      if (first.lifecycleStatus === 'FINISHED') {
        operation = 'verify-finished-game'
        const final = requireValue<GameState>(current)
        const winnerId = requireValue(final.winnerId)
        if (network.snapshot().lifecycleStatus !== 'FINISHED' || final.turn.phase !== 'GAME_OVER'
          || final.pendingDecision !== null || winnerId !== final.turn.currentPlayerId) throw new Error('Game-over lifecycle invariant')
        const publicPlayers = [first.view.self, ...first.view.opponents]
        const scores = CANONICAL_SEAT_IDS.map((seatId) => ({ seat: seatId,
          points: requireValue(publicPlayers.find((player) => seat(player.id) === seatId)).publicVictoryPoints }))
        return { humans, seed, winnerSeat: seat(winnerId), commands: final.stateVersion, humanCommands,
          aiCommands: final.stateVersion - humanCommands, turns: final.turn.turnNumber,
          finalVersion: final.stateVersion, randomDraws: final.random.drawCount, publicScores: scores,
          commandTypes: [...commandTypes].sort(), publicTraceHash: digest.digest('hex') }
      }
      const index = views.findIndex((update) => (update.view.legalActions.permittedCommandTypes?.length ?? 0) > 0)
      const view = requireValue(views[index]).view
      operation = `choose-command:${seat(view.self.id)}`
      const turn = identity(view)
      const savedHistory = histories.get(view.self.id)
      const keys = savedHistory?.turn === turn ? savedHistory.keys : []
      const command = await agent.chooseNextCommand(view, {
        profileId: requireValue(profiles[index]) as AiProfileId, commandNumberThisTurn: keys.length,
        commandNumberThisGame: humanCommands, previousCommandKeysThisTurn: [...keys], limits: DEFAULT_AI_SAFETY_LIMITS,
      })
      operation = `validate-command:${seat(view.self.id)}:${command.type}`
      const request = gameCommandRequestSchema.parse({ protocolVersion: REALTIME_PROTOCOL_VERSION,
        roomCode: network.snapshot().roomCode, gameId: game.gameId, commandId: `human:simulation:${humanCommands}`,
        expectedStateVersion: view.stateVersion, command })
      trace.push(`request:${view.stateVersion}:${seat(view.self.id)}:${command.type}`)
      if (trace.length > 25) trace.shift()
      operation = `command-ack:${seat(view.self.id)}:${command.type}`
      const result = successData(gameCommandAcknowledgementSchema.parse(await requireValue(network.clients[index])
        .timeout(5_000).emitWithAck('game:command', request)))
      if (!result.accepted) {
        operation = `rejected:${seat(view.self.id)}:${command.type}:${result.violation.code}`
        throw new Error('Human command rejected')
      }
      humanCommands += 1
      histories.set(view.self.id, { turn, keys: [...keys, createAiCommandKey(command)] })
    }
    throw new Error('Human command bound reached')
  } catch (error: unknown) {
    // No hands, card identities, commands' private payloads, tokens or RNG cursor in traces.
    const category = error instanceof Error && error.message === 'operation has timed out' ? 'ACK_TIMEOUT' : 'CHECK_FAILED'
    const connected = network.clients.filter((client) => client.connected).length
    failureMessage = `Online ${humans}H seed=${seed}: ${transitionFailure ?? category}; operation=${operation}; connected=${connected}/${humans}; public trace=${trace.join(' | ')}`
  } finally { await network.close() }
  // Emit only the sanitized diagnostic after cleanup; never attach an unrestricted cause.
  throw new Error(failureMessage)
}
