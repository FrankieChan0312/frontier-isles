import { createHash, timingSafeEqual } from 'node:crypto'
import type { ResumeToken } from '@frontier-isles/realtime-contracts'

export function digestResumeToken(token: ResumeToken): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url')
}

export function resumeTokenMatches(token: ResumeToken, expectedDigest: string): boolean {
  const actual = Buffer.from(digestResumeToken(token), 'utf8')
  const expected = Buffer.from(expectedDigest, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
