import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { resolve, join } from 'node:path'
import type { RoomSessionData, RoomSnapshot } from '@frontier-isles/realtime-contracts'
import { InMemoryRoomService } from '../src/lobby/room-service.js'
import type { GameSession, GameSessionDependencies } from '../src/game/game-session.js'
import type { MultiplayerRepository } from '../src/persistence/multiplayer-repository.js'
import { FakeLifecycleRuntime } from './fake-lifecycle-runtime.js'
import { actionFixture, requireValue, successData } from './game-test-helpers.js'

export function temporaryPersistenceDirectory(): { readonly path: string; readonly database: string; readonly remove: () => void } {
  const root = resolve('logs')
  mkdirSync(root, { recursive: true })
  const path = mkdtempSync(join(root, 'multiplayer-persistence-'))
  return { path, database: join(path, 'rooms.sqlite'), remove: () => {
    if (!path.startsWith(root + '/')) {
      // Windows uses a different separator; resolve the parent before recursive removal.
      if (!path.startsWith(root + '\\')) throw new Error('Temporary persistence directory escaped its workspace root.')
    }
    rmSync(path, { recursive: true, force: true })
  } }
}
export interface PersistentRoomFixture {
  readonly service: InMemoryRoomService
  readonly runtime: FakeLifecycleRuntime
  readonly members: readonly RoomSessionData[]
  readonly snapshot: () => RoomSnapshot
  readonly start: () => GameSession
}
export function persistentRoom(
  repository: MultiplayerRepository,
  runtime = new FakeLifecycleRuntime(),
  dependencies: GameSessionDependencies = { createState: actionFixture },
  humans = 4,
): PersistentRoomFixture {
  const service = new InMemoryRoomService({ repository, runtime, gameDependencies: dependencies,
    reconnectGraceMs: 100, restartRecoveryGraceMs: 1200, roomIdleTtlMs: 5000, gameAbandonedTtlMs: 3000 })
  const first = successData(service.createRoom('Host'))
  const members = [first]
  for (let index = 1; index < humans; index += 1) members.push(successData(service.joinRoom(first.credential.roomCode, `Human ${index}`)))
  const snapshot = (): RoomSnapshot => requireValue(service.getSnapshot(first.credential.roomCode))
  for (const seat of snapshot().seats) if (seat.occupancy === 'EMPTY') {
    successData(service.setAiSeat(first.credential.sessionId, snapshot().revision, seat.seatId, 'BUILDER'))
  }
  for (const member of members) successData(service.setReady(member.credential.sessionId, snapshot().revision, true))
  return { service, members, runtime, snapshot, start: () => {
    successData(service.requestStart(first.credential.sessionId, snapshot().revision))
    return requireValue(service.getGameSession(first.credential.roomCode))
  } }
}
export function restoredService(repository: MultiplayerRepository, runtime: FakeLifecycleRuntime, dependencies: GameSessionDependencies = {}): InMemoryRoomService {
  return new InMemoryRoomService({ repository, runtime, gameDependencies: dependencies,
    reconnectGraceMs: 100, restartRecoveryGraceMs: 1200, roomIdleTtlMs: 5000, gameAbandonedTtlMs: 3000 })
}
export function resumeEveryHuman(service: InMemoryRoomService, members: readonly RoomSessionData[]): void {
  for (const member of members) successData(service.resumeSession(member.credential))
}
