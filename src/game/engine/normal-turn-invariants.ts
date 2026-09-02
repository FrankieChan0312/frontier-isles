import { assertStandardBoardTopology } from '../board/topology-invariants.ts'
import type { DiceRoll } from '../model/dice.ts'
import type { GameState } from '../model/game-state.ts'
import type { EdgeId, PlayerId, TileId, VertexId } from '../model/ids.ts'
import type { PendingDecision, RobberCause } from '../model/pending-decision.ts'
import { RESOURCE_TYPES } from '../model/resource.ts'
import {
  GAME_STATE_SCHEMA_VERSION,
  RANDOM_ALGORITHM_ID,
  RULESET_ID,
} from '../model/ruleset.ts'
import { deriveEligibleRobberTargetPlayerIds } from '../rules/robber-target-rules.ts'
import { assertInitialSetupState } from './initial-setup-invariants.ts'

const TERRAIN_TYPES = new Set<string>([
  'FOREST',
  'HILLS',
  'PASTURE',
  'FIELDS',
  'MOUNTAINS',
  'DESERT',
])
const NUMBER_TOKENS = new Set<number>([2, 3, 4, 5, 6, 8, 9, 10, 11, 12])
const GAME_PHASES = new Set<string>([
  'SETUP_SETTLEMENT',
  'SETUP_ROAD',
  'ROLL_REQUIRED',
  'DISCARD_REQUIRED',
  'ROBBER_MOVE_REQUIRED',
  'ROBBER_TARGET_REQUIRED',
  'ACTION',
  'FREE_ROAD_PLACEMENT',
  'GAME_OVER',
])

