import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Unit tests for lib/ only. The Playwright E2E suite lives in tests/ and is
// run separately via `npm run test:e2e` — the include pattern below keeps the
// two runners from ever picking up each other's files.
export default defineConfig({
    test: {
        environment: 'node',
        include: ['lib/**/*.test.ts'],
        // mongodb-memory-server may download and always boots a real mongod.
        testTimeout: 60_000,
        hookTimeout: 120_000,
    },
    resolve: {
        // Mirrors tsconfig.json's `@/*` -> project root path alias.
        alias: { '@': resolve(__dirname, '.') },
    },
})
