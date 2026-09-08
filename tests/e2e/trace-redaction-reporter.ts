import type { Reporter, TestCase, TestResult, FullResult } from '@playwright/test/reporter'
import { redactTraceFile } from '../../server/test/trace-artifact-safety.ts'

/** Keeps pass/fail evidence and all screenshots/steps; removes only bearer identities from retained traces. */
export default class TraceRedactionReporter implements Reporter {
  readonly #traces = new Set<string>()
  public onTestEnd(_test: TestCase, result: TestResult): void {
    for (const attachment of result.attachments) if (attachment.contentType === 'application/zip' && attachment.path !== undefined) this.#traces.add(attachment.path)
  }
  public async onEnd(): Promise<{ readonly status?: FullResult['status'] }> {
    let secrets = 0
    try {
      for (const path of this.#traces) secrets += redactTraceFile(path)
      console.log(JSON.stringify({ code: 'TRACE_CREDENTIAL_REDACTION', traces: this.#traces.size, redactedIdentities: secrets }))
      return {}
    } catch { console.error('{"code":"TRACE_CREDENTIAL_REDACTION_FAILED"}'); return { status: 'failed' } }
  }
}
