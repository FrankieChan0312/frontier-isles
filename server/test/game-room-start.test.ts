import { describe, expect, it } from 'vitest'
import { gameIdSchema, REALTIME_PROTOCOL_VERSION, type RoomSessionData } from '@frontier-isles/realtime-contracts'
import { InMemoryRoomService } from '../src/lobby/room-service.js'
import { FakeLifecycleRuntime } from './fake-lifecycle-runtime.js'
import { requireValue, successData } from './game-test-helpers.js'

async function waiting(humans = 2) {
  const runtime = new FakeLifecycleRuntime()
  let gamesCreated = 0
  const service = (await InMemoryRoomService.open({ runtime, nextGameIdentity: () => {
    gamesCreated += 1
    return { gameId: gameIdSchema.parse(`game:test:${gamesCreated}`), seed: 'ROOM-START-TEST' }
  } }))
  const host = successData((await service.createRoom('Host')))
  const members: RoomSessionData[] = [host]
  for (let index = 1; index < humans; index += 1) members.push(successData((await service.joinRoom(host.credential.roomCode, `Human ${index}`))))
  function snapshot() { return requireValue(service.getSnapshot(host.credential.roomCode)) }
  for (const seat of snapshot().seats) {
    if (seat.occupancy === 'EMPTY') successData((await service.setAiSeat(host.credential.sessionId, snapshot().revision, seat.seatId, 'MERCHANT')))
  }
  for (const member of members) successData((await service.setReady(member.credential.sessionId, snapshot().revision, true)))
  return { service, runtime, host, members, snapshot, gamesCreated: () => gamesCreated,
    start: async () => (await service.requestStart(host.credential.sessionId, snapshot().revision)) }
}

describe('authoritative Room start and active membership', () => {
  it.each([2, 3, 4])('starts exactly one %i-Human game, preserves seat mapping and locks waiting mutations', async (humans) => {
    const room = (await waiting(humans))
    const started = successData((await room.start()))
    expect(started.snapshot.lifecycleStatus).toBe('ACTIVE')
    expect(started.snapshot.gameId).toBe('game:test:1')
    expect(room.gamesCreated()).toBe(1)
    expect((await room.start())).toMatchObject({ ok: false, error: { code: 'ROOM_NOT_WAITING' } })
    expect(room.gamesCreated()).toBe(1)
    const game = requireValue(room.service.getGameSession(started.snapshot.roomCode))
    for (const member of room.members) expect(game.playerForSession(member.credential.sessionId))
      .toBe(game.playerForSeat(member.credential.seatId))
    const hostId = room.host.credential.sessionId
    for (const result of [(await room.service.setReady(hostId, room.snapshot().revision, false)),
      await room.service.setAiSeat(hostId, room.snapshot().revision, 'WEST', null),
      await room.service.leaveRoom(hostId), (await room.service.joinRoom(room.host.credential.roomCode, 'Late joiner'))]) {
      expect(result).toMatchObject({ ok: false, error: { code: 'ROOM_NOT_WAITING' } })
    }
    await room.runtime.advanceBy(1_800_001)
    expect(room.service.roomCount).toBe(1)
  })

  it('rejects non-Host, insufficient Humans, missing Ready, disconnected Humans and empty seats', async () => {
    const room = (await waiting())
    const joiner = requireValue(room.members[1])
    expect((await room.service.requestStart(joiner.credential.sessionId, room.snapshot().revision)))
      .toMatchObject({ ok: false, error: { code: 'NOT_HOST' } })
    const solo = (await waiting(1))
    expect((await solo.start())).toMatchObject({ ok: false, error: { code: 'START_CONDITIONS_NOT_MET' } })
    successData((await room.service.setReady(joiner.credential.sessionId, room.snapshot().revision, false)))
    expect((await room.start())).toMatchObject({ ok: false, error: { code: 'START_CONDITIONS_NOT_MET' } })
    successData((await room.service.setReady(joiner.credential.sessionId, room.snapshot().revision, true)))
    successData((await room.service.markDisconnected(joiner.credential.sessionId)))
    expect((await room.start())).toMatchObject({ ok: false, error: { code: 'START_CONDITIONS_NOT_MET' } })
    successData((await room.service.resumeSession(joiner.credential)))
    successData((await room.service.setAiSeat(room.host.credential.sessionId, room.snapshot().revision, 'WEST', null)))
    expect((await room.start())).toMatchObject({ ok: false, error: { code: 'START_CONDITIONS_NOT_MET' } })
    expect(room.gamesCreated()).toBe(0)
  })

  it('resumes the same active seat within grace and never applies waiting-seat removal after grace', async () => {
    const room = (await waiting())
    const started = successData((await room.start()))
    const game = requireValue(room.service.getGameSession(room.host.credential.roomCode))
    const identity = { protocolVersion: REALTIME_PROTOCOL_VERSION, roomCode: started.snapshot.roomCode, gameId: game.gameId }
    const before = successData(room.service.requestGameSnapshot(room.host.credential.sessionId, identity))
    successData((await room.service.markDisconnected(room.host.credential.sessionId)))
    expect(room.service.requestGameSnapshot(room.host.credential.sessionId, identity)).toMatchObject({ ok: false })
    await room.runtime.advanceBy(29_999)
    const resumed = successData((await room.service.resumeSession(room.host.credential)))
    expect(resumed.credential).toEqual(room.host.credential)
    expect(successData(room.service.requestGameSnapshot(room.host.credential.sessionId, identity)).view).toEqual(before.view)
    expect(room.service.requestGameSnapshot(room.host.credential.sessionId, { ...identity, gameId: gameIdSchema.parse('game:wrong') }))
      .toMatchObject({ ok: false, error: { code: 'GAME_NOT_FOUND' } })
    successData((await room.service.markDisconnected(room.host.credential.sessionId)))
    await room.runtime.advanceBy(30_000)
    expect((await room.service.resumeSession(room.host.credential))).toMatchObject({ ok: false, error: { code: 'SESSION_INVALID' } })
    expect(room.snapshot().seats[0]).toMatchObject({ occupancy: 'HUMAN', connectionStatus: 'DISCONNECTED' })
    expect(room.snapshot().lifecycleStatus).toBe('ACTIVE')
    expect(room.service.getGameSession(identity.roomCode)).toBe(game)
  })
})
