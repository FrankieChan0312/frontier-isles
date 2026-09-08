import type { Socket } from 'socket.io'
import {
  REALTIME_PROTOCOL_VERSION,
  CLIENT_EVENT_NAMES,
  REALTIME_SERVICE_NAME,
  createSafeErrorAcknowledgement,
  roomClosedNoticeSchema,
  roomCreateAcknowledgementSchema,
  roomCreateRequestSchema,
  roomJoinAcknowledgementSchema,
  roomJoinRequestSchema,
  roomLeaveAcknowledgementSchema,
  roomLeaveRequestSchema,
  roomRequestSnapshotAcknowledgementSchema,
  roomRequestSnapshotRequestSchema,
  roomSetAiSeatAcknowledgementSchema,
  roomSetAiSeatRequestSchema,
  roomSetReadyAcknowledgementSchema,
  roomSetReadyRequestSchema,
  roomStartAcknowledgementSchema,
  roomStartRequestSchema,
  serverHelloSchema,
  sessionReplacedNoticeSchema,
  sessionResumeAcknowledgementSchema,
  sessionResumeRequestSchema,
  type ClientToServerEvents,
  type RoomCode,
  type SafeErrorCode,
  type ServerToClientEvents,
  type SessionId,
  gameCommandRequestSchema,
  gameCommandAcknowledgementSchema,
  gameRequestSnapshotRequestSchema,
  gameRequestSnapshotAcknowledgementSchema,
  roomReplaceHumanRequestSchema,
  roomReplaceHumanAcknowledgementSchema,
  roomCloseGameRequestSchema,
  roomCloseGameAcknowledgementSchema,
  type RoomClosedNotice,
} from '@frontier-isles/realtime-contracts'
import type {
  InterServerEvents,
  RealtimeServer,
  SocketData,
} from '../create-realtime-server.js'
import type {
  InMemoryRoomService,
  RoomLeaveResult,
  RoomLifecycleEvent,
} from './room-service.js'
import type { GameSession } from '../game/game-session.js'
import { isBoundedJson } from '../security/network-limits.js'
import type { RequestLimiter } from '../security/request-limiter.js'

type LobbySocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>

interface ValidationFailureDetails {
  readonly issues: readonly { readonly path: readonly PropertyKey[] }[]
}

function hasProtocolMismatch(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null || !('protocolVersion' in payload)) {
    return false
  }
  return payload.protocolVersion !== REALTIME_PROTOCOL_VERSION
}

function validationFailure(
  payload: unknown,
  details: ValidationFailureDetails,
): ReturnType<typeof createSafeErrorAcknowledgement> {
  if (hasProtocolMismatch(payload)) {
    return createSafeErrorAcknowledgement(
      'PROTOCOL_VERSION_MISMATCH',
      'Refresh the page to use the supported realtime protocol.',
    )
  }
  const firstField = details.issues[0]?.path[0]
  const fieldCode: SafeErrorCode = firstField === 'displayName'
    ? 'INVALID_DISPLAY_NAME'
    : firstField === 'roomCode'
      ? 'INVALID_ROOM_CODE'
      : 'INVALID_REQUEST'
  const message = fieldCode === 'INVALID_DISPLAY_NAME'
    ? 'Enter a valid display name.'
    : fieldCode === 'INVALID_ROOM_CODE'
      ? 'Enter a valid six-character room code.'
      : 'The request is invalid.'
  return createSafeErrorAcknowledgement(fieldCode, message)
}

function membershipRequired(socket: LobbySocket): ReturnType<typeof createSafeErrorAcknowledgement> | null {
  if (socket.data.sessionId !== undefined) return null
  return createSafeErrorAcknowledgement('NOT_ROOM_MEMBER', 'Join a room before using this action.')
}

function unattachedSocketRequired(
  socket: LobbySocket,
): ReturnType<typeof createSafeErrorAcknowledgement> | null {
  if (socket.data.sessionId === undefined) return null
  return createSafeErrorAcknowledgement('INVALID_REQUEST', 'Leave the current room before joining another.')
}

function roomChannel(roomCode: string): string {
  return `frontier-isles:room:${roomCode}`
}

