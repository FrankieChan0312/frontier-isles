import { afterAll, afterEach, describe, expect, it } from 'vitest'
import type { GameCommand } from '@frontier-isles/game-core/contracts/commands'
import type { GameState } from '@frontier-isles/game-core/model/game-state'
import type { GameConfig } from '@frontier-isles/game-core/model/game-config'
import type { EdgeId, TileId, TradeId, VertexId } from '@frontier-isles/game-core/model/ids'
import type { TradeOffer } from '@frontier-isles/game-core/model/trade'
import { createEmptyResourceBag } from '@frontier-isles/game-core/model/resource'
import { assertTradingState } from '@frontier-isles/game-core/engine/trading-invariants'
import { GAME_COMMAND_TYPES, REALTIME_PROTOCOL_VERSION, gameCommandAcknowledgementSchema, gameCommandRequestSchema, type GameUpdate } from '@frontier-isles/realtime-contracts'
import { networkGame, networkSnapshot, startNetworkGame, type NetworkGame } from './game-network-helpers.js'
import { requireValue, successData } from './game-test-helpers.js'
import { workflowFixture, type WorkflowScenario } from './online-workflow-fixtures.js'

const games: NetworkGame[] = []
const covered = new Set<GameCommand['type']>()
const empty = createEmptyResourceBag()
let commandNumber = 0

async function fixture(scenario?: WorkflowScenario, humans = 2): Promise<NetworkGame> {
  let previousVersion: number | null = null
  const game = await networkGame(humans, {
    ...(scenario === undefined ? {} : { createState: (config: GameConfig) => {
      const state = workflowFixture(scenario, config)
      previousVersion = state.stateVersion
      return state
    } }),
    afterTransition: (state: GameState) => {
      assertTradingState(state)
      if (previousVersion !== null) expect(state.stateVersion).toBe(previousVersion + 1)
      previousVersion = state.stateVersion
    },
  })
  games.push(game)
  await startNetworkGame(game)
  return game
}

async function view(network: NetworkGame, index = 0): Promise<GameUpdate> {
  return networkSnapshot(network, requireValue(network.clients[index]))
}

async function submit(network: NetworkGame, index: number, command: GameCommand, accepted = true): Promise<void> {
  const before = await view(network, index)
  const request = gameCommandRequestSchema.parse({ protocolVersion: REALTIME_PROTOCOL_VERSION,
    roomCode: network.snapshot().roomCode, gameId: before.gameId,
    commandId: `human:workflow:${commandNumber++}`, expectedStateVersion: before.view.stateVersion, command })
  const acknowledgement = gameCommandAcknowledgementSchema.parse(await requireValue(network.clients[index]).timeout(5_000).emitWithAck('game:command', request))
  const outcome = successData(acknowledgement)
  expect(outcome.accepted).toBe(accepted)
  expect(Object.keys(outcome).sort()).toEqual((accepted ? ['accepted', 'commandId', 'stateVersion'] : ['accepted', 'commandId', 'stateVersion', 'violation']).sort())
  if (accepted) covered.add(command.type)
  else expect(outcome.stateVersion).toBe(before.view.stateVersion)
  await requireValue(network.service.getGameSession(network.snapshot().roomCode)).advanceAi()
  // V2-09: replay every command family through the real delivery boundary, including
  // results whose original state version now precedes automatic AI advancement.
  const beforeReplay = await view(network, index)
  const publicationsBeforeReplay = network.updates.map((entries) => entries.length)
  const replay = gameCommandAcknowledgementSchema.parse(await requireValue(network.clients[index]).timeout(5_000).emitWithAck('game:command', request))
  expect(replay).toEqual(acknowledgement)
  expect(await view(network, index)).toEqual(beforeReplay)
  expect(network.updates.map((entries) => entries.length)).toEqual(publicationsBeforeReplay)
  const updates = await Promise.all(network.clients.map((client) => networkSnapshot(network, client)))
  const publicState = requireValue(updates[0]).view.publicGame
  for (const [viewer, update] of updates.entries()) {
    expect(update.view.self.id).toBe(`player:${network.snapshot().roomCode}:${requireValue(network.members[viewer]).credential.seatId}`)
    expect(update.view.publicGame).toEqual(publicState)
    for (const opponent of update.view.opponents) {
      expect(opponent).not.toHaveProperty('resources')
      expect(opponent).not.toHaveProperty('developmentCards')
      expect(opponent).not.toHaveProperty('actualVictoryPoints')
    }
    expect(update).not.toHaveProperty('state')
    expect(update.view.publicGame).not.toHaveProperty('random')
    expect(update.view.publicGame.bank).not.toHaveProperty('developmentDeck')
  }
}

