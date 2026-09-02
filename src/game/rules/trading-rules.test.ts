import type { GameState } from '../model/game-state.ts'
import type { PlayerId, VertexId } from '../model/ids.ts'
import { createInitialRandomState } from '../random/seeded-random.ts'
import { createStandardInitialBoard } from '../board/standard-board-content.ts'
import { GOLDEN_PLAYER_IDS } from '../engine/task-05-golden-fixture.test-helper.ts'
import {
  createGoldenDomesticTradeStart,
  createGoldenMaritimeTradeStart,
} from '../engine/task-11-trading.test-helper.ts'
import {
  DEFAULT_MARITIME_TRADE_RATIO,
  GENERIC_PORT_TRADE_RATIO,
  RESOURCE_PORT_TRADE_RATIO,
} from '../model/standard-maritime-trade.ts'
import { deriveBestMaritimeTradeRatio } from './maritime-trade-rules.ts'
import { deriveControlledPortIds } from './player-ports.ts'
import { countResourceCards, isCompleteResourceBag } from './resource-bag-validation.ts'

describe('Task 11 resource and port rules', () => {
  it('validates and counts complete five-resource bags', () => {
    expect(isCompleteResourceBag({ LUMBER: 1, BRICK: 2, WOOL: 0, GRAIN: 0, ORE: 0 })).toBe(true)
    expect(countResourceCards({ LUMBER: 1, BRICK: 2, WOOL: 0, GRAIN: 0, ORE: 0 })).toBe(3)
    expect(isCompleteResourceBag({ LUMBER: 1 })).toBe(false)
    expect(isCompleteResourceBag({ LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: -1 })).toBe(false)
    expect(isCompleteResourceBag({ LUMBER: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0.5 })).toBe(false)
  })

  it('derives Merchant generic-port control deterministically from either endpoint', () => {
    const state = createGoldenMaritimeTradeStart()
    const expectedPortId = 'port:edge:vertex:-1,-7,8|vertex:-2,-5,7'
    const controlledPortIds = deriveControlledPortIds(state.board, GOLDEN_PLAYER_IDS.merchant)
    expect(controlledPortIds).toContain(expectedPortId)
    expect(controlledPortIds).toEqual([...controlledPortIds].sort())
    expect(state.board.topology.ports[expectedPortId as keyof typeof state.board.topology.ports]?.kind).toEqual({ type: 'GENERIC' })
    expect(deriveBestMaritimeTradeRatio(state.board, GOLDEN_PLAYER_IDS.merchant, 'BRICK')).toBe(3)

    const port = state.board.topology.ports[expectedPortId as keyof typeof state.board.topology.ports]
    const endpoint = port?.vertexIds[1]
    if (endpoint === undefined) throw new Error('Missing generic port endpoint.')
    const moved: GameState = {
      ...state,
      board: {
        ...state.board,
        vertexOccupancy: {
          ...state.board.vertexOccupancy,
          ['vertex:-1,-7,8' as VertexId]: null,
          [endpoint]: { type: 'CITY', ownerId: GOLDEN_PLAYER_IDS.merchant },
        },
      },
    }
    expect(deriveControlledPortIds(moved.board, GOLDEN_PLAYER_IDS.merchant)).toContain(expectedPortId)
    expect(deriveControlledPortIds(moved.board, GOLDEN_PLAYER_IDS.human)).not.toContain(expectedPortId)
  })

  it('derives exact 4:1, 3:1, matching 2:1, and non-matching ratios', () => {
    const noPort = createGoldenDomesticTradeStart()
    expect(deriveBestMaritimeTradeRatio(noPort.board, GOLDEN_PLAYER_IDS.sentinel, 'ORE')).toBe(
      DEFAULT_MARITIME_TRADE_RATIO,
    )
    const generic = createGoldenMaritimeTradeStart()
    expect(deriveBestMaritimeTradeRatio(generic.board, GOLDEN_PLAYER_IDS.merchant, 'ORE')).toBe(
      GENERIC_PORT_TRADE_RATIO,
    )

    const generated = createStandardInitialBoard(
      createInitialRandomState('FRONTIER-ISLES-TASK-04'),
    ).value
    const orePort = Object.values(generated.topology.ports).find(
      (port) => port.kind.type === 'RESOURCE' && port.kind.resource === 'ORE',
    )
    if (orePort === undefined) throw new Error('Missing frozen ORE port.')
    const board = {
      ...generated,
      vertexOccupancy: {
        ...generated.vertexOccupancy,
        [orePort.vertexIds[0]]: { type: 'SETTLEMENT' as const, ownerId: GOLDEN_PLAYER_IDS.merchant },
      },
    }
    expect(deriveBestMaritimeTradeRatio(board, GOLDEN_PLAYER_IDS.merchant, 'ORE')).toBe(
      RESOURCE_PORT_TRADE_RATIO,
    )
    expect(deriveBestMaritimeTradeRatio(board, GOLDEN_PLAYER_IDS.merchant, 'BRICK')).toBe(4)
  })

  it('does not let the robber or another player disable or grant a port', () => {
    const state = createGoldenMaritimeTradeStart()
    const movedRobber = {
      ...state.board,
      robberTileId: 'tile:0,0' as GameState['board']['robberTileId'],
    }
    expect(deriveBestMaritimeTradeRatio(movedRobber, GOLDEN_PLAYER_IDS.merchant, 'BRICK')).toBe(3)
    expect(deriveBestMaritimeTradeRatio(movedRobber, 'player:outsider' as PlayerId, 'BRICK')).toBe(4)
  })
})
