import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { temporaryPersistenceDirectory } from './persistence-test-helpers.js'

const name = `frontier-boot-check-${randomUUID()}`
const directory = temporaryPersistenceDirectory()
let owned = false
let passed = false
async function docker(args: readonly string[]): Promise<string> {
  return new Promise((done, reject) => {
    const child = spawn('docker', [...args], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let output = ''
    const timer = setTimeout(() => { child.kill(); reject(new Error('Boot verifier timed out.')) }, 600_000)
    const append = (chunk: Buffer): void => { output = (output + chunk.toString()).slice(-2_000_000) }
    child.stdout.on('data', append); child.stderr.on('data', append)
    child.once('error', () => { clearTimeout(timer); reject(new Error('Boot verifier unavailable.')) })
    child.once('close', (code) => {
      clearTimeout(timer)
      if (args[0] === 'build') writeFileSync('server/logs/preflight-boot-image-build.log', output)
      if (code === 0) done(output.trim()); else reject(new Error('Linux boot configuration validation failed.'))
    })
  })
}
try {
  const local = /^(?:unix:\/\/\/|npipe:\/\/\/\/\.\/pipe\/)/u
  if (process.env.DOCKER_HOST) assert.match(process.env.DOCKER_HOST, local)
  const context = await docker(['context', 'show'])
  assert.match(await docker(['context', 'inspect', context, '--format', '{{.Endpoints.docker.Host}}']), local)
  const iid = join(directory.path, 'image-id')
  await docker(['build', '-f', 'server/test/Dockerfile.boot-check', '--iidfile', iid, '.'])
  const image = readFileSync(iid, 'utf8').trim()
  assert.match(image, /^sha256:[a-f0-9]{64}$/u)
  await docker(['create', '--name', name, '--label', `frontier-isles.boot-check=${name}`, '--network', 'none', '--read-only',
    '--cap-drop=ALL', '--security-opt=no-new-privileges', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', image])
  owned = true
  const output = await docker(['start', '--attach', name])
  assert.equal(await docker(['inspect', '--format', '{{.State.ExitCode}}', name]), '0')
  writeFileSync('server/logs/preflight-systemd-verify.log', output)
  passed = true
} catch { process.exitCode = 1; console.error('LOCAL_BOOT_CONFIG_FAILED') }
finally {
  if (owned) {
    try {
      assert.equal(await docker(['inspect', '--format', '{{ index .Config.Labels "frontier-isles.boot-check" }}', name]), name)
      await docker(['rm', '--force', name]); owned = false
    } catch { passed = false; process.exitCode = 1; console.error('LOCAL_BOOT_CONFIG_CLEANUP_FAILED') }
  }
  directory.remove()
  const summary = { code: 'LOCAL_BOOT_CONFIG', passed, ownedContainerRemoved: !owned,
    systemdSyntaxOnly: true, dockerDependencyStub: true, actualRebootVerified: false, cloudAccessed: false }
  writeFileSync('server/logs/preflight-boot-summary.json', JSON.stringify(summary) + '\n')
  console.log(JSON.stringify(summary))
}
