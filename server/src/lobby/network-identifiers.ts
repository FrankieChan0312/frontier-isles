import { randomBytes } from 'node:crypto'
import {
  resumeTokenSchema,
  ROOM_CODE_ALPHABET,
  roomCodeSchema,
  sessionIdSchema,
  type ResumeToken,
  type RoomCode,
  type SessionId,
} from '@frontier-isles/realtime-contracts'

export interface NetworkIdentifierGenerators {
  readonly nextRoomCode: () => RoomCode
  readonly nextSessionId: () => SessionId
  readonly nextResumeToken: () => ResumeToken
}

function createRoomCode(): RoomCode {
  const entropy = randomBytes(6)
  let value = ''
  for (const byte of entropy) {
    value += ROOM_CODE_ALPHABET[byte & 31]
  }
  return roomCodeSchema.parse(value)
}

function createSessionId(): SessionId {
  return sessionIdSchema.parse(randomBytes(18).toString('base64url'))
}

function createResumeToken(): ResumeToken {
  return resumeTokenSchema.parse(randomBytes(32).toString('base64url'))
}

export function createCryptoNetworkIdentifierGenerators(): NetworkIdentifierGenerators {
  return Object.freeze({
    nextRoomCode: createRoomCode,
    nextSessionId: createSessionId,
    nextResumeToken: createResumeToken,
  })
}
