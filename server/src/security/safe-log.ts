const LOG_CODES = new Set([
  'PERSISTENCE_RECOVERED', 'PERSISTENCE_QUARANTINED', 'PERSISTENCE_OPEN_FAILED',
  'PERSISTENCE_WRITE_FAILED', 'PERSISTENCE_INVALID_RECORD', 'RATE_LIMITED',
  'REQUEST_REJECTED', 'CONNECTION_REJECTED', 'INTERNAL_ERROR', 'STARTUP_FAILED',
  'SERVER_LISTENING', 'SERVER_LISTEN_FAILED', 'SHUTDOWN_STARTED', 'SHUTDOWN_COMPLETE', 'SHUTDOWN_FAILED',
])

/** Whitelist fields even when an unexpected runtime value reaches the logging boundary. */
export function safeLogRecord(value: unknown): string {
  const descriptors = typeof value === 'object' && value !== null ? Object.getOwnPropertyDescriptors(value) : {}
  const code: unknown = descriptors.code?.value
  const record: Record<string, string | number> = { code: typeof code === 'string' && LOG_CODES.has(code) ? code : 'INTERNAL_ERROR' }
  if (record.code === 'STARTUP_FAILED') record.message = 'Check configuration, private data-volume access and the recovery runbook. Existing data was not reset.'
  if (record.code === 'SHUTDOWN_FAILED') record.message = 'Check the private recovery runbook before restarting.'
  for (const key of ['records', 'count', 'port'] as const) {
    const number: unknown = descriptors[key]?.value
    if (typeof number === 'number' && Number.isSafeInteger(number) && number >= 0
      && (key !== 'port' || (number > 0 && number <= 65_535))) record[key] = number
  }
  return JSON.stringify(record)
}
