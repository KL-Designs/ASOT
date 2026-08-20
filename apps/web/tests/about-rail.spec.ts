import { test, expect } from '@playwright/test'

/**
 * The one piece of real behaviour the shell redesign introduces. The active
 * cell is resolved by longest prefix, which is unit-tested in lib/shell/rail —
 * this checks that the resolution is actually wired to the rendered rail.
 *
 * Unauthenticated public pages, so no persona fixture is needed — plain
 * `@playwright/test` is the simplest correct pattern here (see the
 * public-pages merge note in tests/README.md).
 */
const ROUTES: [string, string][] = [
    ['/about', 'About Us'],
    ['/about/callsigns', 'Callsigns'],
    ['/about/contact', 'Contact Us'],
    ['/about/rules', 'Rules & Expectations'],
    ['/about/values', 'Principles & Values'],
    ['/about/faq', 'FAQ'],
]

test.describe('About section rail', () => {
    for (const [path, label] of ROUTES) {
        test(`marks exactly one cell active on ${path}`, async ({ page }) => {
            await page.goto(path)
            const rail = page.getByRole('navigation', { name: 'Section' })
            const active = rail.locator('[aria-current="page"]')

            await expect(active).toHaveCount(1)
            await expect(active).toContainText(label)
        })
    }

    test('every cell links to a page that exists', async ({ page }) => {
        await page.goto('/about')
        const links = page.getByRole('navigation', { name: 'Section' }).getByRole('link')
        await expect(links).toHaveCount(6)
    })
})
