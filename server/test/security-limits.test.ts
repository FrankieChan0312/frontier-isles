import { describe, expect, it } from 'vitest'
import { sessionIdSchema } from '@frontier-isles/realtime-contracts'
import { isBoundedJson, MAX_PACKET_BYTES, MAX_CONNECTIONS } from '../src/security/network-limits.js'
import { RequestLimiter } from '../src/security/request-limiter.js'
import { safeLogRecord } from '../src/security/safe-log.js'

describe('bounded untrusted input and logs', () => {
  it('accepts ordinary serializable command data', () => {
    expect(isBoundedJson({ command: { type: 'END_TURN' }, expectedStateVersion: 20, flags: [true, null] })).toBe(true)
  })
  it.each(['__proto__', 'constructor', 'prototype'])('rejects pollution key %s at any depth', (key) => {
    expect(isBoundedJson(JSON.parse(`{"command":{"${key}":{"polluted":true}}}`))).toBe(false)
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
  })
  it('rejects excessive nesting, breadth, strings and escaped wire bytes before schema parsing', () => {
    let nested: unknown = 0
    for (let depth = 0; depth < 14; depth += 1) nested = { value: nested }
    expect(isBoundedJson(nested)).toBe(false)
    expect(isBoundedJson(Array.from({ length: 513 }, () => 0))).toBe(false)
    expect(isBoundedJson('x'.repeat(MAX_PACKET_BYTES))).toBe(false)
    expect(isBoundedJson('\u0000'.repeat(3000))).toBe(false)
  })
  it('rejects cycles, non-finite values, classes and accessors without invoking getters', () => {
    const cycle: Record<string, unknown> = {}
    cycle.self = cycle
    let read = false
    const accessor = Object.defineProperty({}, 'value', { enumerable: true, get: () => { read = true; return 'secret' } })
    for (const value of [cycle, Infinity, NaN, new Date(), new Map(), accessor, { value: undefined }]) expect(isBoundedJson(value)).toBe(false)
    expect(read).toBe(false)
  })
  it('writes only approved codes and bounded numeric observations, never raw diagnostic fields', () => {
    const secret = 'SYNTHETIC_PRIVATE_DIAGNOSTIC'
    const logged = safeLogRecord({ code: 'PERSISTENCE_QUARANTINED', records: 2, resumeToken: secret,
      tokenDigest: secret, state: { resources: secret }, path: secret, stack: secret, cause: secret, count: secret })
    expect(logged).toBe('{"code":"PERSISTENCE_QUARANTINED","records":2}')
    expect(logged.includes(secret)).toBe(false)
    expect(safeLogRecord({ code: secret, count: Infinity, port: -1 })).toBe('{"code":"INTERNAL_ERROR"}')
  })
})

describe('single-process request budgets', () => {
  it.each([['room:create', 6], ['room:join', 32], ['session:resume', 32]] as const)('bounds %s independently for an anonymous transport', (event, permitted) => {
    let now = 0
    const limiter = new RequestLimiter({ now: () => now, hasSession: () => false })
    expect(limiter.attachTransport('first')).toBe(true)
    for (let count = 0; count < permitted; count += 1) expect(limiter.allow('first', undefined, event)).toBe(true)
    expect(limiter.allow('first', undefined, event)).toBe(false)
    now = 60_000
    expect(limiter.allow('first', undefined, event)).toBe(true)
    limiter.dispose()
  })
  it('retains a Human command budget across transport replacement and refills deterministically', () => {
    let now = 0
    const session = sessionIdSchema.parse('session_alpha_north_0001')
    const limiter = new RequestLimiter({ now: () => now, hasSession: (id) => id === session })
    limiter.attachTransport('original')
    for (let count = 0; count < 256; count += 1) expect(limiter.allow('original', session, 'game:command')).toBe(true)
    limiter.forgetTransport('original')
    limiter.attachTransport('replacement')
    expect(limiter.allow('replacement', session, 'game:command')).toBe(false)
    now = 10
    expect(limiter.allow('replacement', session, 'game:command')).toBe(true)
    now = 0
    expect(limiter.allow('replacement', session, 'game:command')).toBe(false)
    limiter.dispose()
  })
  it('does not allocate session state from fabricated identities and releases expired/live transport state', () => {
    let valid = true
    const session = sessionIdSchema.parse('session_alpha_north_0001')
    const bogus = sessionIdSchema.parse('session_alpha_forged_001')
    const limiter = new RequestLimiter({ now: () => 0, hasSession: (id) => valid && id === session })
    limiter.attachTransport('connection')
    limiter.allow('connection', bogus, 'game:command')
    expect(limiter.resources()).toEqual({ transports: 1, sessions: 0 })
    limiter.allow('connection', session, 'game:command')
    expect(limiter.resources().sessions).toBe(1)
    valid = false
    limiter.forgetTransport('connection')
    expect(limiter.resources()).toEqual({ transports: 0, sessions: 0 })
    limiter.dispose()
    expect(limiter.admitConnection()).toBe(false)
  })
  it('bounds connection admission, total transport storage and cross-transport creation bursts', () => {
    const limiter = new RequestLimiter({ now: () => 0, hasSession: () => false })
    for (let count = 0; count < 128; count += 1) expect(limiter.admitConnection()).toBe(true)
    expect(limiter.admitConnection()).toBe(false)
    for (let count = 0; count < MAX_CONNECTIONS; count += 1) expect(limiter.attachTransport(`transport-${count}`)).toBe(true)
    expect(limiter.attachTransport('overflow')).toBe(false)
    for (let count = 0; count < 128; count += 1) expect(limiter.allow(`transport-${count}`, undefined, 'room:create')).toBe(true)
    expect(limiter.allow('transport-128', undefined, 'room:create')).toBe(false)
    limiter.dispose()
    expect(limiter.resources()).toEqual({ transports: 0, sessions: 0 })
  })
})
