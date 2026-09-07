import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'

export interface TestServerProcess {
  readonly baseUrl: string
  readonly output: () => string
  readonly crash: () => Promise<void>
}
export async function startProductionProcess(database: string): Promise<TestServerProcess> {
  const reservation = createServer()
  await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve))
  const port = (reservation.address() as AddressInfo).port
  await new Promise<void>((resolve, reject) => reservation.close((error) => error === undefined ? resolve() : reject(error)))
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../src/server.ts', import.meta.url))], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), CLIENT_ORIGIN: 'http://127.0.0.1:5173',
      PERSISTENCE_FILE: database, RESTART_RECOVERY_GRACE_MS: '120000' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  })
  let output = ''
  const append = (chunk: Buffer): void => { output = (output + chunk.toString()).slice(-16_384) }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { finish(new Error('Production test process did not become ready.')) }, 15_000)
      const listen = (): void => { if (output.includes(`listening on port ${port}`)) finish() }
      const exited = (): void => { finish(new Error('Production test process exited during startup.')) }
      const failed = (): void => { finish(new Error('Production test process failed to start.')) }
      function finish(error?: Error): void {
        clearTimeout(timeout)
        child.stdout.off('data', listen)
        child.off('exit', exited)
        child.off('error', failed)
        if (error === undefined) resolve(); else reject(error)
      }
      child.stdout.on('data', listen)
      child.once('exit', exited)
      child.once('error', failed)
    })
  } catch (error: unknown) { await stopTestProcess(child); throw error }
  return { baseUrl: `http://127.0.0.1:${port}`, output: () => output, crash: () => stopTestProcess(child) }
}
async function stopTestProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test process did not stop.')), 10_000)
    child.once('close', () => { clearTimeout(timeout); resolve() })
    child.kill('SIGKILL')
  })
}
