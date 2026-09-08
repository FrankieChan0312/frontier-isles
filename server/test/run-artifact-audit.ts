/** Read-only audit of local online Playwright artifacts; never prints matched secret values. */
import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { inflateRawSync } from 'node:zlib'

function textEntries(archive: Buffer): readonly string[] {
  if (archive.length > 128 * 1024 * 1024) throw new Error('Trace exceeds the audit size limit.')
  let end = archive.length - 22
  while (end >= Math.max(0, archive.length - 65_557) && archive.readUInt32LE(end) !== 0x06054b50) end -= 1
  if (end < 0 || archive.readUInt32LE(end) !== 0x06054b50) throw new Error('Invalid trace ZIP directory.')
  const count = archive.readUInt16LE(end + 10)
  if (count > 10_000) throw new Error('Trace entry count exceeds its bound.')
  let cursor = archive.readUInt32LE(end + 16)
  let total = 0
  const entries: string[] = []
  for (let index = 0; index < count; index += 1) {
    if (archive.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid trace ZIP entry.')
    const method = archive.readUInt16LE(cursor + 10)
    const compressed = archive.readUInt32LE(cursor + 20)
    const bytes = archive.readUInt32LE(cursor + 24)
    const nameLength = archive.readUInt16LE(cursor + 28)
    const extra = archive.readUInt16LE(cursor + 30)
    const comment = archive.readUInt16LE(cursor + 32)
    const name = archive.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    const local = archive.readUInt32LE(cursor + 42)
    cursor += 46 + nameLength + extra + comment
    if (bytes > 32 * 1024 * 1024 || (total += bytes) > 512 * 1024 * 1024) throw new Error('Trace expansion exceeds its bound.')
    if (/\.(png|jpe?g|woff2?|webp)$/u.test(name)) continue
    if (archive.readUInt32LE(local) !== 0x04034b50) throw new Error('Invalid trace local entry.')
    const start = local + 30 + archive.readUInt16LE(local + 26) + archive.readUInt16LE(local + 28)
    const data = archive.subarray(start, start + compressed)
    const decoded = method === 8 ? inflateRawSync(data, { maxOutputLength: 32 * 1024 * 1024 }) : method === 0 ? data : undefined
    if (decoded === undefined || decoded.length !== bytes) throw new Error('Unsupported or truncated trace entry.')
    entries.push(decoded.toString('utf8'))
  }
  return entries
}
function files(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(join(root, entry.name)) : [join(root, entry.name)])
}
const counts = { traces: 0, reports: 0, tokens: 0, sessionIdentities: 0, digests: 0, fingerprints: 0, authoritativeRng: 0 }
try {
  const root = resolve(process.argv[2] ?? 'test-results')
  for (const file of files(root).filter((path) => /online|lobby/iu.test(path))) {
    if (!/\.(zip|md|json|txt)$/u.test(file)) continue
    if (statSync(file).size > 128 * 1024 * 1024) throw new Error('Artifact exceeds audit limit.')
    const archive = file.endsWith('.zip')
    const entries = archive ? textEntries(readFileSync(file)) : [readFileSync(file, 'utf8')]
    if (archive) counts.traces += 1; else counts.reports += 1
    for (const text of entries) {
      counts.tokens += [...text.matchAll(/["\\]+resumeToken["\\]+\s*:\s*["\\]+[A-Za-z0-9_-]{43}["\\]+/gu)].length
      counts.sessionIdentities += [...text.matchAll(/["\\]+sessionId["\\]+\s*:\s*["\\]+[A-Za-z0-9_-]{24}["\\]+/gu)].length
      counts.digests += [...text.matchAll(/["\\]+(?:resumeTokenDigest|tokenDigest)["\\]+\s*:\s*["\\]+[A-Za-z0-9_-]{43}["\\]+/gu)].length
      counts.fingerprints += [...text.matchAll(/["\\]+fingerprint["\\]+\s*:\s*["\\]+[a-f0-9]{64}["\\]+/gu)].length
      counts.authoritativeRng += [...text.matchAll(/["\\]+random["\\]+\s*:\s*\{[^}]{0,400}["\\]+drawCount["\\]+\s*:\s*\d+/gu)].length
    }
  }
  const passed = counts.tokens + counts.sessionIdentities + counts.digests + counts.fingerprints + counts.authoritativeRng === 0
  const report = { code: 'ONLINE_ARTIFACT_AUDIT', passed, ...counts }
  mkdirSync('logs', { recursive: true }); writeFileSync('logs/goal-c-12-artifact-audit.json', JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report)); if (!passed) process.exitCode = 1
} catch { console.error('{"code":"ONLINE_ARTIFACT_AUDIT_FAILED"}'); process.exitCode = 1 }
