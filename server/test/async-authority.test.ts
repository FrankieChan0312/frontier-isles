import { afterEach, expect, it } from 'vitest'
import { InMemoryMultiplayerRepository, PersistenceError } from '../src/persistence/multiplayer-repository.js'
import type { MultiplayerRecord } from '../src/persistence/multiplayer-record.js'
import { REALTIME_PROTOCOL_VERSION } from '@frontier-isles/realtime-contracts'
import type { GameId } from '@frontier-isles/game-core/model/ids'
import { persistentRoom } from './persistence-test-helpers.js'
import { actionFixture, requireValue, requestFor, successData } from './game-test-helpers.js'

class HeldRepository extends InMemoryMultiplayerRepository {
  public readonly committed: MultiplayerRecord[] = []
  #hold: { readonly entered: () => void; readonly wait: Promise<void>; readonly fail: boolean } | null = null
  public hold(fail = false): { readonly entered: Promise<void>; readonly release: () => void } {
    let release: () => void = () => {}
    let signal: () => void = () => {}
    const entered = new Promise<void>((done) => { signal = done })
    const wait = new Promise<void>((done) => { release = done })
    this.#hold = { entered: signal, wait, fail }
    return { entered, release }
  }
  public override async save(record: MultiplayerRecord): Promise<void> {
    const hold = this.#hold
    this.#hold = null
    if (hold !== null) {
      hold.entered()
      await hold.wait
      if (hold.fail) throw new PersistenceError('PERSISTENCE_WRITE_FAILED')
    }
    await super.save(record)
    this.committed.push(structuredClone(record))
  }
}
const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

it('keeps lobby candidates private and revalidates queued Room revisions after durable commit', async () => {
  const repository = new HeldRepository()
  const room = await persistentRoom(repository, undefined, {}, 2)
  cleanup.push(() => room.service.dispose())
  const host = requireValue(room.members[0]).credential.sessionId
  const before = room.snapshot()
  const gate = repository.hold()
  cleanup.push(gate.release)
  let completed = false
  const first = room.service.setReady(host, before.revision, false).then((result) => { completed = true; return result })
  await gate.entered
  const second = room.service.setAiSeat(host, before.revision, 'SOUTH', 'MERCHANT')
  expect(room.snapshot()).toEqual(before)
  expect(completed).toBe(false)
  expect(requireValue((await repository.load())[0]).revision).toBe(before.revision)
  gate.release()
  expect(await first).toMatchObject({ ok: true, data: { changed: true } })
  expect(await second).toMatchObject({ ok: false, error: { code: 'REVISION_CONFLICT' } })
  expect(room.snapshot().revision).toBe(before.revision + 1)
})

it('does not expose a newly constructed game until its initial aggregate commits', async () => {
  const repository = new HeldRepository()
  let candidateId: GameId | null = null
  const room = await persistentRoom(repository, undefined, { createState: (config, seed) => {
    candidateId = config.gameId
    return actionFixture(config, seed)
  } })
  cleanup.push(() => room.service.dispose())
  const host = requireValue(room.members[0]).credential
  const gate = repository.hold()
  cleanup.push(gate.release)
  const starting = room.start()
  await gate.entered
  expect(room.service.getGameSession(host.roomCode)).toBeNull()
  expect(room.snapshot().lifecycleStatus).toBe('WAITING')
  expect(room.service.requestGameSnapshot(host.sessionId, { protocolVersion: REALTIME_PROTOCOL_VERSION,
    roomCode: host.roomCode, gameId: requireValue<GameId>(candidateId) })).toMatchObject({ ok: false, error: { code: 'GAME_NOT_FOUND' } })
  gate.release()
  const game = await starting
  expect(game.gameId).toBe(candidateId)
  expect(room.snapshot().lifecycleStatus).toBe('ACTIVE')
})

it('latches disconnect immediately but serializes durable presence behind an in-flight game commit', async () => {
  const repository = new HeldRepository()
  const room = await persistentRoom(repository)
  cleanup.push(() => room.service.dispose())
  const game = await room.start()
  const host = requireValue(room.members[0]).credential.sessionId
  const other = requireValue(room.members[1]).credential.sessionId
  const before = game.snapshot(host)
  const gate = repository.hold()
  cleanup.push(gate.release)
  const request = requestFor(game, host, { type: 'BUY_DEVELOPMENT_CARD' })
  const first = room.service.submitGameCommand(host, request)
  await gate.entered
  const queued = room.service.submitGameCommand(host, { ...request, commandId: `${request.commandId}:queued` as typeof request.commandId })
  const disconnect = room.service.markDisconnected(other)
  await room.runtime.advanceBy(50)
  expect(game.snapshot(host)).toEqual(before)
  gate.release()
  expect(await first).toMatchObject({ ok: true, data: { accepted: true } })
  expect(await queued).toMatchObject({ ok: false, error: { code: 'GAME_PAUSED' } })
  expect(await disconnect).toMatchObject({ ok: true })
  const saved = requireValue((await repository.load())[0]).game
  expect(saved?.state.stateVersion).toBe(before.view.stateVersion + 1)
  expect(saved?.presence.lifecycleStatus).toBe('PAUSED_RECONNECTING')
  expect(saved?.presence.disconnectedSeats[0]?.reconnectDeadlineMs).toBe(100)
  expect(saved?.commandCache.flatMap((cache) => cache.entries)).toHaveLength(1)
  const transition = requireValue(repository.committed.at(-2)).game
  expect(transition?.state).toEqual(saved?.state)
  expect(transition?.presence.lifecycleStatus).toBe('ACTIVE')
})

