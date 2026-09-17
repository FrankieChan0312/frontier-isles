import { MessageChannel, receiveMessageOnPort, Worker, type MessagePort } from 'node:worker_threads'
import { z } from 'zod'
import type { RoomCode } from '@frontier-isles/realtime-contracts'
import type { MysqlConfig } from './mysql-config.js'
import { multiplayerRecordSchema, type MultiplayerRecord } from './multiplayer-record.js'
import { encodeMultiplayerRecord, PersistenceError, type MultiplayerRepository, type PersistenceDiagnostic } from './multiplayer-repository.js'
import type { MysqlWorkerRequest } from './mysql-worker-protocol.js'

const replySchema = z.object({
  value: z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), records: z.array(multiplayerRecordSchema).max(64).optional() }),
    z.object({ ok: z.literal(false), code: z.enum(['PERSISTENCE_OPEN_FAILED', 'PERSISTENCE_WRITE_FAILED', 'PERSISTENCE_INVALID_RECORD']) }),
  ]),
  diagnostics: z.array(z.object({ code: z.enum(['PERSISTENCE_OPEN_FAILED', 'PERSISTENCE_WRITE_FAILED', 'PERSISTENCE_INVALID_RECORD',
    'PERSISTENCE_RECOVERED', 'PERSISTENCE_QUARANTINED']), records: z.number().int().nonnegative().optional() })).max(4),
})

/** Keeps the accepted no-yield authoritative commit boundary; all network I/O is worker-owned. */
export class MysqlMultiplayerRepository implements MultiplayerRepository {
  readonly #worker: Worker
  readonly #port: MessagePort
  readonly #signal = new Int32Array(new SharedArrayBuffer(4))
  readonly #onDiagnostic: (diagnostic: PersistenceDiagnostic) => void
  #closed = false

  public constructor(config: MysqlConfig, options: { readonly onDiagnostic?: (diagnostic: PersistenceDiagnostic) => void } = {}) {
    this.#onDiagnostic = options.onDiagnostic ?? (() => {})
    const channel = new MessageChannel()
    this.#port = channel.port1
    const source = import.meta.url.endsWith('.ts')
    const url = new URL(source ? './mysql-worker.ts' : './mysql-worker.js', import.meta.url)
    const workerOptions = { workerData: { config, port: channel.port2, signal: this.#signal.buffer },
      transferList: [channel.port2], stdout: true, stderr: true }
    this.#worker = source
      ? new Worker(`import('tsx/esm/api').then(({ register }) => { register(); return import(${JSON.stringify(url.href)}) })`, { ...workerOptions, eval: true })
      : new Worker(url, workerOptions)
    // Driver/worker errors must never escape as credentials, SQL values or private payloads.
    this.#worker.stdout?.resume()
    this.#worker.stderr?.resume()
    this.#worker.on('error', () => { this.#stop() })
    try { this.#receive(30_000) } catch {
      this.#stop()
      throw new PersistenceError('PERSISTENCE_OPEN_FAILED')
    }
  }
  public load(): readonly MultiplayerRecord[] {
    const records = this.#call({ operation: 'load' }, 30_000)
    if (records === undefined) { this.#stop(); throw new PersistenceError('PERSISTENCE_OPEN_FAILED') }
    return records
  }
  public save(record: MultiplayerRecord): void {
    const validated = encodeMultiplayerRecord(record).record
    this.#call({ operation: 'save', record: validated })
  }
  public remove(roomCode: RoomCode): void { this.#call({ operation: 'remove', roomCode }) }
  public flush(): void { this.#call({ operation: 'flush' }) }
  public close(): void {
    if (this.#closed) return
    try { this.#call({ operation: 'close' }) } finally { this.#stop() }
  }
  #stop(): void {
    this.#closed = true
    this.#port.close()
    void this.#worker.terminate()
  }
  #call(request: MysqlWorkerRequest, timeoutMs = 8000): readonly MultiplayerRecord[] | undefined {
    if (this.#closed) throw new PersistenceError('PERSISTENCE_WRITE_FAILED')
    Atomics.store(this.#signal, 0, 0)
    this.#port.postMessage(request)
    return this.#receive(timeoutMs)
  }
  #receive(timeoutMs: number): readonly MultiplayerRecord[] | undefined {
    try {
      if (Atomics.wait(this.#signal, 0, 0, timeoutMs) === 'timed-out') throw new PersistenceError('PERSISTENCE_WRITE_FAILED')
      const message: unknown = receiveMessageOnPort(this.#port)?.message
      const reply = replySchema.parse(message)
      for (const diagnostic of reply.diagnostics) this.#onDiagnostic({ code: diagnostic.code,
        ...(diagnostic.records === undefined ? {} : { records: diagnostic.records }) })
      if (!reply.value.ok) throw new PersistenceError(reply.value.code)
      return reply.value.records
    } catch (error: unknown) {
      this.#stop()
      throw error instanceof PersistenceError ? error : new PersistenceError('PERSISTENCE_WRITE_FAILED')
    }
  }
}
