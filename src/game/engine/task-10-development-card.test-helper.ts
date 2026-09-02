import type { GameState } from '../model/game-state.ts'
import type { CommandId, DevelopmentCardId, EdgeId, PlayerId, VertexId } from '../model/ids.ts'
import type { DevelopmentCardStatus, DevelopmentCardType } from '../model/development-card.ts'
import { executePaidBuildingCommand, type PaidBuildingCommand } from './paid-building-engine.ts'
import { GOLDEN_PLAYER_IDS } from './task-05-golden-fixture.test-helper.ts'
import { createGoldenPaidBuildingStart } from './task-08-paid-building.test-helper.ts'

function paidSuccess(state: GameState, command: PaidBuildingCommand): GameState {
  const result = executePaidBuildingCommand(state, {
    commandId: `command:task-10:paid:${state.stateVersion}` as CommandId,
    actorId: GOLDEN_PLAYER_IDS.sentinel,
    expectedStateVersion: state.stateVersion,
    command,
  })
  if (!result.ok) throw new Error(`Task 10 paid fixture failed: ${result.violation.code}.`)
  return result.state
}

export function createTask08FinalState(): GameState {
  let state = createGoldenPaidBuildingStart()
  state = paidSuccess(state, {
    type: 'BUILD_ROAD', edgeId: 'edge:vertex:-1,-1,2|vertex:1,-2,1' as EdgeId,
  })
  state = paidSuccess(state, {
    type: 'BUILD_ROAD', edgeId: 'edge:vertex:1,-2,1|vertex:2,-1,-1' as EdgeId,
  })
  state = paidSuccess(state, {
    type: 'BUILD_SETTLEMENT', vertexId: 'vertex:2,-1,-1' as VertexId,
  })
  return paidSuccess(state, {
    type: 'UPGRADE_CITY', vertexId: 'vertex:2,-1,-1' as VertexId,
  })
}

export function moveStandardCardToPlayer(
  state: GameState,
  playerId: PlayerId,
  type: DevelopmentCardType,
  status: DevelopmentCardStatus = 'IN_HAND',
  acquiredTurnNumber = 0,
  preferredId?: DevelopmentCardId,
): GameState {
  const definition = state.bank.developmentDeck.find(
    (card) => card.type === type && (preferredId === undefined || card.id === preferredId),
  )
  if (definition === undefined) throw new Error(`Missing ${type} fixture card.`)
  const player = state.players[playerId]
  if (player === undefined) throw new Error(`Missing fixture player ${playerId}.`)
  return {
    ...state,
    bank: {
      ...state.bank,
      developmentDeck: state.bank.developmentDeck.filter((card) => card.id !== definition.id),
    },
    players: {
      ...state.players,
      [playerId]: {
        ...player,
        developmentCards: [...player.developmentCards, {
          ...definition,
          acquiredTurnNumber,
          status,
        }],
        playedKnights: player.playedKnights
          + (definition.type === 'KNIGHT' && status === 'PLAYED' ? 1 : 0),
      },
    },
  }
}