function closedMessage(reason: RoomClosedNotice['reason']): string {
  const messages: Readonly<Record<RoomClosedNotice['reason'], string>> = {
    EMPTY: 'The room closed because no eligible Human players remain.',
    IDLE_TIMEOUT: 'The room closed after its waiting-room idle limit.',
    HOST_CLOSED: 'The Host closed the paused game.',
    ABANDONED_TIMEOUT: 'The game closed after its replacement or completed-game retention limit.',
  }
  return messages[reason]
}

function publishClosed(
  server: RealtimeServer,
  roomCode: RoomCode,
  reason: RoomClosedNotice['reason'],
  disconnectSockets: boolean,
): void {
  const channel = roomChannel(roomCode)
  server.to(channel).emit('room:closed', roomClosedNoticeSchema.parse({
    roomCode,
    reason,
    message: closedMessage(reason),
  }))
  if (disconnectSockets) server.in(channel).disconnectSockets(true)
}

function publishLeaveResult(server: RealtimeServer, result: RoomLeaveResult): void {
  if (result.closed) {
    publishClosed(server, result.roomCode, 'EMPTY', false)
    return
  }
  if (result.snapshot === null) throw new Error('Open Room leave result must include a snapshot.')
  server.to(roomChannel(result.roomCode)).emit('room:snapshot', result.snapshot)
}

function publishLifecycleEvent(server: RealtimeServer, event: RoomLifecycleEvent): void {
  if (event.type === 'SNAPSHOT_UPDATED') {
    server.to(roomChannel(event.snapshot.roomCode)).emit('room:snapshot', event.snapshot)
    return
  }
  publishClosed(server, event.roomCode, event.reason, true)
}

function internalFailure(): ReturnType<typeof createSafeErrorAcknowledgement> {
  return createSafeErrorAcknowledgement('INTERNAL_ERROR', 'The server could not complete the request.')
}

const pendingReceipts = new WeakMap<LobbySocket, number>()
const serverReceipts = new WeakMap<RealtimeServer, number>()
export function pendingGameReceipts(server: RealtimeServer): number { return serverReceipts.get(server) ?? 0 }
function publishPrivateGameUpdate(server: RealtimeServer, socket: LobbySocket, update: Parameters<ServerToClientEvents['game:update']>[0]): void {
  // Receipt-bearing packets are excluded from Socket.IO's connection-recovery backlog.
  // Normal emission still queues behind an in-flight packet. The receipt only releases the
  // bounded callback; it does not drive execution, retry a command, or reconstruct state.
  const pending = pendingReceipts.get(socket) ?? 0
  if (pending >= 64) { socket.disconnect(true); return }
  pendingReceipts.set(socket, pending + 1)
  serverReceipts.set(server, pendingGameReceipts(server) + 1)
  socket.timeout(5_000).emit('game:update', update, (error: Error | null) => {
    pendingReceipts.set(socket, Math.max(0, (pendingReceipts.get(socket) ?? 1) - 1))
    serverReceipts.set(server, Math.max(0, pendingGameReceipts(server) - 1))
    if (error !== null) socket.disconnect(true)
  })
}

function publishAndAdvanceGame(game: GameSession | null, requester: LobbySocket): void {
  if (game === null) return
  try {
    game.publish()
    void game.advanceAi().catch(() => { requester.emit('server:error', internalFailure().error) })
  } catch {
    requester.emit('server:error', internalFailure().error)
  }
}

