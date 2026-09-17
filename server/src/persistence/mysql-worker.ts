import { workerData, type MessagePort } from 'node:worker_threads'
import type { MysqlConfig } from './mysql-config.js'
import { MysqlStore } from './mysql-store.js'
import { PersistenceError, type PersistenceDiagnostic } from './multiplayer-repository.js'
import type { MysqlWorkerRequest } from './mysql-worker-protocol.js'

const data = workerData as { readonly config: MysqlConfig; readonly port: MessagePort; readonly signal: SharedArrayBuffer }
const signal = new Int32Array(data.signal)
let diagnostics: PersistenceDiagnostic[] = []
function respond(value: unknown): void {
  data.port.postMessage({ value, diagnostics })
  diagnostics = []
  Atomics.store(signal, 0, 1)
  Atomics.notify(signal, 0)
}
function failure(error: unknown): void {
  respond({ ok: false, code: error instanceof PersistenceError ? error.code : 'PERSISTENCE_WRITE_FAILED' })
}
try {
  const store = await MysqlStore.open(data.config, { onDiagnostic: (diagnostic) => diagnostics.push(diagnostic) })
  respond({ ok: true })
  // The synchronous caller admits exactly one request at a time.
  data.port.on('message', (request: MysqlWorkerRequest) => {
    void (async () => {
      switch (request.operation) {
        case 'load': respond({ ok: true, records: await store.load() }); break
        case 'save': await store.save(request.record); respond({ ok: true }); break
        case 'remove': await store.remove(request.roomCode); respond({ ok: true }); break
        case 'flush': store.flush(); respond({ ok: true }); break
        case 'close': await store.close(); respond({ ok: true }); data.port.close(); break
      }
    })().catch(failure)
  })
} catch (error: unknown) { failure(error); data.port.close() }
