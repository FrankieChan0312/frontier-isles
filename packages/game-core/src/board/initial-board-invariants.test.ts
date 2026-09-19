import type { BoardState, TileContent } from '../model/board-state.ts'
import type { EdgeId, PlayerId, PortId, TileId, VertexId } from '../model/ids.ts'
import { createInitialRandomState } from '../random/seeded-random.ts'
import { assertStandardInitialBoard } from './initial-board-invariants.ts'
import { createStandardInitialBoard } from './standard-board-content.ts'

function createValidBoard(seed = 'INVARIANT-BOARD'): BoardState {
  return createStandardInitialBoard(createInitialRandomState(seed)).value
}

function firstTileId(board: BoardState, predicate: (content: TileContent) => boolean): TileId {
  const entry = (Object.entries(board.tileContents) as [TileId, TileContent][]).find(([, content]) =>
    predicate(content),
  )
  if (entry === undefined) {
    throw new Error('Invariant test could not resolve a matching tile.')
  }
  return entry[0]
}

describe('initial standard board invariants', () => {
  it('accepts repeated validation without mutating the board', () => {
    const board = createValidBoard()
    const snapshot = structuredClone(board)

    expect(() => assertStandardInitialBoard(board)).not.toThrow()
    expect(() => assertStandardInitialBoard(board)).not.toThrow()
    expect(board).toEqual(snapshot)
  })

  it('rejects an incorrect generator version', () => {
    const board = createValidBoard()
    const corrupted = { ...board, generatorVersion: 'OTHER' } as unknown as BoardState
    expect(() => assertStandardInitialBoard(corrupted)).toThrow(/generator version/)
  })

  it('rejects missing tile content', () => {
    const board = createValidBoard()
    const tileContents = { ...board.tileContents }
    delete tileContents[Object.keys(tileContents)[0] as TileId]
    expect(() => assertStandardInitialBoard({ ...board, tileContents })).toThrow(/tile contents/)
  })

  it('rejects an incorrect terrain multiset', () => {
    const board = createValidBoard()
    const tileId = firstTileId(board, (content) => content.terrain === 'FOREST')
    const tileContents = {
      ...board.tileContents,
      [tileId]: { ...board.tileContents[tileId], terrain: 'HILLS' },
    }
    expect(() => assertStandardInitialBoard({ ...board, tileContents })).toThrow(/terrain FOREST/)
  })

  it('rejects a numbered desert', () => {
    const board = createValidBoard()
    const tileContents = {
      ...board.tileContents,
      [board.robberTileId]: { terrain: 'DESERT', numberToken: 2 },
    } as BoardState['tileContents']
    expect(() => assertStandardInitialBoard({ ...board, tileContents })).toThrow(/desert.*must not have a number/)
  })

  it('rejects an unnumbered non-desert', () => {
    const board = createValidBoard()
    const tileId = firstTileId(board, (content) => content.terrain !== 'DESERT')
    const content = board.tileContents[tileId]
    if (content === undefined) {
      throw new Error('Invariant test lost a non-desert tile.')
    }
    const tileContents = {
      ...board.tileContents,
      [tileId]: { terrain: content.terrain, numberToken: null },
    }
    expect(() => assertStandardInitialBoard({ ...board, tileContents })).toThrow(/non-desert.*must have a number/)
  })

  it('rejects an incorrect number-token multiset', () => {
    const board = createValidBoard()
    const tileId = firstTileId(board, (content) => content.numberToken === 2)
    const content = board.tileContents[tileId]
    if (content === undefined) {
      throw new Error('Invariant test lost the number-two tile.')
    }
    const tileContents = {
      ...board.tileContents,
      [tileId]: { terrain: content.terrain, numberToken: 3 as const },
    }
    expect(() => assertStandardInitialBoard({ ...board, tileContents })).toThrow(/number token 2/)
  })

  it('rejects adjacent red-number tiles while preserving the token multiset', () => {
    const board = createValidBoard('ADJACENT-RED-CORRUPTION')
    const redTileIds = (Object.entries(board.tileContents) as [TileId, TileContent][])
      .filter(([, content]) => content.numberToken === 6 || content.numberToken === 8)
      .map(([tileId]) => tileId)
    const edge = Object.values(board.topology.edges).find(
      (candidate) =>
        candidate.tileIds.length === 2 &&
        candidate.tileIds.every((tileId) => {
          const content = board.tileContents[tileId]
          return (
            content !== undefined &&
            content.terrain !== 'DESERT' &&
            content.numberToken !== 6 &&
            content.numberToken !== 8
          )
        }),
    )
    const [leftId, rightId] = edge?.tileIds ?? []
    const [firstRedId, secondRedId] = redTileIds
    const left = leftId === undefined ? undefined : board.tileContents[leftId]
    const right = rightId === undefined ? undefined : board.tileContents[rightId]
    const firstRed = firstRedId === undefined ? undefined : board.tileContents[firstRedId]
    const secondRed = secondRedId === undefined ? undefined : board.tileContents[secondRedId]
    if (
      leftId === undefined || rightId === undefined ||
      firstRedId === undefined || secondRedId === undefined ||
      left === undefined || right === undefined || firstRed === undefined || secondRed === undefined ||
      left.numberToken === null || right.numberToken === null ||
      firstRed.numberToken === null || secondRed.numberToken === null
    ) {
      throw new Error('Invariant test could not build an adjacent-red corruption.')
    }

    const tileContents = {
      ...board.tileContents,
      [leftId]: { terrain: left.terrain, numberToken: firstRed.numberToken },
      [rightId]: { terrain: right.terrain, numberToken: secondRed.numberToken },
      [firstRedId]: { terrain: firstRed.terrain, numberToken: left.numberToken },
      [secondRedId]: { terrain: secondRed.terrain, numberToken: right.numberToken },
    }
    expect(() => assertStandardInitialBoard({ ...board, tileContents })).toThrow(/joins adjacent red-number tiles/)
  })

  it('rejects the wrong port-kind multiset', () => {
    const board = createValidBoard()
    const genericEntry = (Object.entries(board.topology.ports) as [PortId, BoardState['topology']['ports'][PortId]][])
      .find(([, port]) => port.kind.type === 'GENERIC')
    if (genericEntry === undefined) {
      throw new Error('Invariant test could not resolve a generic port.')
    }
    const [portId, port] = genericEntry
    const ports = {
      ...board.topology.ports,
      [portId]: { ...port, kind: { type: 'RESOURCE' as const, resource: 'LUMBER' as const } },
    }
    const corrupted = { ...board, topology: { ...board.topology, ports } }
    expect(() => assertStandardInitialBoard(corrupted)).toThrow(/generic ports/)
  })

  it('rejects missing or non-null initial occupancy', () => {
    const board = createValidBoard()
    const vertexOccupancy = { ...board.vertexOccupancy }
    delete vertexOccupancy[Object.keys(vertexOccupancy)[0] as VertexId]
    expect(() => assertStandardInitialBoard({ ...board, vertexOccupancy })).toThrow(/vertex occupancy/)

    const edgeId = Object.keys(board.edgeOccupancy)[0] as EdgeId
    const edgeOccupancy = {
      ...board.edgeOccupancy,
      [edgeId]: { ownerId: 'player:test' as PlayerId },
    }
    expect(() => assertStandardInitialBoard({ ...board, edgeOccupancy })).toThrow(/must be null/)
  })

  it('rejects a robber that is not on the desert', () => {
    const board = createValidBoard()
    const nonDesertId = firstTileId(board, (content) => content.terrain !== 'DESERT')
    expect(() =>
      assertStandardInitialBoard({ ...board, robberTileId: nonDesertId }),
    ).toThrow(/robber must start on desert/)
  })
})
