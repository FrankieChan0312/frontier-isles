import { z } from 'zod'
import { REALTIME_PROTOCOL_VERSION } from './protocol-version.js'
import {
  resumeTokenSchema,
  roomCodeSchema,
  safeErrorSchema,
  seatIdSchema,
  sessionIdSchema,
  type SafeError,
} from './domains.js'
import { roomSnapshotSchema, type RoomSnapshot } from './room.js'

export const sessionCredentialSchema = z.strictObject({
  protocolVersion: z.literal(REALTIME_PROTOCOL_VERSION),
  sessionId: sessionIdSchema,
  resumeToken: resumeTokenSchema,
  roomCode: roomCodeSchema,
  seatId: seatIdSchema,
})

export type SessionCredential = Readonly<z.infer<typeof sessionCredentialSchema>>

export const roomSessionDataSchema = z.strictObject({
  credential: sessionCredentialSchema,
  snapshot: roomSnapshotSchema,
})

export const roomSnapshotDataSchema = z.strictObject({
  snapshot: roomSnapshotSchema,
})

export const roomLeaveDataSchema = z.strictObject({
  roomCode: roomCodeSchema,
})

export type RoomSessionData = Readonly<z.infer<typeof roomSessionDataSchema>>
export type RoomSnapshotData = Readonly<z.infer<typeof roomSnapshotDataSchema>>
export type RoomLeaveData = Readonly<z.infer<typeof roomLeaveDataSchema>>

export type Acknowledgement<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: SafeError }

function acknowledgementSchema<T extends z.ZodType>(dataSchema: T) {
  return z.discriminatedUnion('ok', [
    z.strictObject({ ok: z.literal(true), data: dataSchema }),
    z.strictObject({ ok: z.literal(false), error: safeErrorSchema }),
  ])
}

export const roomCreateAcknowledgementSchema = acknowledgementSchema(roomSessionDataSchema)
export const roomJoinAcknowledgementSchema = acknowledgementSchema(roomSessionDataSchema)
export const roomSetReadyAcknowledgementSchema = acknowledgementSchema(roomSnapshotDataSchema)
export const roomSetAiSeatAcknowledgementSchema = acknowledgementSchema(roomSnapshotDataSchema)
export const roomLeaveAcknowledgementSchema = acknowledgementSchema(roomLeaveDataSchema)
export const roomRequestSnapshotAcknowledgementSchema = acknowledgementSchema(roomSnapshotDataSchema)
export const sessionResumeAcknowledgementSchema = acknowledgementSchema(roomSessionDataSchema)
export const roomStartAcknowledgementSchema = acknowledgementSchema(roomSnapshotDataSchema)
export const roomReplaceHumanAcknowledgementSchema = acknowledgementSchema(roomSnapshotDataSchema)
export const roomCloseGameAcknowledgementSchema = acknowledgementSchema(roomLeaveDataSchema)
export type RoomReplaceHumanAcknowledgement = Acknowledgement<RoomSnapshotData>
export type RoomCloseGameAcknowledgement = Acknowledgement<RoomLeaveData>

export type RoomCreateAcknowledgement = Acknowledgement<RoomSessionData>
export type RoomJoinAcknowledgement = Acknowledgement<RoomSessionData>
export type RoomSetReadyAcknowledgement = Acknowledgement<RoomSnapshotData>
export type RoomSetAiSeatAcknowledgement = Acknowledgement<RoomSnapshotData>
export type RoomLeaveAcknowledgement = Acknowledgement<RoomLeaveData>
export type RoomRequestSnapshotAcknowledgement = Acknowledgement<RoomSnapshotData>
export type SessionResumeAcknowledgement = Acknowledgement<RoomSessionData>
export type RoomStartAcknowledgement = Acknowledgement<RoomSnapshotData>

export function createSafeErrorAcknowledgement(code: SafeError['code'], message: string): {
  readonly ok: false
  readonly error: SafeError
} {
  const error = safeErrorSchema.parse({ code, message })
  return {
    ok: false,
    error,
  }
}

export function createSnapshotAcknowledgement(snapshot: RoomSnapshot): {
  readonly ok: true
  readonly data: RoomSnapshotData
} {
  return {
    ok: true,
    data: roomSnapshotDataSchema.parse({ snapshot }),
  }
}
