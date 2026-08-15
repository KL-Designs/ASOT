import { defineConfig, devices } from '@playwright/test'
import { BASE_URL, MONGO_URI, MONGO_DB, WEB_PORT, USERS, BACKUPS_STORAGE_ROOT } from './tests/constants'

/**
 * Ports and Mongo/base-URL come from tests/constants.ts, not hardcoded here —
 * see that file for why they're fixed rather than auto-allocated (webServer
 * starts before globalSetup, so a dynamically-allocated Mongo URI wouldn't
 * exist yet when this file builds webServer.env).
 *
 * webServer runs through the existing `npm run dev` script (not `next dev`
 * directly) so it still goes through dotenv-cli the same way local dev does —
 * that's safe here because dotenv only fills in *unset* vars, so everything
 * this config injects below still wins over whatever's in a real `.env`.
 */
export default defineConfig({
    testDir: './tests',
    fullyParallel: false,
    workers: 1,
    // A single retry absorbs the dev-server self-restart flake documented in
    // tests/README.md ("Known failure mode") — under memory pressure `next
    // dev` briefly restarts mid-run and whichever request lands in that
    // window gets ECONNREFUSED/ECONNRESET, a different test each time, not a
    // real regression. A genuinely broken test still fails after 2 tries.
    retries: process.env.CI ? 2 : 1,
    timeout: 120_000,
    reporter: 'html',
    use: {
        baseURL: BASE_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    globalSetup: './tests/global-setup.ts',
    globalTeardown: './tests/global-teardown.ts',
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        // No mobile specs exist yet — this project is a no-op until one shows
        // up (see tests/README.md's merge note re: a public-pages suite
        // written elsewhere that expects this project name/testMatch).
        { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: '*.mobile.spec.ts' },
    ],
    webServer: {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 300_000,
        env: {
            NODE_ENV: 'development',
            PORT: String(WEB_PORT),
            MONGO_URI,
            MONGO_DB,
            // Deliberately fake/empty — no test should ever reach a real
            // Discord guild or bot. checkDiscord()-style calls short-circuit
            // to unreachable/false with an empty token; fetchMe() never
            // touches Discord at all (see tests/README.md).
            DISCORD_GUILD_ID: 'e2e-guild',
            DISCORD_BOT_TOKEN: '',
            NEXT_PUBLIC_BASEURL: BASE_URL,
            NEXT_PUBLIC_COLLAB_WS_URL: BASE_URL,
            // The `override` persona's ID — see tests/constants.ts. Holds no
            // Discord roles at all, so this is the only reason it can reach
            // anything: a clean probe for whether OVERRIDE is actually wired up.
            OVERRIDE: USERS.override.id,
            NODE_OPTIONS: '--max-old-space-size=4096',
            // Points every restic repo / status file at an isolated scratch
            // dir instead of the real storage/ tree — see lib/backups.ts and
            // tests/global-setup.ts / tests/global-teardown.ts.
            BACKUPS_STORAGE_ROOT,
            // Fixed test-only value so the suite never depends on whatever
            // (if anything) the developer's real .env has set — same spirit
            // as DISCORD_BOT_TOKEN above.
            RESTIC_PASSWORD: 'e2e-test-only-password',
        },
    },
})
