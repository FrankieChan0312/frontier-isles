import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import type { AddressInfo } from 'node:net'

export interface TestServerProcess {
  readonly baseUrl: string
  readonly output: () => string
  readonly crash: () => Promise<void>
  readonly gracefulStop: () => Promise<void>
}
export async function startProductionProcess(database: string, options: { readonly port?: number; readonly staticRoot?: string; readonly mysql?: boolean } = {}): Promise<TestServerProcess> {
  const reservation = createServer()
  await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve))
  const port = options.port ?? (reservation.address() as AddressInfo).port
  await new Promise<void>((resolve, reject) => reservation.close((error) => error === undefined ? resolve() : reject(error)))
  const entry = options.mysql === true ? './mysql-process-entry.ts' : '../src/server.ts'
  const child = spawn(process.execPath, ['--import', 'tsx', fileURLToPath(new URL(entry, import.meta.url))], {
    env: { ...process.env, NODE_ENV: 'test', PORT: String(port), CLIENT_ORIGIN: 'http://127.0.0.1:5173',
      PERSISTENCE_PROVIDER: options.mysql === true ? 'mysql' : 'sqlite',
      PERSISTENCE_FILE: database, RESTART_RECOVERY_GRACE_MS: '120000',
      ...(options.staticRoot === undefined ? {} : { NODE_ENV: 'production', STATIC_ROOT: options.staticRoot,
        CLIENT_ORIGINS: `http://127.0.0.1:${port}`, DEBUG: '', NODE_DEBUG: '', NODE_DEBUG_NATIVE: '' }) },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'], windowsHide: true,
  })
  let output = ''
  const stdout = child.stdout
  const stderr = child.stderr
  if (stdout === null || stderr === null) { child.kill('SIGKILL'); throw new Error('Test process pipes unavailable.') }
  const append = (chunk: Buffer): void => { output = (output + chunk.toString()).slice(-16_384) }
  stdout.on('data', append)
  stderr.on('data', append)
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { finish(new Error('Production test process did not become ready.')) }, 15_000)
      const listen = (): void => {
        if (output.split(/\r?\n/u).some((line) => {
          try {
            const entry: unknown = JSON.parse(line)
            return typeof entry === 'object' && entry !== null && 'code' in entry && entry.code === 'SERVER_LISTENING'
              && 'port' in entry && entry.port === port
          } catch { return false }
        })) finish()
      }
      const exited = (): void => { finish(new Error('Production test process exited during startup.')) }
      const failed = (): void => { finish(new Error('Production test process failed to start.')) }
      function finish(error?: Error): void {
        clearTimeout(timeout)
        stdout?.off('data', listen)
        child.off('exit', exited)
        child.off('error', failed)
        if (error === undefined) resolve(); else reject(error)
      }
      stdout.on('data', listen)
      child.once('exit', exited)
      child.once('error', failed)
    })
  } catch (error: unknown) { await stopTestProcess(child); throw error }
  return { baseUrl: `http://127.0.0.1:${port}`, output: () => output, crash: () => stopTestProcess(child), gracefulStop: async () => {
    if (options.mysql !== true) throw new Error('Signal bridge belongs to the MySQL test entry only.')
    await new Promise<void>((resolveStop, reject) => {
      const timer = setTimeout(() => reject(new Error('Graceful test process stop exceeded its bound.')), 15_000)
      child.once('close', (code) => {
        clearTimeout(timer)
        if (code === 0 && output.includes('SHUTDOWN_COMPLETE')) resolveStop()
        else reject(new Error('Graceful test process stop failed.'))
      })
      child.send('GRACEFUL_STOP')
    })
  } }
}
async function stopTestProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test process did not stop.')), 10_000)
    child.once('close', () => { clearTimeout(timeout); resolve() })
    child.kill('SIGKILL')
  })
}
