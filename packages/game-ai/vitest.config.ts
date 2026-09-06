import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'threads',
    // Full-game invariant simulations are CPU-bound; avoid competing worker heaps on laptops.
    maxWorkers: 1,
    globals: true,
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    restoreMocks: true,
  },
})
