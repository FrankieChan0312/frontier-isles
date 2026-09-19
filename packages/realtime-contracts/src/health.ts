import {
  REALTIME_PROTOCOL_VERSION,
  type RealtimeProtocolVersion,
} from './protocol-version.js'

export const REALTIME_SERVICE_NAME = 'frontier-isles-realtime' as const

export interface RealtimeHealthResponse {
  readonly status: 'ok'
  readonly service: typeof REALTIME_SERVICE_NAME
  readonly protocolVersion: RealtimeProtocolVersion
}
export function createRealtimeHealthResponse(): RealtimeHealthResponse {
  return {
    status: 'ok',
    service: REALTIME_SERVICE_NAME,
    protocolVersion: REALTIME_PROTOCOL_VERSION,
  }
}
