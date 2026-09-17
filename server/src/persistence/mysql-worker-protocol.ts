import type { MultiplayerRecord } from './multiplayer-record.js'

/** Private in-process messages; never a network or browser contract. */
export type MysqlWorkerRequest =
  | { readonly operation: 'load' | 'flush' | 'close' }
  | { readonly operation: 'save'; readonly record: MultiplayerRecord }
  | { readonly operation: 'remove'; readonly roomCode: MultiplayerRecord['roomCode'] }
