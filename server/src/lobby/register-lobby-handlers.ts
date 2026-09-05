import type { Socket } from 'socket.io'
import {
  REALTIME_PROTOCOL_VERSION,
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
  sessionResumeAcknowledgementSchema,
  sessionResumeRequestSchema,
  type ClientToServerEvents,
  type SafeErrorCode,
  type ServerToClientEvents,
} from '@frontier-isles/realtime-contracts'
import type {
  InterServerEvents,
  RealtimeServer,
  SocketData,
} from '../create-realtime-server.js'
import type { InMemoryRoomService, RoomLeaveResult } from './room-service.js'

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

function publishLeaveResult(server: RealtimeServer, result: RoomLeaveResult): void {
  const channel = roomChannel(result.roomCode)
  if (result.closed) {
    server.to(channel).emit('room:closed', roomClosedNoticeSchema.parse({
      roomCode: result.roomCode,
      reason: 'EMPTY',
      message: 'The room closed because no Human players remain.',
    }))
    return
  }
  if (result.snapshot === null) {
    throw new Error('Open Room leave result must include a snapshot.')
  }
  server.to(channel).emit('room:snapshot', result.snapshot)
}

function internalFailure(): ReturnType<typeof createSafeErrorAcknowledgement> {
  return createSafeErrorAcknowledgement('INTERNAL_ERROR', 'The server could not complete the request.')
}

export function registerLobbyHandlers(
  server: RealtimeServer,
  roomService: InMemoryRoomService,
): void {
  server.on('connection', (socket) => {
    socket.emit('server:hello', serverHelloSchema.parse({
      protocolVersion: REALTIME_PROTOCOL_VERSION,
      service: REALTIME_SERVICE_NAME,
    }))

    socket.on('room:create', (payload: unknown, acknowledge) => {
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

      void Promise.resolve(socket.join(roomChannel(result.data.credential.roomCode))).then(() => {
        socket.data.sessionId = result.data.credential.sessionId
        acknowledge(roomCreateAcknowledgementSchema.parse(result))
        server.to(roomChannel(result.data.credential.roomCode)).emit(
          'room:snapshot',
          result.data.snapshot,
        )
      }).catch(() => {
        const leaveResult = roomService.leaveRoom(result.data.credential.sessionId)
        if (leaveResult.ok) publishLeaveResult(server, leaveResult.data)
        acknowledge(roomCreateAcknowledgementSchema.parse(internalFailure()))
      })
    })

    socket.on('room:join', (payload: unknown, acknowledge) => {
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

      void Promise.resolve(socket.join(roomChannel(result.data.credential.roomCode))).then(() => {
        socket.data.sessionId = result.data.credential.sessionId
        acknowledge(roomJoinAcknowledgementSchema.parse(result))
        server.to(roomChannel(result.data.credential.roomCode)).emit(
          'room:snapshot',
          result.data.snapshot,
        )
      }).catch(() => {
        const leaveResult = roomService.leaveRoom(result.data.credential.sessionId)
        if (leaveResult.ok) publishLeaveResult(server, leaveResult.data)
        acknowledge(roomJoinAcknowledgementSchema.parse(internalFailure()))
      })
    })

    socket.on('room:set-ready', (payload: unknown, acknowledge) => {
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
      const acknowledgement = roomSetReadyAcknowledgementSchema.parse({
        ok: true,
        data: { snapshot: result.data.snapshot },
      })
      acknowledge(acknowledgement)
      if (result.data.changed) {
        server.to(roomChannel(result.data.snapshot.roomCode)).emit('room:snapshot', result.data.snapshot)
      }
    })

    socket.on('room:set-ai-seat', (payload: unknown, acknowledge) => {
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
      const acknowledgement = roomSetAiSeatAcknowledgementSchema.parse({
        ok: true,
        data: { snapshot: result.data.snapshot },
      })
      acknowledge(acknowledgement)
      if (result.data.changed) {
        server.to(roomChannel(result.data.snapshot.roomCode)).emit('room:snapshot', result.data.snapshot)
      }
    })

    socket.on('room:request-snapshot', (payload: unknown, acknowledge) => {
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

    socket.on('room:start', (payload: unknown, acknowledge) => {
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
    })

    socket.on('session:resume', (payload: unknown, acknowledge) => {
      const parsed = sessionResumeRequestSchema.safeParse(payload)
      if (!parsed.success) {
        acknowledge(sessionResumeAcknowledgementSchema.parse(validationFailure(payload, parsed.error)))
        return
      }
      acknowledge(sessionResumeAcknowledgementSchema.parse(createSafeErrorAcknowledgement(
        'SESSION_INVALID',
        'Session resume is added in the recovery stage.',
      )))
    })

    socket.on('room:leave', (payload: unknown, acknowledge) => {
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
      publishLeaveResult(server, result.data)
      delete socket.data.sessionId
      void socket.leave(roomChannel(result.data.roomCode))
    })

    socket.on('disconnect', () => {
      const sessionId = socket.data.sessionId
      if (sessionId === undefined) return
      delete socket.data.sessionId
      const result = roomService.leaveRoom(sessionId)
      if (result.ok) publishLeaveResult(server, result.data)
    })
  })
}
