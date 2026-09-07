import { createHash } from 'node:crypto'
import type { GameCommandRequest } from '@frontier-isles/realtime-contracts'

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)) {
    const record = value as Readonly<Record<string, unknown>>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  throw new Error('Command fingerprint requires serializable request data.')
}

/** Server-private; neither the input nor the digest is a credential or public outcome. */
export function commandRequestFingerprint(request: GameCommandRequest): string {
  return createHash('sha256').update(canonicalJson(request)).digest('hex')
}
