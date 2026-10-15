import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.ts',
      'apps/*/test/**/*.test.tsx',
    ],
    reporters: 'default',
  },
})
