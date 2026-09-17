import { afterEach, expect, it } from 'vitest'
import { SqliteMultiplayerRepository } from '../src/persistence/sqlite-multiplayer-repository.js'
import { defineRecoveryContract } from './recovery-contract.js'
import { persistentRoom, restoredService, resumeEveryHuman, temporaryPersistenceDirectory } from './persistence-test-helpers.js'
import { FakeLifecycleRuntime } from './fake-lifecycle-runtime.js'
import { requireValue, requestFor, successData } from './game-test-helpers.js'

defineRecoveryContract(() => {
  const directory = temporaryPersistenceDirectory()
  return { open: () => new SqliteMultiplayerRepository(directory.database), remove: directory.remove }
})
const cleanup: (() => void)[] = []
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close() })
  it('does not acknowledge or publish an uncommitted game mutation and can retry it once after recovery', async () => {
    const directory = temporaryPersistenceDirectory()
    cleanup.push(directory.remove)
    let fail = false
    const repository = new SqliteMultiplayerRepository(directory.database, { beforeCommit: () => { if (fail) throw new Error('injected failure') } })
    cleanup.push(() => repository.close())
    const room = persistentRoom(repository)
    cleanup.push(() => room.service.dispose())
    const game = room.start()
    const north = requireValue(room.members[0]).credential.sessionId
    const request = requestFor(game, north, { type: 'BUY_DEVELOPMENT_CARD' })
    const before = repository.load()
    let publications = 0
    room.service.subscribeToGames(() => { publications += 1 })
    fail = true
    expect(await room.service.submitGameCommand(north, request)).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    expect(publications).toBe(0)
    expect(repository.load()).toEqual(before)
    fail = false
    const next = restoredService(repository, new FakeLifecycleRuntime())
    cleanup.push(() => next.dispose())
    resumeEveryHuman(next, room.members)
    const accepted = await next.submitGameCommand(north, request)
    expect(successData(accepted).accepted).toBe(true)
    expect(await next.submitGameCommand(north, request)).toEqual(accepted)
    expect(requireValue(next.getGameSession(game.roomCode)).exportPersistence().state.stateVersion).toBe(game.exportPersistence().state.stateVersion)
  })
