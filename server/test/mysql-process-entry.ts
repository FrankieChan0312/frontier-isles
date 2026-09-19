// Test-only platform-neutral signal delivery. The production entry point remains unmodified.
// Windows child.kill(SIGTERM) force-terminates; IPC here emits the same Node signal event.
// test:mysql builds first. Exercise the deployed JavaScript entry and worker path, not tsx's worker path.
await import(new URL('../dist/src/server.js', import.meta.url).href)
process.once('message', (message: unknown) => {
  if (message === 'GRACEFUL_STOP') { process.disconnect(); process.emit('SIGTERM') }
})
