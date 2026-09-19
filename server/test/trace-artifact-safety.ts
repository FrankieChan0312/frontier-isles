import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib'
import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import { resolve, sep } from 'node:path'

export interface TraceEntry { readonly name: string; readonly data: Buffer }
/** Bounded ZIP reader for local Playwright artifacts; no entry is extracted to a path. */
export function readTraceZip(archive: Buffer): readonly TraceEntry[] {
  if (archive.length < 22 || archive.length > 128 * 1024 * 1024) throw new Error('Invalid trace size.')
  let end = archive.length - 22
  while (end >= Math.max(0, archive.length - 65_557) && archive.readUInt32LE(end) !== 0x06054b50) end -= 1
  if (end < 0 || archive.readUInt32LE(end) !== 0x06054b50) throw new Error('Invalid trace directory.')
  const count = archive.readUInt16LE(end + 10)
  if (count > 10_000) throw new Error('Trace entry count exceeds its bound.')
  let cursor = archive.readUInt32LE(end + 16); let total = 0
  const entries: TraceEntry[] = []
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid trace entry.')
    const method = archive.readUInt16LE(cursor + 10); const compressed = archive.readUInt32LE(cursor + 20)
    const bytes = archive.readUInt32LE(cursor + 24); const nameLength = archive.readUInt16LE(cursor + 28)
    const expectedCrc = archive.readUInt32LE(cursor + 16)
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    const local = archive.readUInt32LE(cursor + 42)
    cursor += 46 + nameLength + archive.readUInt16LE(cursor + 30) + archive.readUInt16LE(cursor + 32)
    if (bytes > 32 * 1024 * 1024 || (total += bytes) > 512 * 1024 * 1024) throw new Error('Trace expansion exceeds its bound.')
    if (archive.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid trace local entry.')
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28)
    const compressedData = archive.subarray(start, start + compressed)
    const data = method === 8 ? inflateRawSync(compressedData, { maxOutputLength: 32 * 1024 * 1024 }) : method === 0 ? compressedData : undefined
    if (data === undefined || data.length !== bytes || crc32(data) !== expectedCrc) throw new Error('Unsupported or corrupt trace entry.')
    entries.push({ name, data })
  }
  return entries
}
export function writeTraceZip(entries: readonly TraceEntry[]): Buffer {
  const local: Buffer[] = []; const central: Buffer[] = []; let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name); const data = deflateRawSync(entry.data); const crc = crc32(entry.data)
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x800, 6); header.writeUInt16LE(8, 8)
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(entry.data.length, 22); header.writeUInt16LE(name.length, 26)
    const directory = Buffer.alloc(46)
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6)
    directory.writeUInt16LE(0x800, 8); directory.writeUInt16LE(8, 10); directory.writeUInt32LE(crc, 16)
    directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(entry.data.length, 24); directory.writeUInt16LE(name.length, 28)
    directory.writeUInt32LE(offset, 42)
    local.push(header, name, data); central.push(directory, name); offset += header.length + name.length + data.length
  }
  const directory = Buffer.concat(central); const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}
export function redactTraceEntries(entries: readonly TraceEntry[]): { readonly entries: readonly TraceEntry[]; readonly secrets: number } {
  const secrets = new Set<string>()
  for (const entry of entries) {
    const text = entry.data.toString('utf8')
    for (const match of text.matchAll(/["\\]+(?:resumeToken|sessionId)["\\]+\s*:\s*["\\]+([A-Za-z0-9_-]{24}|[A-Za-z0-9_-]{43})["\\]+/gu)) {
      if (match[1] !== undefined) secrets.add(match[1])
    }
  }
  return { secrets: secrets.size, entries: entries.map((entry) => {
    let text = entry.data.toString('utf8')
    if (!Buffer.from(text).equals(entry.data)) return entry
    for (const secret of secrets) text = text.replaceAll(secret, '[REDACTED_CREDENTIAL]')
    return { name: entry.name, data: Buffer.from(text) }
  }) }
}
export function redactTraceFile(filename: string): number {
  const path = resolve(filename); const workspace = resolve('.') + sep
  if (!path.startsWith(workspace) || !path.endsWith('.zip')) throw new Error('Trace redaction must remain inside the workspace.')
  const before = readTraceZip(readFileSync(path))
  const redacted = redactTraceEntries(before)
  if (redacted.secrets === 0) return 0
  const output = writeTraceZip(redacted.entries)
  const checked = readTraceZip(output)
  if (checked.length !== before.length || checked.some((entry, index) => entry.name !== before[index]?.name
    || !entry.data.equals(redacted.entries[index]?.data ?? Buffer.alloc(0)))) throw new Error('Trace redaction verification failed.')
  writeFileSync(path + '.redacted.tmp', output, { mode: 0o600 }); renameSync(path + '.redacted.tmp', path)
  return redacted.secrets
}
