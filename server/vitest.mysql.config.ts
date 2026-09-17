import { defineConfig } from 'vitest/config'

export default defineConfig({ test: {
  environment: 'node', include: ['test/*.mysql.ts'], maxWorkers: 1,
  fileParallelism: false, testTimeout: 30_000, hookTimeout: 30_000,
} })
