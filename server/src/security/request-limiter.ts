import { performance } from 'node:perf_hooks'
import type { SessionId } from '@frontier-isles/realtime-contracts'
import { MAX_CONNECTIONS, MAX_ROOMS } from './network-limits.js'

interface Bucket { tokens: number; updated: number }
interface TransportBudget { readonly all: Bucket; readonly create: Bucket; readonly join: Bucket; readonly resume: Bucket }
interface SessionBudget { readonly all: Bucket; readonly commands: Bucket }
export interface LimiterDiagnostic { readonly code: 'RATE_LIMITED'; readonly count: number }
export interface RequestLimiterOptions {
  readonly now?: () => number
  readonly hasSession: (sessionId: SessionId) => boolean
  readonly onDiagnostic?: (diagnostic: LimiterDiagnostic) => void
}
export interface LimiterResources { readonly transports: number; readonly sessions: number }

/** Fixed alpha abuse ceilings, independent from per-GameSession mutation ordering. */
export class RequestLimiter {
  readonly #now: () => number
  readonly #hasSession: (sessionId: SessionId) => boolean
  readonly #diagnostic: (diagnostic: LimiterDiagnostic) => void
  readonly #transports = new Map<string, TransportBudget>()
  readonly #sessions = new Map<SessionId, SessionBudget>()
  readonly #all: Bucket
  readonly #connect: Bucket
  readonly #create: Bucket
  readonly #join: Bucket
  readonly #resume: Bucket
  #pruned = 0
  #reported = 0
  #rejections = 0
  #disposed = false

  public constructor(options: RequestLimiterOptions) {
    this.#now = options.now ?? (() => performance.now())
    this.#hasSession = options.hasSession
    this.#diagnostic = options.onDiagnostic ?? (() => {})
    this.#all = this.#bucket(4096)
    this.#connect = this.#bucket(128)
    this.#create = this.#bucket(128)
    this.#join = this.#bucket(256)
    this.#resume = this.#bucket(256)
  }
  #bucket(tokens: number): Bucket { return { tokens, updated: this.#now() } }
  #take(bucket: Bucket, capacity: number, refillPerSecond: number): boolean {
    const now = this.#now()
    bucket.tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.updated) * refillPerSecond / 1000)
    bucket.updated = Math.max(bucket.updated, now)
    if (bucket.tokens < 1) return false
    bucket.tokens -= 1
    return true
  }
  #refused(): false {
    this.#rejections = Math.min(Number.MAX_SAFE_INTEGER, this.#rejections + 1)
    const now = this.#now()
    if (now - this.#reported >= 1000) {
      this.#diagnostic({ code: 'RATE_LIMITED', count: this.#rejections })
      this.#rejections = 0
      this.#reported = now
    }
    return false
  }
  public admitConnection(): boolean {
    return !this.#disposed && this.#take(this.#connect, 128, 8) || this.#refused()
  }
  public attachTransport(id: string): boolean {
    if (this.#disposed || this.#transports.size >= MAX_CONNECTIONS || this.#transports.has(id)) return this.#refused()
    this.#transports.set(id, { all: this.#bucket(512), create: this.#bucket(6), join: this.#bucket(32), resume: this.#bucket(32) })
    return true
  }
  public forgetTransport(id: string): void { this.#transports.delete(id) }
  #prune(force = false): void {
    const now = this.#now()
    if (!force && now - this.#pruned < 1000) return
    this.#pruned = now
    for (const id of this.#sessions.keys()) if (!this.#hasSession(id)) this.#sessions.delete(id)
  }
  public allow(id: string, sessionId: SessionId | undefined, event: string): boolean {
    if (this.#disposed) return this.#refused()
    this.#prune()
    const transport = this.#transports.get(id)
    if (transport === undefined || !this.#take(this.#all, 4096, 2000) || !this.#take(transport.all, 512, 200)) return this.#refused()
    if (event === 'room:create' && (!this.#take(transport.create, 6, 0.1) || !this.#take(this.#create, 128, 2))) return this.#refused()
    if (event === 'room:join' && (!this.#take(transport.join, 32, 32 / 60) || !this.#take(this.#join, 256, 4))) return this.#refused()
    if (event === 'session:resume' && (!this.#take(transport.resume, 32, 32 / 60) || !this.#take(this.#resume, 256, 4))) return this.#refused()
    // Only the server's attached, still-valid identity may allocate a session bucket.
    if (sessionId !== undefined && this.#hasSession(sessionId)) {
      let session = this.#sessions.get(sessionId)
      if (session === undefined) {
        if (this.#sessions.size >= MAX_ROOMS * 4) this.#prune(true)
        if (this.#sessions.size >= MAX_ROOMS * 4) return this.#refused()
        session = { all: this.#bucket(512), commands: this.#bucket(256) }
        this.#sessions.set(sessionId, session)
      }
      if (!this.#take(session.all, 512, 200)
        || (event === 'game:command' && !this.#take(session.commands, 256, 100))) return this.#refused()
    }
    return true
  }
  public resources(): LimiterResources { this.#prune(true); return { transports: this.#transports.size, sessions: this.#sessions.size } }
  public dispose(): void { this.#disposed = true; this.#transports.clear(); this.#sessions.clear() }
}
