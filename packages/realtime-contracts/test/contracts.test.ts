import { describe, expect, it } from 'vitest'
import {
  createRealtimeHealthResponse,
  REALTIME_PROTOCOL_VERSION,
  REALTIME_SERVICE_NAME,
} from '../src/index.js'

describe('realtime foundation contracts', () => {
  it('keeps the protocol and service identities stable', () => {
    expect(REALTIME_PROTOCOL_VERSION).toBe('V2_REALTIME_PROTOCOL_V1')
    expect(REALTIME_SERVICE_NAME).toBe('frontier-isles-realtime')
  })

  it('creates the exact JSON-compatible health response', () => {
    const response = createRealtimeHealthResponse()

    expect(response).toEqual({
      status: 'ok',
      service: 'frontier-isles-realtime',
      protocolVersion: 'V2_REALTIME_PROTOCOL_V1',
    })
    expect(JSON.parse(JSON.stringify(response))).toEqual(response)
  })
})
