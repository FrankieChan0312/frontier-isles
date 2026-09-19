import { createHash } from 'node:crypto'
import type { RoomCode } from '@frontier-isles/realtime-contracts'
import { canonicalJson } from './canonical-json.js'
import { MAX_MULTIPLAYER_RECORD_BYTES, multiplayerRecordSchema, type MultiplayerRecord } from './multiplayer-record.js'

export type PersistenceFailureCode = 'PERSISTENCE_OPEN_FAILED' | 'PERSISTENCE_WRITE_FAILED' | 'PERSISTENCE_INVALID_RECORD'
export class PersistenceError extends Error {
  public readonly code: PersistenceFailureCode
  public constructor(code: PersistenceFailureCode) {
    super(`${code}: Check the private data volume, permissions, free space and recovery runbook.`)
    this.code = code
  }
}
export interface PersistenceDiagnostic {
  readonly code: 'PERSISTENCE_RECOVERED' | 'PERSISTENCE_QUARANTINED' | PersistenceFailureCode
  readonly records?: number
}
/**
 * One Room and its GameSession/session/cache data form a single atomic durable record.
 * Methods return Promises: save/remove resolve only after durable commit. Callers
 * must stop authority on failure, including an uncertain commit; never retry a write
 * blindly. load validates/quarantines records before recovery, without rebuilding state.
 * Database concurrency tokens belong to the adapter, not gameplay or Room revisions.
 */
export interface MultiplayerRepository {
  load(): Promise<readonly MultiplayerRecord[]>
  save(record: MultiplayerRecord): Promise<void>
  remove(roomCode: RoomCode): Promise<void>
  flush(): Promise<void>
  close(): Promise<void>
}
export interface EncodedMultiplayerRecord {
  readonly record: MultiplayerRecord
  readonly payload: string
  readonly checksum: string
}
export function recordChecksum(payload: string): string {
  return createHash('sha256').update(payload).digest('hex')
}
export function encodeMultiplayerRecord(value: unknown): EncodedMultiplayerRecord {
  try {
    const payload = canonicalJson(value)
    if (Buffer.byteLength(payload) > MAX_MULTIPLAYER_RECORD_BYTES) throw new PersistenceError('PERSISTENCE_INVALID_RECORD')
    const record = multiplayerRecordSchema.parse(value)
    if (canonicalJson(record) !== payload) throw new PersistenceError('PERSISTENCE_INVALID_RECORD')
    return { record, payload, checksum: recordChecksum(payload) }
  } catch { throw new PersistenceError('PERSISTENCE_INVALID_RECORD') }
}
export function decodeMultiplayerRecord(payload: string, checksum: string): MultiplayerRecord {
  if (Buffer.byteLength(payload) > MAX_MULTIPLAYER_RECORD_BYTES || recordChecksum(payload) !== checksum) {
    throw new PersistenceError('PERSISTENCE_INVALID_RECORD')
  }
  try {
    const value: unknown = JSON.parse(payload)
    const encoded = encodeMultiplayerRecord(value)
    if (encoded.payload !== payload) throw new PersistenceError('PERSISTENCE_INVALID_RECORD')
    return encoded.record
  } catch { throw new PersistenceError('PERSISTENCE_INVALID_RECORD') }
}
export class InMemoryMultiplayerRepository implements MultiplayerRepository {
  readonly #records = new Map<RoomCode, MultiplayerRecord>()
  public async load(): Promise<readonly MultiplayerRecord[]> { return structuredClone([...this.#records.values()]) }
  public async save(record: MultiplayerRecord): Promise<void> {
    const validated = encodeMultiplayerRecord(record).record
    this.#records.set(validated.roomCode, validated)
  }
  public async remove(roomCode: RoomCode): Promise<void> { this.#records.delete(roomCode) }
  public async flush(): Promise<void> {}
  public async close(): Promise<void> {}
}
