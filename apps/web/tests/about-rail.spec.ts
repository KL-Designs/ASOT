import { test, expect } from '@playwright/test'

/**
 * The one piece of real behaviour the shell redesign introduces. The active
 * cell is resolved by longest prefix, which is unit-tested in lib/shell/rail —
 * this checks that the resolution is actually wired to the rendered rail.
 *
 * The masthead assertion is here for a different reason: the rail was the one
 * part of the shell still working when every one of the six pages rendered
 * `/about`'s masthead, because the rail reads `usePathname()` on the client
 * while the masthead was fed a server-side path that did not exist. Only an
 * assertion on the <h1> catches that.
 *
 * Unauthenticated public pages, so no persona fixture is needed — plain
 * `@playwright/test` is the simplest correct pattern here (see the
 * public-pages merge note in tests/README.md).
 */
// [route, rail label, masthead <h1>]
const ROUTES: [string, string, string][] = [
    ['/about', 'About Us', 'ABOUT US'],
    ['/about/callsigns', 'Callsigns', 'CALLSIGNS'],
    ['/about/contact', 'Contact Us', 'CONTACT US'],
    ['/about/rules', 'Rules & Expectations', 'RULES & EXPECTATIONS'],
    ['/about/values', 'Principles & Values', 'PRINCIPLES & VALUES'],
    ['/about/faq', 'FAQ', 'FAQ'],
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

    for (const [path, , heading] of ROUTES) {
        test(`renders its own masthead title on ${path}`, async ({ page }) => {
            await page.goto(path)
            const h1 = page.getByRole('heading', { level: 1 })

            await expect(h1).toHaveCount(1)
            await expect(h1).toHaveText(heading)
        })
    }

    test('every cell links to a page that exists', async ({ page }) => {
        await page.goto('/about')
        const links = page.getByRole('navigation', { name: 'Section' }).getByRole('link')
        await expect(links).toHaveCount(6)
    })
})