export function registerLobbyHandlers(
  server: RealtimeServer,
  roomService: InMemoryRoomService,
  limiter: RequestLimiter,
  reportFailure: () => void = () => {},
): void {
  const activeSockets = new Map<SessionId, LobbySocket>()
  roomService.subscribeToLifecycle((event) => publishLifecycleEvent(server, event))
  roomService.subscribeToGames(({ sessionId, update }) => {
    const recipient = activeSockets.get(sessionId)
    if (recipient?.connected && recipient.data.sessionId === sessionId) {
      publishPrivateGameUpdate(server, recipient, update)
    }
  })

  function attachSession(socket: LobbySocket, sessionId: SessionId, roomCode: RoomCode): void {
    const previous = activeSockets.get(sessionId)
    if (previous !== undefined && previous !== socket) {
      previous.emit('session:replaced', sessionReplacedNoticeSchema.parse({
        code: 'SESSION_REPLACED',
        message: 'This session continued in a newer tab.',
      }))
      delete previous.data.sessionId
      void previous.leave(roomChannel(roomCode))
      previous.disconnect(true)
    }
    socket.data.sessionId = sessionId
    activeSockets.set(sessionId, socket)
  }

  server.on('connection', (socket) => {
    delete socket.data.sessionId
    socket.use((packet, next) => {
      const values: readonly unknown[] = packet
      const event = values[0]
      const acknowledge = values.at(-1)
      try {
        if (!limiter.allow(socket.id, socket.data.sessionId, typeof event === 'string' ? event : 'invalid')) {
          if (typeof acknowledge === 'function') acknowledge(createSafeErrorAcknowledgement('RATE_LIMITED', 'Too many requests. Wait briefly and try again.'))
          else socket.disconnect(true)
          return
        }
        if (typeof acknowledge !== 'function') return
        if (typeof event !== 'string' || values.length !== 3 || !CLIENT_EVENT_NAMES.some((name) => name === event)) {
          acknowledge(createSafeErrorAcknowledgement('INVALID_REQUEST', 'The request is invalid.')); return
        }
        if (!isBoundedJson(values[1])) {
          acknowledge(createSafeErrorAcknowledgement('INVALID_REQUEST', 'The request is invalid.')); return
        }
        next()
      } catch { reportFailure(); socket.disconnect(true) }
    })
    function onRequest<Event extends keyof ClientToServerEvents>(event: Event, handler: ClientToServerEvents[Event]): void {
      socket.on<keyof ClientToServerEvents>(event, (...args: unknown[]): void => {
        const callback = args[1]
        if (typeof callback !== 'function') return
        let replied = false
        const acknowledge = (result: unknown): void => {
          if (replied || !socket.connected) return
          replied = true
          try { Reflect.apply(callback, undefined, [result]) } catch { reportFailure(); socket.disconnect(true) }
        }
        const failed = (): void => { reportFailure(); acknowledge(internalFailure()) }
        try { void Promise.resolve(Reflect.apply(handler, socket, [args[0], acknowledge])).catch(failed) } catch { failed() }
      })
    }
    socket.emit('server:hello', serverHelloSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      service: REALTIME_SERVICE_NAME,
    }))

    function gameMembershipRequired(): ReturnType<typeof createSafeErrorAcknowledgement> | null {
      const sessionId = socket.data.sessionId
      if (!socket.connected || sessionId === undefined || activeSockets.get(sessionId) !== socket) {
        return createSafeErrorAcknowledgement('NOT_ROOM_MEMBER', 'Resume your Human seat before playing.')
      }
      return null
    }

    onRequest('game:command', (payload: unknown, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const parsed = gameCommandRequestSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge(gameCommandAcknowledgementSchema.parse(validationFailure(payload, parsed.error)))
        return
      }
      const failure = gameMembershipRequired()
      const sessionId = socket.data.sessionId
      if (failure !== null || sessionId === undefined) {
        acknowledge(gameCommandAcknowledgementSchema.parse(failure ?? internalFailure()))
        return
      }
      void roomService.submitGameCommand(sessionId, parsed.data,
        () => gameMembershipRequired() === null && socket.data.sessionId === sessionId).then((result) => {
        acknowledge(gameCommandAcknowledgementSchema.parse(result))
      }).catch(() => {
        acknowledge(gameCommandAcknowledgementSchema.parse(internalFailure()))
      })
    })

    onRequest('room:replace-human', (payload: unknown, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const parsed = roomReplaceHumanRequestSchema.safeParse(payload)
      if (!parsed.success) { acknowledge(roomReplaceHumanAcknowledgementSchema.parse(validationFailure(payload, parsed.error))); return }
      const failure = gameMembershipRequired()
      const sessionId = socket.data.sessionId
      if (failure !== null || sessionId === undefined) { acknowledge(roomReplaceHumanAcknowledgementSchema.parse(failure ?? internalFailure())); return }
      void roomService.replaceExpiredHuman(sessionId, parsed.data.gameId, parsed.data.expectedRevision,
        parsed.data.seatId, parsed.data.profileId, () => gameMembershipRequired() === null && socket.data.sessionId === sessionId)
        .then((result) => { acknowledge(roomReplaceHumanAcknowledgementSchema.parse(result)) })
        .catch(() => { acknowledge(roomReplaceHumanAcknowledgementSchema.parse(internalFailure())) })
    })

    onRequest('room:close-game', (payload: unknown, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const parsed = roomCloseGameRequestSchema.safeParse(payload)
      if (!parsed.success) { acknowledge(roomCloseGameAcknowledgementSchema.parse(validationFailure(payload, parsed.error))); return }
      const failure = gameMembershipRequired()
      const sessionId = socket.data.sessionId
      if (failure !== null || sessionId === undefined) { acknowledge(roomCloseGameAcknowledgementSchema.parse(failure ?? internalFailure())); return }
      try {
        const result = roomService.closeActiveGame(sessionId, parsed.data.gameId, parsed.data.expectedRevision)
        acknowledge(roomCloseGameAcknowledgementSchema.parse(result))
        if (result.ok) publishClosed(server, result.data.roomCode, 'HOST_CLOSED', true)
      } catch { acknowledge(roomCloseGameAcknowledgementSchema.parse(internalFailure())) }
    })

    onRequest('game:request-snapshot', (payload: unknown, acknowledge) => {
      if (typeof acknowledge !== 'function') return
      const parsed = gameRequestSnapshotRequestSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge(gameRequestSnapshotAcknowledgementSchema.parse(validationFailure(payload, parsed.error)))
        return
      }
      const failure = gameMembershipRequired()
      const sessionId = socket.data.sessionId
      if (failure !== null || sessionId === undefined) {
        acknowledge(gameRequestSnapshotAcknowledgementSchema.parse(failure ?? internalFailure()))
        return
      }
      try {
        acknowledge(gameRequestSnapshotAcknowledgementSchema.parse(roomService.requestGameSnapshot(sessionId, parsed.data)))
      } catch {
        acknowledge(gameRequestSnapshotAcknowledgementSchema.parse(internalFailure()))
      }
    })

    onRequest('room:create', (payload: unknown, acknowledge) => {
      const unattachedFailure = unattachedSocketRequired(socket)
      if (unattachedFailure !== null) {
        acknowledge(roomCreateAcknowledgementSchema.parse(unattachedFailure))
        return
      }
      const parsed = roomCreateRequestSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge(roomCreateAcknowledgementSchema.parse(validationFailure(payload, parsed.error)))
        return
      }
      const result = roomService.createRoom(parsed.data.displayName)
      if (!result.ok) {
        acknowledge(roomCreateAcknowledgementSchema.parse(result))
        return
      }
      attachSession(socket, result.data.credential.sessionId, result.data.credential.roomCode)
      void Promise.resolve().then(() => socket.join(roomChannel(result.data.credential.roomCode))).then(() => {
        if (!socket.connected || activeSockets.get(result.data.credential.sessionId) !== socket) return
        acknowledge(roomCreateAcknowledgementSchema.parse(result))
        server.to(roomChannel(result.data.credential.roomCode)).emit('room:snapshot', result.data.snapshot)
      }).catch(() => {
        if (activeSockets.get(result.data.credential.sessionId) !== socket) return
        activeSockets.delete(result.data.credential.sessionId)
        delete socket.data.sessionId
        const leaveResult = roomService.leaveRoom(result.data.credential.sessionId)
        if (leaveResult.ok) publishLeaveResult(server, leaveResult.data)
        acknowledge(roomCreateAcknowledgementSchema.parse(internalFailure()))
      })
    })

    onRequest('room:join', (payload: unknown, acknowledge) => {
      const unattachedFailure = unattachedSocketRequired(socket)
      if (unattachedFailure !== null) {
        acknowledge(roomJoinAcknowledgementSchema.parse(unattachedFailure))
        return
      }
      const parsed = roomJoinRequestSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge(roomJoinAcknowledgementSchema.parse(validationFailure(payload, parsed.error)))
        return
      }
      const result = roomService.joinRoom(parsed.data.roomCode, parsed.data.displayName)
      if (!result.ok) {
        acknowledge(roomJoinAcknowledgementSchema.parse(result))
        return
      }
      attachSession(socket, result.data.credential.sessionId, result.data.credential.roomCode)
      void Promise.resolve().then(() => socket.join(roomChannel(result.data.credential.roomCode))).then(() => {
        if (!socket.connected || activeSockets.get(result.data.credential.sessionId) !== socket) return
        acknowledge(roomJoinAcknowledgementSchema.parse(result))
        server.to(roomChannel(result.data.credential.roomCode)).emit('room:snapshot', result.data.snapshot)
      }).catch(() => {
        if (activeSockets.get(result.data.credential.sessionId) !== socket) return
        activeSockets.delete(result.data.credential.sessionId)
        delete socket.data.sessionId
        const leaveResult = roomService.leaveRoom(result.data.credential.sessionId)
        if (leaveResult.ok) publishLeaveResult(server, leaveResult.data)
        acknowledge(roomJoinAcknowledgementSchema.parse(internalFailure()))
      })
    })

    onRequest('room:set-ready', (payload: unknown, acknowledge) => {
      const membershipFailure = membershipRequired(socket)
      if (membershipFailure !== null) {
        acknowledge(roomSetReadyAcknowledgementSchema.parse(membershipFailure))
        return
      }
      const parsed = roomSetReadyRequestSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge(roomSetReadyAcknowledgementSchema.parse(validationFailure(payload, parsed.error)))
        return
      }
      const sessionId = socket.data.sessionId
      if (sessionId === undefined) {
        acknowledge(roomSetReadyAcknowledgementSchema.parse(internalFailure()))
        return
      }
      const result = roomService.setReady(sessionId, parsed.data.expectedRevision, parsed.data.ready)
      if (!result.ok) {
        acknowledge(roomSetReadyAcknowledgementSchema.parse(result))
        return
      }
      acknowledge(roomSetReadyAcknowledgementSchema.parse({
        ok: true,
        data: { snapshot: result.data.snapshot },
      }))
      if (result.data.changed) {
        server.to(roomChannel(result.data.snapshot.roomCode)).emit('room:snapshot', result.data.snapshot)
      }
    })

    onRequest('room:set-ai-seat', (payload: unknown, acknowledge) => {
      const membershipFailure = membershipRequired(socket)
      if (membershipFailure !== null) {
        acknowledge(roomSetAiSeatAcknowledgementSchema.parse(membershipFailure))
        return
      }
      const parsed = roomSetAiSeatRequestSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge(roomSetAiSeatAcknowledgementSchema.parse(validationFailure(payload, parsed.error)))
        return
      }
      const sessionId = socket.data.sessionId
      if (sessionId === undefined) {
        acknowledge(roomSetAiSeatAcknowledgementSchema.parse(internalFailure()))
        return
      }
      const result = roomService.setAiSeat(
        sessionId,
        parsed.data.expectedRevision,
        parsed.data.seatId,
        parsed.data.profileId,
      )
      if (!result.ok) {
        acknowledge(roomSetAiSeatAcknowledgementSchema.parse(result))
        return
      }
      acknowledge(roomSetAiSeatAcknowledgementSchema.parse({
        ok: true,
        data: { snapshot: result.data.snapshot },
      }))
      if (result.data.changed) {
        server.to(roomChannel(result.data.snapshot.roomCode)).emit('room:snapshot', result.data.snapshot)
      }
    })

    onRequest('room:request-snapshot', (payload: unknown, acknowledge) => {
      const membershipFailure = membershipRequired(socket)
      if (membershipFailure !== null) {
        acknowledge(roomRequestSnapshotAcknowledgementSchema.parse(membershipFailure))
        return
      }
      const parsed = roomRequestSnapshotRequestSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge(roomRequestSnapshotAcknowledgementSchema.parse(validationFailure(payload, parsed.error)))
        return
      }
      const sessionId = socket.data.sessionId
      const result = sessionId === undefined ? internalFailure() : roomService.requestSnapshot(sessionId)
      acknowledge(roomRequestSnapshotAcknowledgementSchema.parse(result))
    })

    onRequest('room:start', (payload: unknown, acknowledge) => {
      const membershipFailure = membershipRequired(socket)
      if (membershipFailure !== null) {
        acknowledge(roomStartAcknowledgementSchema.parse(membershipFailure))
        return
      }
      const parsed = roomStartRequestSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge(roomStartAcknowledgementSchema.parse(validationFailure(payload, parsed.error)))
        return
      }
      const sessionId = socket.data.sessionId
      const result = sessionId === undefined
        ? internalFailure()
        : roomService.requestStart(sessionId, parsed.data.expectedRevision)
      acknowledge(roomStartAcknowledgementSchema.parse(result))
      if (result.ok) {
        server.to(roomChannel(result.data.snapshot.roomCode)).emit('room:snapshot', result.data.snapshot)
        const game = roomService.getGameSession(result.data.snapshot.roomCode)
        publishAndAdvanceGame(game, socket)
      }
    })

    onRequest('session:resume', (payload: unknown, acknowledge) => {
      const unattachedFailure = unattachedSocketRequired(socket)
      if (unattachedFailure !== null) {
        acknowledge(sessionResumeAcknowledgementSchema.parse(unattachedFailure))
        return
      }
      const parsed = sessionResumeRequestSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge(sessionResumeAcknowledgementSchema.parse(validationFailure(payload, parsed.error)))
        return
      }
      const result = roomService.resumeSession(parsed.data)
      if (!result.ok) {
        acknowledge(sessionResumeAcknowledgementSchema.parse(result))
        return
      }
      attachSession(socket, result.data.credential.sessionId, result.data.credential.roomCode)
      void Promise.resolve().then(() => socket.join(roomChannel(result.data.credential.roomCode))).then(() => {
        if (!socket.connected || activeSockets.get(result.data.credential.sessionId) !== socket) return
        acknowledge(sessionResumeAcknowledgementSchema.parse({
          ok: true,
          data: {
            credential: result.data.credential,
            snapshot: result.data.snapshot,
          },
        }))
        const game = roomService.getGameSession(result.data.credential.roomCode)
        if (game !== null) {
          publishPrivateGameUpdate(server, socket, game.snapshot(result.data.credential.sessionId))
          void game.advanceAi().catch(() => { socket.emit('server:error', internalFailure().error) })
        }
        if (result.data.changed) {
          server.to(roomChannel(result.data.snapshot.roomCode)).emit(
            'room:snapshot',
            result.data.snapshot,
          )
        }
      }).catch(() => {
        if (activeSockets.get(result.data.credential.sessionId) !== socket) return
        activeSockets.delete(result.data.credential.sessionId)
        delete socket.data.sessionId
        const disconnected = roomService.markDisconnected(result.data.credential.sessionId)
        if (disconnected.ok && disconnected.data.changed) {
          server.to(roomChannel(disconnected.data.snapshot.roomCode)).emit(
            'room:snapshot',
            disconnected.data.snapshot,
          )
        }
        acknowledge(sessionResumeAcknowledgementSchema.parse(internalFailure()))
      })
    })

    onRequest('room:leave', (payload: unknown, acknowledge) => {
      const membershipFailure = membershipRequired(socket)
      if (membershipFailure !== null) {
        acknowledge(roomLeaveAcknowledgementSchema.parse(membershipFailure))
        return
      }
      const parsed = roomLeaveRequestSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge(roomLeaveAcknowledgementSchema.parse(validationFailure(payload, parsed.error)))
        return
      }
      const sessionId = socket.data.sessionId
      if (sessionId === undefined) {
        acknowledge(roomLeaveAcknowledgementSchema.parse(internalFailure()))
        return
      }
      const result = roomService.leaveRoom(sessionId)
      if (!result.ok) {
        acknowledge(roomLeaveAcknowledgementSchema.parse(result))
        return
      }
      acknowledge(roomLeaveAcknowledgementSchema.parse({
        ok: true,
        data: { roomCode: result.data.roomCode },
      }))
      if (activeSockets.get(sessionId) === socket) activeSockets.delete(sessionId)
      delete socket.data.sessionId
      publishLeaveResult(server, result.data)
      void socket.leave(roomChannel(result.data.roomCode))
    })

    socket.on('disconnect', () => {
      const sessionId = socket.data.sessionId
      if (sessionId === undefined || activeSockets.get(sessionId) !== socket) return
      activeSockets.delete(sessionId)
      delete socket.data.sessionId
      const result = roomService.markDisconnected(sessionId)
      if (result.ok && result.data.changed) {
        server.to(roomChannel(result.data.snapshot.roomCode)).emit('room:snapshot', result.data.snapshot)
      }
    })
  })
}
