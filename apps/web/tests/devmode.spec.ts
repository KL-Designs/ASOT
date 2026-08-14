/**
 * Developer mode — the Discord and TeamSpeak outbound-suppression switches.
 *
 * Both are stored as `site_settings` documents (`discordDevMode` /
 * `teamspeakDevMode`) and gate every outbound mutation the app would
 * otherwise make against a live service. Getting these wrong in production
 * means the app DMs real members during testing, so the gate is worth pinning
 * precisely: J4 only, persisted, and immediately visible to the status route.
 */
import { test, expect } from './fixtures/asot'
import { withDb } from './seed'

const ENDPOINTS = [
    { name: 'discord',   path: '/api/admin/discord-devmode',   settingId: 'discordDevMode' },
    { name: 'teamspeak', path: '/api/admin/teamspeak-devmode', settingId: 'teamspeakDevMode' },
] as const

/** Both switches off, no stale action logs, before every test. */
test.beforeEach(async () => {
    await withDb(async db => {
        await db.collection('site_settings').deleteMany({
            _id: { $in: ['discordDevMode', 'teamspeakDevMode'] },
        } as never)
        await db.collection('action_logs').deleteMany({})
    })
})

for (const ep of ENDPOINTS) {
    test.describe(`${ep.name} dev mode`, () => {

        test('rejects an anonymous caller with 401', async ({ request }) => {
            expect((await request.get(ep.path)).status()).toBe(401)
            expect((await request.post(ep.path, { data: { enabled: true } })).status()).toBe(401)
        })

        test('rejects a non-J4 member with 403', async ({ pageAs }) => {
            const page = await pageAs('j3')
            expect((await page.request.get(ep.path)).status()).toBe(403)
            expect((await page.request.post(ep.path, { data: { enabled: true } })).status()).toBe(403)
        })

        test('allows the J4 department role', async ({ pageAs }) => {
            const page = await pageAs('j4')
            const res = await page.request.get(ep.path)
            expect(res.status()).toBe(200)
            expect(await res.json()).toEqual({ enabled: false })
        })

        test('allows the OVERRIDE user, who holds no Discord roles at all', async ({ adminPage }) => {
            const res = await adminPage.request.get(ep.path)
            expect(res.status()).toBe(200)
        })

        test('POST { enabled: true } persists to site_settings', async ({ adminPage }) => {
            const res = await adminPage.request.post(ep.path, { data: { enabled: true } })
            expect(res.status()).toBe(200)
            expect(await res.json()).toEqual({ enabled: true })

            const stored = await withDb(db =>
                db.collection('site_settings').findOne({ _id: ep.settingId } as never),
            )
            expect(stored?.enabled).toBe(true)
        })

        test('POST with no body toggles the current value', async ({ adminPage }) => {
            // off -> on
            expect(await (await adminPage.request.post(ep.path, { data: {} })).json())
                .toEqual({ enabled: true })
            // on -> off
            expect(await (await adminPage.request.post(ep.path, { data: {} })).json())
                .toEqual({ enabled: false })
        })

        test('enabling writes an action log', async ({ adminPage }) => {
            await adminPage.request.post(ep.path, { data: { enabled: true } })

            const log = await withDb(db =>
                db.collection('action_logs').findOne({ action: `${ep.name}.devmode.enabled` }),
            )
            expect(log, `expected a ${ep.name}.devmode.enabled action log`).not.toBeNull()
        })
    })
}

test.describe('Dev mode surfaces on the dashboard status route', () => {

    test('discord dev mode appears in /api/dashboard/status', async ({ adminPage }) => {
        const before = await (await adminPage.request.get('/api/dashboard/status')).json()
        expect(before.discord.devMode).toBe(false)

        await adminPage.request.post('/api/admin/discord-devmode', { data: { enabled: true } })

        // No wait here on purpose: the status route reads site_settings
        // directly rather than through bot.ts's 30s cache, so the change must
        // be visible on the very next call.
        const after = await (await adminPage.request.get('/api/dashboard/status')).json()
        expect(after.discord.devMode).toBe(true)
    })

    test('teamspeak dev mode appears in /api/dashboard/status', async ({ adminPage }) => {
        await adminPage.request.post('/api/admin/teamspeak-devmode', { data: { enabled: true } })
        const body = await (await adminPage.request.get('/api/dashboard/status')).json()
        expect(body.teamspeak.devMode).toBe(true)
    })

    test('an ordinary member can read the status route', async ({ memberPage }) => {
        // Documented as intentional: "any authenticated staff member can read
        // this — no admin-specific gate".
        expect((await memberPage.request.get('/api/dashboard/status')).status()).toBe(200)
    })

    test('an anonymous caller cannot read the status route', async ({ request }) => {
        expect((await request.get('/api/dashboard/status')).status()).toBe(401)
    })
})
