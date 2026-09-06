import {
  REALTIME_PROTOCOL_VERSION,
  sessionCredentialSchema,
} from '@frontier-isles/realtime-contracts'
import {
  LOBBY_CREDENTIAL_STORAGE_KEY,
  SessionStorageLobbyCredentialStore,
} from './lobby-credential-store.ts'

const CREDENTIAL = sessionCredentialSchema.parse({
  protocolVersion: REALTIME_PROTOCOL_VERSION,
  sessionId: 'session_000000001',
  resumeToken: 'A'.repeat(43),
  roomCode: 'ABC234',
  seatId: 'EAST',
})

describe('SessionStorageLobbyCredentialStore', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  it('round-trips the private credential in sessionStorage only', () => {
    const store = new SessionStorageLobbyCredentialStore(sessionStorage)
    store.save(CREDENTIAL)

    expect(store.load()).toEqual(CREDENTIAL)
    expect(sessionStorage.getItem(LOBBY_CREDENTIAL_STORAGE_KEY)).toContain(CREDENTIAL.resumeToken)
    expect(localStorage.getItem(LOBBY_CREDENTIAL_STORAGE_KEY)).toBeNull()
  })

  it('clears malformed persisted data without exposing it', () => {
    sessionStorage.setItem(LOBBY_CREDENTIAL_STORAGE_KEY, '{"resumeToken":"secret"}')
    const store = new SessionStorageLobbyCredentialStore(sessionStorage)

    expect(store.load()).toBeNull()
    expect(sessionStorage.getItem(LOBBY_CREDENTIAL_STORAGE_KEY)).toBeNull()
  })
})
