/**
 * Dashboard shell + overview.
 *
 * These exercise the real server-side gate in `app/dashboard/layout.tsx`
 * against a real (in-memory) Mongo — there is no request stubbing here,
 * because there is no browser request to stub.
 */
import { test, expect } from './fixtures/asot'
import { USERS } from './constants'

test.describe('Dashboard shell', () => {

    test('an authorised user reaches /dashboard and is greeted by name', async ({ adminPage }) => {
        await adminPage.goto('/dashboard')

        // Not bounced to /login or /me.
        await expect(adminPage).toHaveURL(/\/dashboard\/?$/)
        await expect(adminPage.getByText(`Welcome back, ${USERS.override.name}`)).toBeVisible()
    })

    test('sidebar renders its three section toggles', async ({ adminPage }) => {
        await adminPage.goto('/dashboard')

        // Labels are rendered upper-cased by StaffSidebar.
        for (const section of ['DEPARTMENTS', 'PERSONNEL', 'UNIT']) {
            await expect(
                adminPage.getByRole('button', { name: new RegExp(section) }),
            ).toHaveCount(1)
        }
    })

    test('section toggles collapse and expand', async ({ adminPage }) => {
        await adminPage.goto('/dashboard')

        const unit = adminPage.getByRole('button', { name: /UNIT/ })
        const sops = adminPage.getByRole('link', { name: 'SOPs' })

        await expect(sops).toBeVisible()
        await unit.click()
        await expect(sops).toBeHidden()
        await unit.click()
        await expect(sops).toBeVisible()
    })

    test('service status strip reports the seeded environment truthfully', async ({ adminPage }) => {
        const statusPromise = adminPage.waitForResponse(
            r => r.url().includes('/api/dashboard/status') && r.status() === 200,
        )
        await adminPage.goto('/dashboard')
        const body = await (await statusPromise).json()

        expect(body.website.online).toBe(true)
        // The in-memory mongod is genuinely reachable, so this must be true —
        // it is the canary that the whole harness is wired up correctly.
        expect(body.database.online).toBe(true)
        // DISCORD_BOT_TOKEN is deliberately blank in playwright.config.ts, so
        // checkDiscord() short-circuits to false without any network call.
        expect(body.discord.online).toBe(false)
        expect(body.discord.devMode).toBe(false)
        expect(body.teamspeak.devMode).toBe(false)
    })

    test('overview shows the Favourites section', async ({ adminPage }) => {
        await adminPage.goto('/dashboard')
        await expect(adminPage.getByText('Favourites ★')).toBeVisible()
    })
})

test.describe('Department panels', () => {

    // Every J-department landing page behind the same layout gate.
    for (const dept of ['j1', 'j2', 'j3', 'j4', 'j5', 'j6', 'j7']) {
        test(`/dashboard/${dept} loads for a full-access user`, async ({ adminPage }) => {
            const errors: string[] = []
            adminPage.on('pageerror', e => errors.push(e.message))

            const res = await adminPage.goto(`/dashboard/${dept}`)

            expect(res?.status()).toBeLessThan(400)
            await expect(adminPage).toHaveURL(new RegExp(`/dashboard/${dept}`))
            expect(errors, `runtime errors on /dashboard/${dept}`).toEqual([])
        })
    }
})

test.describe('Dashboard sub-pages', () => {

    for (const path of [
        '/dashboard/orbat',
        '/dashboard/tasks',
        '/dashboard/personnel/all',
        '/dashboard/personnel/all-staff',
        '/dashboard/personnel/hq-staff',
        '/dashboard/unit/calendar',
        '/dashboard/unit/sops',
        '/dashboard/unit/training-hub',
        '/dashboard/retired',
    ]) {
        test(`${path} loads without a runtime error`, async ({ adminPage }) => {
            const errors: string[] = []
            adminPage.on('pageerror', e => errors.push(e.message))

            const res = await adminPage.goto(path)

            expect(res?.status()).toBeLessThan(400)
            expect(errors, `runtime errors on ${path}`).toEqual([])
        })
    }
})
