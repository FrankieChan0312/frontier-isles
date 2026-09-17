import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { parseServerConfig } from '../src/config.js'
import { allowedRealtimeOrigin } from '../src/create-realtime-server.js'

const root = new URL('../../', import.meta.url)
const vercel = z.object({ framework: z.string(), buildCommand: z.string(), outputDirectory: z.string(),
  headers: z.array(z.object({ source: z.string(), headers: z.array(z.object({ key: z.string(), value: z.string() })) })) })
  .parse(JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8')))
describe('declared split-origin production deployment', () => {
  it('builds Vite with the exact HTTPS realtime origin and no frontend secret', () => {
    expect(vercel.framework).toBe('vite')
    expect(vercel.outputDirectory).toBe('dist')
    expect(vercel.buildCommand).toBe('VITE_REALTIME_URL=https://game-api.frankiesgroceryhk.shop npm run build')
    expect(vercel.buildCommand).not.toMatch(/PASSWORD|TOKEN|SECRET|MYSQL|AWS/u)
  })
  it('protects all frontend responses and admits only the named HTTPS/WSS connections', () => {
    expect(vercel.headers).toHaveLength(1)
    const entry = vercel.headers[0]
    expect(entry?.source).toBe('/(.*)')
    const headers = new Map(entry?.headers.map((header) => [header.key.toLowerCase(), header.value]))
    expect(headers.get('x-content-type-options')).toBe('nosniff')
    expect(headers.get('referrer-policy')).toBe('no-referrer')
    expect(headers.get('x-frame-options')).toBe('DENY')
    const csp = headers.get('content-security-policy') ?? ''
    expect(csp.split(';').map((value) => value.trim())).toContain("connect-src 'self' https://game-api.frankiesgroceryhk.shop wss://game-api.frankiesgroceryhk.shop")
    for (const directive of ["script-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'none'"]) expect(csp).toContain(directive)
    expect(csp).not.toMatch(/\*|unsafe-eval|vercel\.app/u)
  })
  it('keeps backend Origin admission exact, excluding previews and suffix attacks', () => {
    const config = parseServerConfig({ NODE_ENV: 'production', CLIENT_ORIGINS: 'https://play.frankiesgroceryhk.shop',
      STATIC_ROOT: resolve('dist'), PERSISTENCE_FILE: resolve('data/private.sqlite') })
    expect(allowedRealtimeOrigin('https://play.frankiesgroceryhk.shop', config)).toBe(true)
    for (const origin of [undefined, 'null', 'https://preview.vercel.app', 'https://play.frankiesgroceryhk.shop.evil.test', 'http://play.frankiesgroceryhk.shop']) {
      expect(allowedRealtimeOrigin(origin, config)).toBe(false)
    }
  })
})
