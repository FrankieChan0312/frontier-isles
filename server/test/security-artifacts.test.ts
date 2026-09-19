import { expect, it } from 'vitest'
import { readTraceZip, writeTraceZip, redactTraceEntries } from './trace-artifact-safety.js'

it('preserves trace steps, failure evidence and binary screenshots while redacting plain and escaped bearer identities', () => {
  const token = 'x'.repeat(43); const session = 's'.repeat(24)
  const event = { type: 'after', error: { message: 'Original failure retained' }, payload: JSON.stringify({ resumeToken: token, sessionId: session }) }
  const entries = [{ name: 'test.trace', data: Buffer.from(JSON.stringify(event) + '\n') },
    { name: 'resources/network.jsonl', data: Buffer.from(JSON.stringify({ resumeToken: token, sessionId: session })) },
    { name: 'resources/screenshot.png', data: Buffer.from([137, 80, 78, 71, 0, 255, 128]) }]
  expect(readTraceZip(writeTraceZip(entries))).toEqual(entries)
  const redacted = redactTraceEntries(entries)
  expect(redacted.secrets).toBe(2)
  expect(redacted.entries[0]?.data.toString()).toContain('Original failure retained')
  expect(redacted.entries[0]?.data.toString().includes(token)).toBe(false)
  expect(redacted.entries[1]?.data.toString().includes(session)).toBe(false)
  expect(redacted.entries[2]).toEqual(entries[2])
  expect(readTraceZip(writeTraceZip(redacted.entries))).toEqual(redacted.entries)
})
it('rejects truncated and checksum-corrupt trace input without rewriting it', () => {
  expect(() => readTraceZip(Buffer.from('bad'))).toThrow()
  const zip = writeTraceZip([{ name: 'entry', data: Buffer.from('Original failure') }])
  const corrupted = Buffer.from(zip); corrupted[14] = 1
  // Central checksum is authoritative for streaming ZIP files.
  const offset = corrupted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  corrupted.writeUInt32LE(0, offset + 16)
  expect(() => readTraceZip(corrupted)).toThrow('corrupt')
})