it('publishes neither a candidate view nor a success result when an awaited write rejects', async () => {
  const repository = new HeldRepository()
  const room = await persistentRoom(repository)
  cleanup.push(() => room.service.dispose())
  const game = await room.start()
  const host = requireValue(room.members[0]).credential.sessionId
  const before = game.snapshot(host)
  const durable = await repository.load()
  let publications = 0
  room.service.subscribeToGames(() => { publications += 1 })
  const gate = repository.hold(true)
  cleanup.push(gate.release)
  const pending = room.service.submitGameCommand(host, requestFor(game, host, { type: 'BUY_DEVELOPMENT_CARD' }))
  await gate.entered
  expect(game.snapshot(host)).toEqual(before)
  expect(publications).toBe(0)
  gate.release()
  expect(await pending).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
  expect(publications).toBe(0)
  expect(await repository.load()).toEqual(durable)
  expect(room.service.isReady).toBe(false)
})

it('drains an admitted durable transaction during shutdown and refuses later queued work', async () => {
  const repository = new HeldRepository()
  const room = await persistentRoom(repository)
  cleanup.push(() => room.service.dispose())
  const game = await room.start()
  const host = requireValue(room.members[0]).credential.sessionId
  const gate = repository.hold()
  cleanup.push(gate.release)
  const pending = room.service.submitGameCommand(host, requestFor(game, host, { type: 'BUY_DEVELOPMENT_CARD' }))
  await gate.entered
  let stopped = false
  const stopping = room.service.shutdown().then(() => { stopped = true })
  await Promise.resolve()
  expect(room.service.isReady).toBe(false)
  expect(stopped).toBe(false)
  expect(await room.service.submitGameCommand(host, requestFor(game, host, { type: 'END_TURN' })))
    .toMatchObject({ ok: false, error: { code: 'GAME_UNAVAILABLE' } })
  gate.release()
  expect(successData(await pending).accepted).toBe(true)
  await stopping
  expect(stopped).toBe(true)
  const saved = requireValue((await repository.load())[0]).game
  expect(saved?.state.stateVersion).toBe(game.snapshot(host).view.stateVersion)
  expect(saved?.commandCache.flatMap((cache) => cache.entries)).toHaveLength(1)
})

it('retains bounded FIFO admission for disconnect when client work fills the Room queue', async () => {
  const repository = new HeldRepository()
  const room = await persistentRoom(repository, undefined, { maxQueuedOperations: 1, createState: actionFixture })
  cleanup.push(() => room.service.dispose())
  const game = await room.start()
  const host = requireValue(room.members[0]).credential.sessionId
  const gate = repository.hold()
  cleanup.push(gate.release)
  const request = requestFor(game, host, { type: 'BUY_DEVELOPMENT_CARD' })
  const first = room.service.submitGameCommand(host, request)
  await gate.entered
  const disconnect = room.service.markDisconnected(host)
  expect(await room.service.submitGameCommand(host, request)).toMatchObject({ ok: false, error: { code: 'GAME_BUSY' } })
  gate.release()
  expect(await first).toMatchObject({ ok: true, data: { accepted: true } })
  expect(await disconnect).toMatchObject({ ok: true })
  expect(room.service.isReady).toBe(true)
  expect(game.lifecycleStatus).toBe('PAUSED_RECONNECTING')
})

it('admits Room closure and GameSession replacement into the same FIFO without a microtask reorder', async () => {
  const repository = new HeldRepository()
  const room = await persistentRoom(repository)
  cleanup.push(() => room.service.dispose())
  const game = await room.start()
  const host = requireValue(room.members[0]).credential.sessionId
  await room.service.markDisconnected(requireValue(room.members[1]).credential.sessionId)
  await room.runtime.advanceBy(100)
  const revision = room.snapshot().revision
  const closing = room.service.closeActiveGame(host, game.gameId, revision)
  const replacement = room.service.replaceExpiredHuman(host, game.gameId, revision, 'EAST', 'BUILDER')
  expect(await closing).toMatchObject({ ok: true })
  expect(await replacement).toMatchObject({ ok: false })
  expect(await repository.load()).toEqual([])
})
