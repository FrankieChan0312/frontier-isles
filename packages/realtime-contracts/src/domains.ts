import { z } from 'zod'

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' as const
export const CANONICAL_SEAT_IDS = Object.freeze(['NORTH', 'EAST', 'SOUTH', 'WEST'] as const)
export const AI_PROFILE_IDS = Object.freeze(['MERCHANT', 'BUILDER', 'SENTINEL'] as const)
export const ROOM_LIFECYCLE_STATUSES = Object.freeze(['WAITING', 'CLOSED', 'ACTIVE', 'FINISHED'] as const)
export const CONNECTION_STATUSES = Object.freeze([
  'CONNECTED',
  'RECONNECTING',
  'DISCONNECTED',
] as const)
export const START_READINESS_BLOCKER_CODES = Object.freeze([
  'ROOM_NOT_WAITING',
  'SEATS_NOT_FULL',
  'NOT_ENOUGH_HUMANS',
  'HUMANS_NOT_CONNECTED',
  'HUMANS_NOT_READY',
] as const)
export const SAFE_ERROR_CODES = Object.freeze([
  'PROTOCOL_VERSION_MISMATCH',
  'INVALID_REQUEST',
  'INVALID_DISPLAY_NAME',
  'DISPLAY_NAME_TAKEN',
  'INVALID_ROOM_CODE',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_CLOSED',
  'NOT_ROOM_MEMBER',
  'NOT_HOST',
  'SEAT_UNAVAILABLE',
  'REVISION_CONFLICT',
  'SESSION_INVALID',
  'SESSION_REPLACED',
  'START_CONDITIONS_NOT_MET',
  'GAME_START_NOT_AVAILABLE',
  'ROOM_NOT_WAITING',
  'GAME_NOT_FOUND',
  'GAME_UNAVAILABLE',
  'COMMAND_ID_CONFLICT',
  'GAME_BUSY',
  'INTERNAL_ERROR',
] as const)

function containsAsciiControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index)
    if (codeUnit <= 0x1f || codeUnit === 0x7f) return true
  }
  return false
}

export const roomCodeSchema = z.string()
  .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/u, 'Invalid room code.')
  .brand<'RoomCode'>()

export const sessionIdSchema = z.string()
  .regex(/^[A-Za-z0-9_-]{16,128}$/u, 'Invalid session ID.')
  .brand<'SessionId'>()

export const resumeTokenSchema = z.string()
  .regex(/^[A-Za-z0-9_-]{43,256}$/u, 'Invalid resume token.')
  .brand<'ResumeToken'>()

export const seatIdSchema = z.enum(CANONICAL_SEAT_IDS)
export const aiProfileIdSchema = z.enum(AI_PROFILE_IDS)
export const roomLifecycleStatusSchema = z.enum(ROOM_LIFECYCLE_STATUSES)
export const connectionStatusSchema = z.enum(CONNECTION_STATUSES)
export const startReadinessBlockerCodeSchema = z.enum(START_READINESS_BLOCKER_CODES)
export const safeErrorCodeSchema = z.enum(SAFE_ERROR_CODES)
export const roomRevisionSchema = z.number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER)
  .brand<'RoomRevision'>()

export type RoomCode = z.infer<typeof roomCodeSchema>
export type SessionId = z.infer<typeof sessionIdSchema>
export type ResumeToken = z.infer<typeof resumeTokenSchema>
export type SeatId = z.infer<typeof seatIdSchema>
export type AiProfileId = z.infer<typeof aiProfileIdSchema>
export type RoomLifecycleStatus = z.infer<typeof roomLifecycleStatusSchema>
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>
export type StartReadinessBlockerCode = z.infer<typeof startReadinessBlockerCodeSchema>
export type SafeErrorCode = z.infer<typeof safeErrorCodeSchema>
export type RoomRevision = z.infer<typeof roomRevisionSchema>

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/gu, ' ')
}

function isValidDisplayName(value: string): boolean {
  const codePointLength = [...value].length
  return codePointLength >= 1
    && codePointLength <= 24
    && !containsAsciiControlCharacter(value)
}

export const displayNameInputSchema = z.string()
  .transform(normalizeDisplayName)
  .refine(isValidDisplayName, 'Invalid display name.')

export const displayNameSchema = z.string()
  .refine((value) => normalizeDisplayName(value) === value, 'Display name is not normalized.')
  .refine(isValidDisplayName, 'Invalid display name.')

export const publicMessageSchema = z.string()
  .min(1)
  .max(200)
  .refine((value) => !containsAsciiControlCharacter(value), 'Message is not public-safe.')

export const safeErrorSchema = z.strictObject({
  code: safeErrorCodeSchema,
  message: publicMessageSchema,
})

export type SafeError = Readonly<z.infer<typeof safeErrorSchema>>
