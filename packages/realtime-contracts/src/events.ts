import { z } from 'zod'
import { REALTIME_SERVICE_NAME } from './health.js'
import {
  gameUpdateSchema,
  type GameUpdate,
  type GameCommandRequest,
  type GameCommandAcknowledgement,
  type GameRequestSnapshotRequest,
  type GameRequestSnapshotAcknowledgement,
} from './game.js'
import { REALTIME_PROTOCOL_VERSION } from './protocol-version.js'
import {
  publicMessageSchema,
  roomCodeSchema,
  safeErrorSchema,
} from './domains.js'
import { roomSnapshotSchema, type RoomSnapshot } from './room.js'
import type {
  RoomCreateAcknowledgement,
  RoomJoinAcknowledgement,
  RoomLeaveAcknowledgement,
  RoomRequestSnapshotAcknowledgement,
  RoomSetAiSeatAcknowledgement,
  RoomSetReadyAcknowledgement,
  RoomStartAcknowledgement,
  SessionResumeAcknowledgement,
} from './acknowledgements.js'
import type {
  RoomCreateRequest,
  RoomJoinRequest,
  RoomLeaveRequest,
  RoomRequestSnapshotRequest,
  RoomSetAiSeatRequest,
  RoomSetReadyRequest,
  RoomStartRequest,
  SessionResumeRequest,
} from './requests.js'

export const serverHelloSchema = z.strictObject({
  protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
  service: z.literal(REALTIME_SERVICE_NAME),
})

export const sessionReplacedNoticeSchema = z.strictObject({
  code: z.literal('SESSION_REPLACED'),
  message: publicMessageSchema,
})

export const roomClosedNoticeSchema = z.strictObject({
  roomCode: roomCodeSchema,
  reason: z.enum(['EMPTY', 'IDLE_TIMEOUT']),
  message: publicMessageSchema,
})

export type ServerHello = Readonly<z.infer<typeof serverHelloSchema>>
export type SessionReplacedNotice = Readonly<z.infer<typeof sessionReplacedNoticeSchema>>
export type RoomClosedNotice = Readonly<z.infer<typeof roomClosedNoticeSchema>>

export interface ClientToServerEvents {
  readonly 'game:command': (request: GameCommandRequest, acknowledge: (result: GameCommandAcknowledgement) => void) => void
  readonly 'game:request-snapshot': (request: GameRequestSnapshotRequest, acknowledge: (result: GameRequestSnapshotAcknowledgement) => void) => void
  readonly 'room:create': (
    request: RoomCreateRequest,
    acknowledge: (result: RoomCreateAcknowledgement) => void,
  ) => void
  readonly 'room:join': (
    request: RoomJoinRequest,
    acknowledge: (result: RoomJoinAcknowledgement) => void,
  ) => void
  readonly 'room:set-ready': (
    request: RoomSetReadyRequest,
    acknowledge: (result: RoomSetReadyAcknowledgement) => void,
  ) => void
  readonly 'room:set-ai-seat': (
    request: RoomSetAiSeatRequest,
    acknowledge: (result: RoomSetAiSeatAcknowledgement) => void,
  ) => void
  readonly 'room:leave': (
    request: RoomLeaveRequest,
    acknowledge: (result: RoomLeaveAcknowledgement) => void,
  ) => void
  readonly 'room:request-snapshot': (
    request: RoomRequestSnapshotRequest,
    acknowledge: (result: RoomRequestSnapshotAcknowledgement) => void,
  ) => void
  readonly 'session:resume': (
    request: SessionResumeRequest,
    acknowledge: (result: SessionResumeAcknowledgement) => void,
  ) => void
  readonly 'room:start': (
    request: RoomStartRequest,
    acknowledge: (result: RoomStartAcknowledgement) => void,
  ) => void
}

export interface ServerToClientEvents {
  readonly 'game:update': (update: GameUpdate, received: () => void) => void
  readonly 'server:hello': (hello: ServerHello) => void
  readonly 'room:snapshot': (snapshot: RoomSnapshot) => void
  readonly 'session:replaced': (notice: SessionReplacedNotice) => void
  readonly 'room:closed': (notice: RoomClosedNotice) => void
  readonly 'server:error': (error: z.infer<typeof safeErrorSchema>) => void
}

export const SERVER_EVENT_SCHEMAS = Object.freeze({
  'game:update': gameUpdateSchema,
  'server:hello': serverHelloSchema,
  'room:snapshot': roomSnapshotSchema,
  'session:replaced': sessionReplacedNoticeSchema,
  'room:closed': roomClosedNoticeSchema,
  'server:error': safeErrorSchema,
})

export const SERVER_EVENT_NAMES = Object.freeze(Object.keys(SERVER_EVENT_SCHEMAS) as Array<
  keyof typeof SERVER_EVENT_SCHEMAS
>)