async function offer(network: NetworkGame, counterpartyIndex: number, suffix: string): Promise<TradeOffer> {
  const snapshot = (await view(network)).view
  const counterpartyId = requireValue(snapshot.opponents[counterpartyIndex - 1]).id
  return { tradeId: `trade:online:${suffix}` as TradeId, initiatorId: snapshot.self.id,
    counterpartyId, proposedById: snapshot.self.id, parentTradeId: null,
    initiatorGives: { ...empty, LUMBER: 1 }, counterpartyGives: { ...empty, BRICK: 1 } }
}

afterEach(async () => { for (const game of games.splice(0)) await game.close() })
afterAll(() => { expect([...covered].sort()).toEqual([...GAME_COMMAND_TYPES].sort()) })

describe('all Base Game command families over the authoritative online wire', () => {
  it('performs the full four-Human setup snake and crosses normal turn authority', async () => {
    const network = await fixture(undefined, 4)
    const actors: string[] = []
    for (let step = 0; step < 16; step += 1) {
      const first = (await view(network)).view
      const index = network.members.findIndex((member) => `player:${network.snapshot().roomCode}:${member.credential.seatId}` === first.publicGame.turn.currentPlayerId)
      const actor = (await view(network, index)).view
      actors.push(requireValue(network.members[index]).credential.seatId)
      await submit(network, index, actor.publicGame.turn.phase === 'SETUP_SETTLEMENT'
        ? { type: 'PLACE_INITIAL_SETTLEMENT', vertexId: requireValue(actor.legalActions.legalInitialSettlementVertexIds?.[0]) }
        : { type: 'PLACE_INITIAL_ROAD', edgeId: requireValue(actor.legalActions.legalInitialRoadEdgeIds?.[0]) })
    }
    expect(actors).toEqual(['NORTH', 'NORTH', 'EAST', 'EAST', 'SOUTH', 'SOUTH', 'WEST', 'WEST', 'WEST', 'WEST', 'SOUTH', 'SOUTH', 'EAST', 'EAST', 'NORTH', 'NORTH'])
    await submit(network, 1, { type: 'ROLL_DICE' }, false)
    await submit(network, 0, { type: 'ROLL_DICE' })
    await submit(network, 0, { type: 'END_TURN' })
    expect((await view(network, 1)).view.legalActions.canRollDice).toBe(true)
  })

  it.each(['PRODUCTION', 'MULTI_SHORTAGE', 'SINGLE_SHORTAGE'] as const)('preserves production and %s allocation', async (scenario) => {
    const network = await fixture(scenario)
    const before = (await view(network)).view.publicGame.bank.resources.GRAIN
    await submit(network, 0, { type: 'ROLL_DICE' })
    const after = (await view(network)).view
    expect(after.publicGame.turn.lastRoll?.total).toBe(8)
    expect(before - after.publicGame.bank.resources.GRAIN).toBe(scenario === 'PRODUCTION' ? 4 : scenario === 'MULTI_SHORTAGE' ? 0 : 1)
    const events = requireValue(network.updates[0]).flatMap((update) => update.events)
    expect(events.some((event) => event.type === 'RESOURCE_PRODUCTION_BLOCKED')).toBe(scenario !== 'PRODUCTION')
  })

  it('pauses on each private Human discard, resumes AI, moves the robber and redacts random theft', async () => {
    const network = await fixture('SEVEN')
    await submit(network, 0, { type: 'ROLL_DICE' })
    expect((await view(network)).view.pendingDecision).toEqual({ type: 'DISCARD_RESOURCES', requiredCount: 4 })
    expect((await view(network, 1)).view.pendingDecision).toEqual({ type: 'DISCARD_RESOURCES', requiredCount: 4 })
    await submit(network, 0, { type: 'DISCARD_RESOURCES', resources: { ...empty, LUMBER: 4 } })
    expect((await view(network)).view.pendingDecision?.type).toBe('AWAITING_DISCARDS')
    await submit(network, 1, { type: 'DISCARD_RESOURCES', resources: { ...empty, BRICK: 4 } })
    expect((await view(network)).view.pendingDecision?.type).toBe('MOVE_ROBBER')
    await submit(network, 0, { type: 'MOVE_ROBBER', tileId: 'tile:-2,2' as TileId })
    const actor = (await view(network)).view
    await submit(network, 1, { type: 'STEAL_FROM_PLAYER', targetPlayerId: actor.self.id }, false)
    await submit(network, 0, { type: 'STEAL_FROM_PLAYER', targetPlayerId: requireValue(actor.legalActions.eligibleRobberTargetPlayerIds[0]) })
    expect((await view(network)).view.pendingDecision).toBeNull()
    const observerId = (await view(network, 1)).view.self.id
    const foreignDiscards = requireValue(network.updates[1]).flatMap((update) => update.events)
      .filter((event) => event.type === 'RESOURCES_DISCARDED' && event.playerId !== observerId)
    expect(foreignDiscards.length).toBeGreaterThan(0)
    expect(foreignDiscards.every((event) => event.type === 'RESOURCES_DISCARDED' && event.resources === null)).toBe(true)
  })

  it('builds roads, a settlement and city, buys an owner-only hidden Victory Point, and trades with the bank', async () => {
    const network = await fixture('BUILD_TRADE')
    for (const edgeId of ['edge:vertex:-1,-1,2|vertex:1,-2,1', 'edge:vertex:1,-2,1|vertex:2,-1,-1'] as EdgeId[]) {
      await submit(network, 0, { type: 'BUILD_ROAD', edgeId })
    }
    await submit(network, 0, { type: 'BUILD_SETTLEMENT', vertexId: 'vertex:2,-1,-1' as VertexId })
    await submit(network, 0, { type: 'UPGRADE_CITY', vertexId: 'vertex:2,-1,-1' as VertexId })
    const points = (await view(network)).view.self.publicVictoryPoints
    await submit(network, 0, { type: 'BUY_DEVELOPMENT_CARD' })
    const owner = (await view(network)).view
    expect(owner.self.developmentCards[0]?.type).toBe('VICTORY_POINT')
    expect(owner.self.publicVictoryPoints).toBe(points)
    expect(owner.self.actualVictoryPoints).toBe(points + 1)
    expect(requireValue(network.updates[1]).flatMap((update) => update.events)).toContainEqual({ type: 'DEVELOPMENT_CARD_BOUGHT', ownerId: owner.self.id, acquiredTurnNumber: 1, cardId: null, cardType: null })
    const option = requireValue(owner.legalActions.legalMaritimeTradeOptions[0])
    const bankBefore = owner.publicGame.bank.resources
    await submit(network, 0, { type: 'MARITIME_TRADE', giveResource: option.giveResource, receiveResource: option.receiveResource })
    const bankAfter = (await view(network)).view.publicGame.bank.resources
    expect(bankAfter[option.giveResource] - bankBefore[option.giveResource]).toBe(option.ratio)
    expect(bankBefore[option.receiveResource] - bankAfter[option.receiveResource]).toBe(1)
  })

  it.each(['KNIGHT', 'ROAD_BUILDING', 'INVENTION', 'MONOPOLY', 'FREE_ROAD_FINISH'] as const)('resolves %s with only the correct Human controls', async (scenario) => {
    const network = await fixture(scenario)
    const before = (await view(network)).view
    const cardId = requireValue(before.legalActions.playableDevelopmentCardIds[0])
    await submit(network, 0, { type: 'PLAY_DEVELOPMENT_CARD', cardId })
    expect((await view(network, 1)).view.legalActions.permittedCommandTypes).toEqual([])
    if (scenario === 'KNIGHT') {
      expect((await view(network)).view.publicGame.awards.largestArmyHolderId).toBe(before.self.id)
      await submit(network, 0, { type: 'MOVE_ROBBER', tileId: 'tile:-2,2' as TileId })
      await submit(network, 0, { type: 'STEAL_FROM_PLAYER', targetPlayerId: requireValue((await view(network)).view.legalActions.eligibleRobberTargetPlayerIds[0]) })
    } else if (scenario === 'INVENTION') {
      await submit(network, 0, { type: 'CHOOSE_INVENTION_RESOURCES', resources: requireValue((await view(network)).view.legalActions.legalInventionSelections?.[0]) })
    } else if (scenario === 'MONOPOLY') {
      const bank = before.publicGame.bank.resources
      await submit(network, 0, { type: 'CHOOSE_MONOPOLY_RESOURCE', resource: 'BRICK' })
      expect((await view(network)).view.self.resources.BRICK).toBe(19 - bank.BRICK)
    } else {
      await submit(network, 0, { type: 'FINISH_FREE_ROAD_PLACEMENT' }, false)
      await submit(network, 0, { type: 'BUILD_ROAD', edgeId: requireValue((await view(network)).view.legalActions.legalRoadEdgeIds[0]) })
      if (scenario === 'FREE_ROAD_FINISH') await submit(network, 0, { type: 'FINISH_FREE_ROAD_PLACEMENT' })
      else await submit(network, 0, { type: 'BUILD_ROAD', edgeId: requireValue((await view(network)).view.legalActions.legalRoadEdgeIds[0]) })
      expect((await view(network)).view.self.resources).toEqual(before.self.resources)
    }
    expect((await view(network)).view.pendingDecision).toBeNull()
    expect((await view(network)).view.publicGame.turn.developmentCardPlayedThisTurn).toBe(true)
  })

  it('awards Longest Road on the fifth connected road', async () => {
    const network = await fixture('LONGEST_ROAD')
    const before = (await view(network)).view
    expect(before.publicGame.awards.longestRoadHolderId).toBeNull()
    await submit(network, 0, { type: 'BUILD_ROAD', edgeId: 'edge:vertex:-1,-1,2|vertex:1,-2,1' as EdgeId })
    expect((await view(network)).view.publicGame.awards.longestRoadHolderId).toBe(before.self.id)
    expect((await view(network)).view.self.publicVictoryPoints).toBe(before.self.publicVictoryPoints + 2)
  })

  it('accepts/rejects Human offers, atomically settles a counter, and forbids a second counter or wrong responder', async () => {
    const network = await fixture('BUILD_TRADE')
    const initial = await offer(network, 1, 'accept')
    const before = (await view(network)).view.self.resources
    await submit(network, 0, { type: 'PROPOSE_TRADE', offer: initial })
    await submit(network, 0, { type: 'ACCEPT_TRADE', tradeId: initial.tradeId }, false)
    await submit(network, 1, { type: 'ACCEPT_TRADE', tradeId: initial.tradeId })
    expect((await view(network)).view.self.resources).toEqual({ ...before, LUMBER: before.LUMBER - 1, BRICK: before.BRICK + 1 })
    const rejected = await offer(network, 1, 'reject')
    await submit(network, 0, { type: 'PROPOSE_TRADE', offer: rejected })
    await submit(network, 1, { type: 'REJECT_TRADE', tradeId: rejected.tradeId })
    const original = await offer(network, 1, 'counter')
    await submit(network, 0, { type: 'PROPOSE_TRADE', offer: original })
    const counter: TradeOffer = { ...original, tradeId: 'trade:online:counter-terms' as TradeId,
      proposedById: original.counterpartyId, parentTradeId: original.tradeId,
      initiatorGives: { ...empty, LUMBER: 2 }, counterpartyGives: { ...empty, BRICK: 2 } }
    await submit(network, 1, { type: 'COUNTER_TRADE', previousTradeId: original.tradeId, offer: counter })
    expect((await view(network)).view.legalActions.tradeResponse?.canCounter).toBe(false)
    await submit(network, 0, { type: 'COUNTER_TRADE', previousTradeId: counter.tradeId,
      offer: { ...counter, tradeId: 'trade:online:second-counter' as TradeId, parentTradeId: counter.tradeId, proposedById: original.initiatorId } }, false)
    await submit(network, 0, { type: 'ACCEPT_TRADE', tradeId: counter.tradeId })
    expect((await view(network)).view.pendingDecision).toBeNull()
  })

  it('routes a Human offer to the authoritative AI and publishes its response', async () => {
    const network = await fixture('BUILD_TRADE')
    const initial = await offer(network, 2, 'to-ai')
    await submit(network, 0, { type: 'PROPOSE_TRADE', offer: { ...initial, initiatorGives: { ...empty, ORE: 3 } } })
    const after = (await view(network)).view
    expect(after.pendingDecision).toBeNull()
    expect(requireValue(network.updates[0]).flatMap((update) => update.events).some((event) => event.type === 'TRADE_COMPLETED')).toBe(true)
  })

  it.each(['ACCEPT', 'REJECT'] as const)('the shared AI initiates toward a Human and can %s that Human counter', async (response) => {
    const network = await fixture('AI_TRADE')
    const human = (await view(network, 1)).view
    const pending = human.pendingDecision
    if (pending?.type !== 'RESPOND_TO_TRADE') throw new Error('Expected the shared AI to propose to the EAST Human.')
    expect(pending.offer.initiatorId).toBe(`player:${network.snapshot().roomCode}:SOUTH`)
    expect(pending.offer.counterpartyId).toBe(human.self.id)
    expect((await view(network)).view.pendingDecision?.type).toBe('TRADE_IN_PROGRESS')
    await submit(network, 0, { type: 'REJECT_TRADE', tradeId: pending.offer.tradeId }, false)
    const terms: TradeOffer = { ...pending.offer, tradeId: `trade:online:human-counter-${response}` as TradeId,
      parentTradeId: pending.offer.tradeId, proposedById: human.self.id,
      initiatorGives: response === 'REJECT' ? { ...empty, WOOL: 19 } : pending.offer.initiatorGives,
      counterpartyGives: Object.fromEntries(Object.entries(pending.offer.counterpartyGives).map(([resource, count]) => [resource, count * (response === 'ACCEPT' ? 3 : 1)])) as TradeOffer['counterpartyGives'],
    }
    await submit(network, 1, { type: 'COUNTER_TRADE', previousTradeId: pending.offer.tradeId, offer: terms })
    const events = requireValue(network.updates[1]).flatMap((update) => update.events)
    expect(events.some((event) => response === 'ACCEPT'
      ? event.type === 'TRADE_COMPLETED' && event.offer.tradeId === terms.tradeId
      : event.type === 'TRADE_REJECTED' && event.tradeId === terms.tradeId)).toBe(true)
    expect(events.some((event) => event.type === 'TRADE_COUNTERED' && event.previousTradeId === terms.tradeId)).toBe(false)
  })

  it('reveals only winning points, finishes the same Session for every Human and rejects further actions', async () => {
    const network = await fixture('VICTORY', 4)
    const before = (await view(network)).view
    expect(before.self.actualVictoryPoints).toBe(9)
    expect(before.self.publicVictoryPoints).toBe(4)
    await submit(network, 0, { type: 'UPGRADE_CITY', vertexId: requireValue(before.legalActions.legalCityUpgradeVertexIds[0]) })
    for (const [index] of network.clients.entries()) {
      const update = await view(network, index)
      expect(update.gameId).toBe(before.publicGame.gameId)
      expect(update.lifecycleStatus).toBe('FINISHED')
      expect(update.view.publicGame.winnerId).toBe(before.self.id)
      expect(update.view.legalActions.permittedCommandTypes).toEqual([])
    }
    expect(network.snapshot().lifecycleStatus).toBe('FINISHED')
    await submit(network, 0, { type: 'END_TURN' }, false)
  })
})
