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
        // Run test files one at a time. `lib/backups.test.ts` and
        // `lib/backups.roundtrip.test.ts` each boot their own real mongod, and
        // racing them makes the second die on startup with an fassert failure —
        // which surfaces as two failed suites and eight silently skipped tests,
        // not as anything that names mongod. It reproduced on every parallel run
        // and never on a serial one. The whole suite is 15 files, so the cost of
        // serialising is seconds; the cost of an intermittently red suite that
        // blames the wrong thing is much higher.
        fileParallelism: false,
    },
    resolve: {
        // Mirrors tsconfig.json's path aliases. `@asot/lib` is the monorepo-root
        // shared domain model — anything under lib/military reaches it through
        // ranks.ts, so a test that imports one of those fails to resolve without it.
        alias: {
            '@asot/lib': resolve(__dirname, '../../lib/index.ts'),
            '@': resolve(__dirname, '.'),
        },
    },
})
