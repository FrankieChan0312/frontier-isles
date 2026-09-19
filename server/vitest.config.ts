import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Persistence/restart suites also spawn real servers. Bound competing test processes;
    // the explicit socket/queue concurrency scenarios still run without changed deadlines.
    maxWorkers: 2,
  },
})
