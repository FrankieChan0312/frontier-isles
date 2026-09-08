import { readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { redactTraceFile } from './trace-artifact-safety.js'

function traces(root: string): readonly string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? traces(join(root, entry.name))
    : entry.name.endsWith('.zip') ? [join(root, entry.name)] : [])
}
try {
  const paths = traces(resolve('test-results')); let secrets = 0
  for (const path of paths) secrets += redactTraceFile(path)
  console.log(JSON.stringify({ code: 'TRACE_CREDENTIAL_REDACTION', traces: paths.length, redactedIdentities: secrets }))
} catch { console.error('{"code":"TRACE_CREDENTIAL_REDACTION_FAILED"}'); process.exitCode = 1 }
