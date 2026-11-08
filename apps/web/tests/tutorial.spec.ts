/**
 * Guided tutorials (lib/tutorial, components/tutorial).
 *
 * The property that matters most is that a tutorial never writes: every
 * change a member makes during one is answered in the browser. Playwright
 * sees every request the page really sends, so "no write reached the server"
 * is asserted directly rather than inferred from the database.
 */
import type { Page, Request } from '@playwright/test'
import { test, expect } from './fixtures/asot'
import { USERS } from './constants'
import { withDb } from './seed'

const card = (page: Page) => page.getByRole('dialog', { name: /./ }).filter({ hasText: /\d+ \/ \d+/ })

/** Every non-GET request the page actually sent, other than the tutorial's own progress save. */
function trackWrites(page: Page) {
    const writes: string[] = []
    page.on('request', (r: Request) => {
        const m = r.method()
        if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return
        if (new URL(r.url()).pathname === '/api/tutorials/progress') return
        writes.push(`${m} ${r.url()}`)
    })
    return writes
}

async function next(page: Page) {
    await card(page).getByRole('button', { name: /^(Next|Finish)$/ }).click()
}

test.describe('Guided tutorials', () => {

    test('J1 application review runs end to end without sending a write', async ({ adminPage: page }) => {
        const writes = trackWrites(page)
        await page.goto('/dashboard/j1')

        await page.getByRole('button', { name: 'Tutorial' }).click()
        await page.getByRole('menuitem', { name: /Reviewing an application/ }).click()

        await expect(page.getByRole('status').getByText('Tutorial mode')).toBeVisible()
        await expect(card(page)).toContainText('Reviewing applications')
        await next(page)

        await expect(card(page)).toContainText('The Applications tab')
        await page.locator('[data-tour="j1-tab-applications"]').click()

        await expect(card(page)).toContainText('Filter by status')
        await next(page)

        await expect(card(page)).toContainText('Open the practice application')
        await page.locator('[data-tour="tutorial-practice-row"]').click()

        await expect(card(page)).toContainText('The application')
        await next(page)
        await expect(card(page)).toContainText('Write your notes')
        await page.locator('[data-tour="j1-app-notes"] textarea').first().fill('Spoke on TS, keen on medic')
        await next(page)

        await expect(card(page)).toContainText('Save your notes')
        await page.locator('[data-tour="j1-app-save"]').click()

        await expect(card(page)).toContainText('Make the call')
        await page.locator('[data-tour="j1-app-actions"] button', { hasText: 'Accept' }).click()

        await expect(card(page)).toContainText("That's an application done")
        await next(page)

        // Finishing reloads the page with real data: the practice applicant is gone.
        await expect(page.getByRole('status').getByText('Tutorial mode')).toBeHidden()
        await expect(page.locator('[data-tour="tutorial-practice-row"]')).toHaveCount(0)

        expect(writes).toEqual([])

        const row = await withDb(db => db.collection('tutorial_progress').findOne({ userId: USERS.override.id, tutorialId: 'j1-applications' }))
        expect(row?.runs).toBeGreaterThanOrEqual(1)
    })

    test('any write the page attempts during a tutorial is swallowed', async ({ adminPage: page }) => {
        const writes = trackWrites(page)
        await page.goto('/dashboard/j1?tutorial=j1-applications')
        await expect(page.getByRole('status').getByText('Tutorial mode')).toBeVisible()

        const result = await page.evaluate(async () => {
            const r = await fetch('/api/admin/j1/applications/anything', { method: 'DELETE' })
            const beacon = navigator.sendBeacon('/api/anything', 'x')
            return { ok: r.ok, header: r.headers.get('X-ASOT-Tutorial'), beacon }
        })
        expect(result).toEqual({ ok: true, header: '1', beacon: true })
        expect(writes).toEqual([])

        // Quitting takes the sandbox down again.
        await page.getByRole('status').getByRole('button', { name: 'Quit' }).click()
        await expect(page.getByRole('status').getByText('Tutorial mode')).toBeHidden()
        const header = await page.evaluate(async () => (await fetch('/api/tutorials/progress')).headers.get('X-ASOT-Tutorial'))
        expect(header).toBeNull()
    })

    test('the help wiki event starts the tickets tutorial on the current department', async ({ pageAs }) => {
        const page = await pageAs('j3')
        await page.goto('/dashboard/j3')
        await page.evaluate(() => window.dispatchEvent(new CustomEvent('asot:tutorial-start', { detail: { id: 'dept-tickets' } })))

        await expect(card(page)).toContainText('Department tickets')
        await next(page)
        await expect(page).toHaveURL(/\/dashboard\/j3\?.*admin=tickets/)
        await expect(page.locator('[data-tour="tutorial-practice-ticket"]')).toBeVisible()
    })
})
