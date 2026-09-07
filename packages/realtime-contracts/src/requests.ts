import { z } from 'zod'
import { REALTIME_PROTOCOL_VERSION } from './protocol-version.js'
import { gameCommandRequestSchema, gameRequestSnapshotRequestSchema } from './game.js'
import { gameIdSchema } from './game-values.js'
import {
  aiProfileIdSchema,
  displayNameInputSchema,
  resumeTokenSchema,
  roomCodeSchema,
  roomRevisionSchema,
  seatIdSchema,
  sessionIdSchema,
} from './domains.js'

const protocolVersionField = z.literal(REALTIME_PROTOCOL_VERSION)

export const roomCreateRequestSchema = z.strictObject({
  protocolVersion: protocolVersionField,
  displayName: displayNameInputSchema,
})

export const roomJoinRequestSchema = z.strictObject({
  protocolVersion: protocolVersionField,
  displayName: displayNameInputSchema,
  roomCode: roomCodeSchema,
})

export const roomSetReadyRequestSchema = z.strictObject({
  protocolVersion: protocolVersionField,
  expectedRevision: roomRevisionSchema,
  ready: z.boolean(),
})

export const roomSetAiSeatRequestSchema = z.strictObject({
  protocolVersion: protocolVersionField,
  expectedRevision: roomRevisionSchema,
  seatId: seatIdSchema,
  profileId: aiProfileIdSchema.nullable(),
})

export const roomLeaveRequestSchema = z.strictObject({
  protocolVersion: protocolVersionField,
})

export const roomRequestSnapshotRequestSchema = z.strictObject({
  protocolVersion: protocolVersionField,
})

export const sessionResumeRequestSchema = z.strictObject({
  protocolVersion: protocolVersionField,
  sessionId: sessionIdSchema,
  resumeToken: resumeTokenSchema,
  roomCode: roomCodeSchema,
  seatId: seatIdSchema,
})

export const roomStartRequestSchema = z.strictObject({
  protocolVersion: protocolVersionField,
  expectedRevision: roomRevisionSchema,
})
export const roomReplaceHumanRequestSchema = z.strictObject({
  protocolVersion: protocolVersionField, gameId: gameIdSchema, expectedRevision: roomRevisionSchema,
  seatId: seatIdSchema, profileId: aiProfileIdSchema,
})
export const roomCloseGameRequestSchema = z.strictObject({
  protocolVersion: protocolVersionField, gameId: gameIdSchema, expectedRevision: roomRevisionSchema,
})
export type RoomReplaceHumanRequest = Readonly<z.infer<typeof roomReplaceHumanRequestSchema>>
export type RoomCloseGameRequest = Readonly<z.infer<typeof roomCloseGameRequestSchema>>

export type RoomCreateRequest = Readonly<z.infer<typeof roomCreateRequestSchema>>
export type RoomJoinRequest = Readonly<z.infer<typeof roomJoinRequestSchema>>
export type RoomSetReadyRequest = Readonly<z.infer<typeof roomSetReadyRequestSchema>>
export type RoomSetAiSeatRequest = Readonly<z.infer<typeof roomSetAiSeatRequestSchema>>
export type RoomLeaveRequest = Readonly<z.infer<typeof roomLeaveRequestSchema>>
export type RoomRequestSnapshotRequest = Readonly<z.infer<typeof roomRequestSnapshotRequestSchema>>
export type SessionResumeRequest = Readonly<z.infer<typeof sessionResumeRequestSchema>>
export type RoomStartRequest = Readonly<z.infer<typeof roomStartRequestSchema>>

export const CLIENT_REQUEST_SCHEMAS = Object.freeze({
  'room:create': roomCreateRequestSchema,
  'room:join': roomJoinRequestSchema,
  'room:set-ready': roomSetReadyRequestSchema,
  'room:set-ai-seat': roomSetAiSeatRequestSchema,
  'room:leave': roomLeaveRequestSchema,
  'room:request-snapshot': roomRequestSnapshotRequestSchema,
  'session:resume': sessionResumeRequestSchema,
  'room:start': roomStartRequestSchema,
  'room:replace-human': roomReplaceHumanRequestSchema,
  'room:close-game': roomCloseGameRequestSchema,
  'game:command': gameCommandRequestSchema,
  'game:request-snapshot': gameRequestSnapshotRequestSchema,
})

export const CLIENT_EVENT_NAMES = Object.freeze(Object.keys(CLIENT_REQUEST_SCHEMAS) as Array<
  keyof typeof CLIENT_REQUEST_SCHEMAS
>)
