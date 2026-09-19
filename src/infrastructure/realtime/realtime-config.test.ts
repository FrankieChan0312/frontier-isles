import {
  DEFAULT_REALTIME_URL,
  parseRealtimeUrl,
  readRealtimeClientConfig,
} from './realtime-config.ts'

describe('realtime client configuration', () => {
  it('accepts the exact split-origin production target without changing same-origin support', () => {
    expect(readRealtimeClientConfig('https://game-api.frankiesgroceryhk.shop').url).toBe('https://game-api.frankiesgroceryhk.shop')
  })
  it('resolves the production same-origin setting from the current browser origin', () => {
    expect(readRealtimeClientConfig('same-origin', 'https://isles.example.test')).toEqual({ url: 'https://isles.example.test' })
    expect(() => readRealtimeClientConfig('same-origin', 'null')).toThrow(/VITE_REALTIME_URL/u)
  })
  it('accepts HTTP(S) origins and returns their canonical origin', () => {
    expect(parseRealtimeUrl('https://rooms.example.test:8443')).toBe(
      'https://rooms.example.test:8443',
    )
    expect(readRealtimeClientConfig('http://localhost:3001')).toEqual({
      url: 'http://localhost:3001',
    })
    expect(readRealtimeClientConfig(DEFAULT_REALTIME_URL).url).toBe(DEFAULT_REALTIME_URL)
  })

  it.each([
    '',
    'rooms.example.test',
    'ftp://rooms.example.test',
    'https://user:secret@rooms.example.test',
    'https://rooms.example.test/socket',
    'https://rooms.example.test?token=secret',
  ])('rejects unsafe or non-origin configuration %j', (value) => {
    expect(() => parseRealtimeUrl(value)).toThrow(/VITE_REALTIME_URL/u)
  })
})