function assertInvariant(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Invalid normal-turn state: ${message}`)
}

function assertKnownPlayer(state: GameState, playerId: PlayerId, label: string): void {
  assertInvariant(state.players[playerId] !== undefined, `${label} references unknown player ${playerId}.`)
}

function assertDiceRoll(roll: DiceRoll, label: string): void {
  const first = roll.dice[0]
  const second = roll.dice[1]
  assertInvariant(
    Number.isInteger(first) && first >= 1 && first <= 6
      && Number.isInteger(second) && second >= 1 && second <= 6,
    `${label} must contain two die values from 1 through 6.`,
  )
  assertInvariant(roll.total === first + second, `${label} total must equal its ordered dice.`)
}

function assertResources(state: GameState): void {
  for (const resource of RESOURCE_TYPES) {
    const bankCount = state.bank.resources[resource]
    assertInvariant(
      Number.isSafeInteger(bankCount) && bankCount >= 0,
      `bank ${resource} must be a non-negative safe integer.`,
    )
  }
  for (const playerId of state.playerOrder) {
    const player = state.players[playerId]
    assertInvariant(player !== undefined, `player ${playerId} is missing.`)
    for (const resource of RESOURCE_TYPES) {
      const count = player.resources[resource]
      assertInvariant(
        Number.isSafeInteger(count) && count >= 0,
        `player ${playerId} ${resource} must be a non-negative safe integer.`,
      )
    }
  }
}

function assertBoard(state: GameState): void {
  assertStandardBoardTopology(state.board.topology)
  const topologyTileIds = Object.keys(state.board.topology.tiles) as TileId[]
  const contentTileIds = Object.keys(state.board.tileContents) as TileId[]
  assertInvariant(contentTileIds.length === topologyTileIds.length, 'tile-content key count must match topology.')
  for (const tileId of topologyTileIds) {
    assertInvariant(Object.hasOwn(state.board.tileContents, tileId), `tile content is missing ${tileId}.`)
    const content = state.board.tileContents[tileId]
    assertInvariant(content !== undefined, `tile content is missing ${tileId}.`)
    assertInvariant(TERRAIN_TYPES.has(content.terrain), `tile ${tileId} has unknown terrain ${content.terrain}.`)
    if (content.terrain === 'DESERT') {
      assertInvariant(content.numberToken === null, `desert tile ${tileId} must not be numbered.`)
    } else {
      assertInvariant(
        content.numberToken !== null && NUMBER_TOKENS.has(content.numberToken),
        `producing tile ${tileId} must have a valid number token.`,
      )
    }
  }
  for (const tileId of contentTileIds) {
    assertInvariant(state.board.topology.tiles[tileId] !== undefined, `tile content contains unknown ID ${tileId}.`)
  }
  assertInvariant(state.board.topology.tiles[state.board.robberTileId] !== undefined, `robber tile ${state.board.robberTileId} is unknown.`)

  const topologyVertexIds = Object.keys(state.board.topology.vertices) as VertexId[]
  const occupancyVertexIds = Object.keys(state.board.vertexOccupancy) as VertexId[]
  assertInvariant(occupancyVertexIds.length === topologyVertexIds.length, 'vertex occupancy key count must match topology.')
  for (const vertexId of topologyVertexIds) {
    assertInvariant(Object.hasOwn(state.board.vertexOccupancy, vertexId), `vertex occupancy is missing ${vertexId}.`)
    const building = state.board.vertexOccupancy[vertexId]
    if (building !== null && building !== undefined) {
      assertKnownPlayer(state, building.ownerId, `vertex ${vertexId}`)
      assertInvariant(
        building.type === 'SETTLEMENT' || building.type === 'CITY',
        `vertex ${vertexId} has an invalid building type.`,
      )
    }
  }
  for (const vertexId of occupancyVertexIds) {
    assertInvariant(state.board.topology.vertices[vertexId] !== undefined, `vertex occupancy contains unknown ID ${vertexId}.`)
  }

  const topologyEdgeIds = Object.keys(state.board.topology.edges) as EdgeId[]
  const occupancyEdgeIds = Object.keys(state.board.edgeOccupancy) as EdgeId[]
  assertInvariant(occupancyEdgeIds.length === topologyEdgeIds.length, 'edge occupancy key count must match topology.')
  for (const edgeId of topologyEdgeIds) {
    assertInvariant(Object.hasOwn(state.board.edgeOccupancy, edgeId), `edge occupancy is missing ${edgeId}.`)
    const road = state.board.edgeOccupancy[edgeId]
    if (road !== null && road !== undefined) assertKnownPlayer(state, road.ownerId, `edge ${edgeId}`)
  }
  for (const edgeId of occupancyEdgeIds) {
    assertInvariant(state.board.topology.edges[edgeId] !== undefined, `edge occupancy contains unknown ID ${edgeId}.`)
  }
}

function assertPendingDecision(state: GameState, pending: PendingDecision): void {
  const assertRobberCause = (cause: RobberCause): void => {
    const value = cause as { readonly type?: unknown; readonly cardId?: unknown }
    assertInvariant(value.type === 'DICE_SEVEN' || value.type === 'KNIGHT', 'robber cause is invalid.')
    if (value.type === 'KNIGHT') {
      assertInvariant(
        typeof value.cardId === 'string' && value.cardId.trim().length > 0,
        'KNIGHT robber cause requires a non-empty card ID.',
      )
    }
  }

  switch (pending.type) {
    case 'DISCARD_RESOURCES': {
      assertKnownPlayer(state, pending.triggeringPlayerId, 'discard trigger')
      for (const [playerKey, count] of Object.entries(pending.requiredCountByPlayer)) {
        const playerId = playerKey as PlayerId
        assertKnownPlayer(state, playerId, 'discard requirement')
        assertInvariant(Number.isSafeInteger(count) && count > 0, `discard requirement for ${playerId} must be a positive safe integer.`)
      }
      assertInvariant(new Set(pending.completedPlayerIds).size === pending.completedPlayerIds.length, 'completed discard players must be unique.')
      for (const playerId of pending.completedPlayerIds) {
        assertKnownPlayer(state, playerId, 'completed discard')
        assertInvariant(Object.hasOwn(pending.requiredCountByPlayer, playerId), `completed discard player ${playerId} has no requirement.`)
      }
      return
    }
    case 'MOVE_ROBBER':
      assertKnownPlayer(state, pending.actingPlayerId, 'move-robber decision')
      assertRobberCause(pending.cause)
      return
    case 'CHOOSE_ROBBER_TARGET':
      assertKnownPlayer(state, pending.actingPlayerId, 'robber-target decision')
      assertRobberCause(pending.cause)
      for (const playerId of pending.eligibleTargetPlayerIds) assertKnownPlayer(state, playerId, 'robber target')
      return
    case 'PLACE_FREE_ROADS':
    case 'CHOOSE_INVENTION_RESOURCES':
    case 'CHOOSE_MONOPOLY_RESOURCE':
      assertKnownPlayer(state, pending.actingPlayerId, `${pending.type} decision`)
      return
    case 'RESPOND_TO_TRADE':
      assertKnownPlayer(state, pending.responderId, 'trade responder')
      assertKnownPlayer(state, pending.offer.initiatorId, 'trade initiator')
      assertKnownPlayer(state, pending.offer.counterpartyId, 'trade counterparty')
      assertKnownPlayer(state, pending.offer.proposedById, 'trade proposer')
      return
    default:
      throw new Error(
        `Invalid normal-turn state: unknown pending-decision type ${String((pending as { readonly type?: unknown }).type)}.`,
      )
  }
}

function assertRandomState(state: GameState): void {
  assertInvariant(state.random.algorithm === RANDOM_ALGORITHM_ID, 'random algorithm mismatch.')
  assertInvariant(typeof state.random.seed === 'string' && state.random.seed.length > 0, 'random seed must be non-empty.')
  assertInvariant(
    Number.isInteger(state.random.state) && state.random.state >= 1 && state.random.state <= 0xffff_ffff,
    'random cursor must be an unsigned non-zero 32-bit integer.',
  )
  assertInvariant(
    Number.isSafeInteger(state.random.drawCount) && state.random.drawCount >= 0,
    'random drawCount must be a non-negative safe integer.',
  )
}

export function assertNormalTurnState(state: GameState): void {
  assertInvariant(state.schemaVersion === GAME_STATE_SCHEMA_VERSION, 'schema version mismatch.')
  assertInvariant(state.rulesetId === RULESET_ID, 'ruleset mismatch.')
  assertInvariant(
    Number.isSafeInteger(state.stateVersion) && state.stateVersion >= 0,
    'stateVersion must be a non-negative safe integer.',
  )
  assertInvariant(GAME_PHASES.has(state.turn.phase), `unknown game phase ${state.turn.phase}.`)

  if (state.turn.phase === 'SETUP_SETTLEMENT' || state.turn.phase === 'SETUP_ROAD') {
    assertInitialSetupState(state)
    return
  }

  const playerIds = Object.keys(state.players) as PlayerId[]
  assertInvariant(playerIds.length === 4, 'players must contain exactly four records.')
  assertInvariant(
    state.playerOrder.length === 4 && new Set(state.playerOrder).size === 4,
    'playerOrder must contain exactly four unique IDs.',
  )
  for (const playerId of state.playerOrder) assertKnownPlayer(state, playerId, 'playerOrder')
  assertKnownPlayer(state, state.turn.currentPlayerId, 'current player')
  assertInvariant(state.playerOrder.includes(state.turn.currentPlayerId), 'current player must be in playerOrder.')
  assertInvariant(state.turn.setup === null, `${state.turn.phase} must not contain setup state.`)
  assertInvariant(
    Number.isSafeInteger(state.turn.turnNumber) && state.turn.turnNumber > 0,
    'turnNumber must be a positive safe integer.',
  )

  assertResources(state)
  assertBoard(state)
  assertRandomState(state)

  if (state.turn.lastRoll !== null) assertDiceRoll(state.turn.lastRoll, 'lastRoll')
  if (state.turn.phase === 'ROLL_REQUIRED') {
    assertInvariant(state.turn.lastRoll === null, 'ROLL_REQUIRED must have null lastRoll.')
  } else if (state.turn.phase === 'ACTION') {
    assertInvariant(state.turn.lastRoll !== null, 'ACTION requires lastRoll.')
    assertInvariant(
      state.pendingDecision === null
        || state.pendingDecision.type === 'CHOOSE_INVENTION_RESOURCES'
        || state.pendingDecision.type === 'CHOOSE_MONOPOLY_RESOURCE'
        || state.pendingDecision.type === 'RESPOND_TO_TRADE',
      'ACTION must not have a pending decision except an Invention, Monopoly, or trade response.',
    )
  }

  if (state.pendingDecision !== null) assertPendingDecision(state, state.pendingDecision)
  if (state.turn.phase === 'DISCARD_REQUIRED') {
    assertInvariant(
      state.pendingDecision?.type === 'DISCARD_RESOURCES',
      'DISCARD_REQUIRED requires a DISCARD_RESOURCES pending decision.',
    )
    assertInvariant(
      Object.keys(state.pendingDecision.requiredCountByPlayer).length > 0,
      'DISCARD_REQUIRED must contain at least one positive requirement.',
    )
    assertInvariant(state.turn.lastRoll?.total === 7, 'DISCARD_REQUIRED requires a total-seven lastRoll.')
  }
  if (state.turn.phase === 'ROBBER_MOVE_REQUIRED') {
    assertInvariant(
      state.pendingDecision?.type === 'MOVE_ROBBER',
      'ROBBER_MOVE_REQUIRED requires a MOVE_ROBBER pending decision.',
    )
    assertInvariant(
      state.pendingDecision.actingPlayerId === state.turn.currentPlayerId,
      'ROBBER_MOVE_REQUIRED acting player must be the current player.',
    )
    if (state.pendingDecision.cause.type === 'DICE_SEVEN') {
      assertInvariant(state.turn.lastRoll?.total === 7, 'dice-seven robber movement requires a total-seven lastRoll.')
    }
  }
  if (state.turn.phase === 'ROBBER_TARGET_REQUIRED') {
    assertInvariant(
      state.pendingDecision?.type === 'CHOOSE_ROBBER_TARGET',
      'ROBBER_TARGET_REQUIRED requires a CHOOSE_ROBBER_TARGET pending decision.',
    )
    assertInvariant(
      state.pendingDecision.actingPlayerId === state.turn.currentPlayerId,
      'ROBBER_TARGET_REQUIRED acting player must be the current player.',
    )
    assertInvariant(
      state.pendingDecision.selectedTileId === state.board.robberTileId,
      'robber target selected tile must equal the current robber tile.',
    )
    assertInvariant(
      state.pendingDecision.eligibleTargetPlayerIds.length > 0,
      'robber target decision must contain at least one target.',
    )
    const expectedTargets = deriveEligibleRobberTargetPlayerIds(
      state,
      state.pendingDecision.selectedTileId,
      state.pendingDecision.actingPlayerId,
    )
    assertInvariant(
      expectedTargets.length === state.pendingDecision.eligibleTargetPlayerIds.length
        && expectedTargets.every(
          (playerId, index) => state.pendingDecision?.type === 'CHOOSE_ROBBER_TARGET'
            && state.pendingDecision.eligibleTargetPlayerIds[index] === playerId,
        ),
      'robber target list must equal authoritative player-order derivation.',
    )
    if (state.pendingDecision.cause.type === 'DICE_SEVEN') {
      assertInvariant(state.turn.lastRoll?.total === 7, 'dice-seven robber targeting requires a total-seven lastRoll.')
    }
  }

  if (state.turn.phase === 'GAME_OVER') {
    assertInvariant(state.winnerId !== null, 'GAME_OVER requires a winner.')
    assertKnownPlayer(state, state.winnerId, 'winner')
  } else {
    assertInvariant(state.winnerId === null, 'winner must be null outside GAME_OVER.')
  }
}
