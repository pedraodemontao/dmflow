import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Resolve o alias `@/` lendo o tsconfig — nativo, sem plugin.
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
