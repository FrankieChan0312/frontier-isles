import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'threads',
    maxWorkers: 3,
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    restoreMocks: true,
  },
})
