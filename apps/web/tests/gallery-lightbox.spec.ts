import { test, expect, type Page } from '@playwright/test'
import sharp from 'sharp'

/**
 * The lightbox must fit the viewport whatever the shape of the photograph.
 *
 * `.lb` is a two-column grid whose columns were declared and whose ROW was
 * not, so the single implicit row was `auto` — sized to the image's
 * max-content height. That made the grid's height indefinite for its own
 * contents, which quietly disabled both rules meant to bound the picture:
 * `.lbImg { height: 100% }` resolved against an indefinite height and behaved
 * as `auto`, and `.lbImg img { max-height: 100% }` behaved as `none`. A tall
 * screenshot therefore made `.lbStage` thousands of pixels deep, and because
 * `.lbNav` is `top: 50%` of that stage and `.lbIdx` is `bottom: 20px` of it,
 * the arrows and the counter were positioned off the bottom of the screen.
 *
 * Desktop only, which is why it survived: the `@media (max-width: 1240px)`
 * rule has always set `grid-template-rows: minmax(0, 1fr) auto` for the
 * stacked layout. So the viewport below is deliberately wider than 1240px —
 * at 1200 this test would pass against the unfixed CSS.
 *
 * This cannot be a vitest test. jsdom performs no layout, so every assertion
 * here would read 0; the only thing a unit test could check is that the CSS
 * text contains a rule, which pins the fix rather than the behaviour.
 *
 * The gallery API is stubbed rather than seeded. The bug needs a photograph
 * far taller than the viewport, and inventing one here keeps the test off the
 * shape of whatever happens to be in the archive — which is exactly the
 * variable that decides whether the bug shows.
 */

const VIEWPORT = { width: 1440, height: 900 }

/** Taller than the viewport by more than 4x — the failure is proportional to
 *  the overflow, so a merely-tall image would make a weak assertion. */
const TALL = { width: 900, height: 4000 }

const TALL_ID = '000000000000000000000001'
const WIDE_ID = '000000000000000000000002'

function item(id: string, opLabel: string, width: number, height: number) {
    return {
        id,
        kind: 'image' as const,
        source: 'upload' as const,
        src: `/api/gallery/media/${id}`,
        poster: null,
        embedId: null,
        embedKind: null,
        embedUrl: null,
        year: '2025',
        operation: `1. ${opLabel}`,
        opLabel,
        opOrder: Date.UTC(2025, 0, 1),
        mission: 'I',
        takenAt: new Date(Date.UTC(2025, 0, 1)).toISOString(),
        authorId: null,
        authorName: null,
        caption: null,
        tags: [],
        width,
        height,
        durationSec: null,
        up: 0,
        down: 0,
        score: 0,
        publishedAt: new Date(Date.UTC(2025, 0, 1)).toISOString(),
        file: `${id}.png`,
    }
}

/* Two items, not one: Lightbox renders its prev/next buttons and its index
   counter only when `count > 1`, and those three are the elements the bug
   actually pushes off screen. With a single item there would be nothing to
   assert on but the picture. */
const PAYLOAD = {
    info: 'Gallery API',
    updated: new Date().toISOString(),
    featured: [],
    items: [item(TALL_ID, 'Op Tall', TALL.width, TALL.height), item(WIDE_ID, 'Op Wide', 1920, 1080)],
    tags: [],
}

async function stubGallery(page: Page) {
    const png = await sharp({
        create: { width: TALL.width, height: TALL.height, channels: 3, background: { r: 42, g: 44, b: 50 } },
    }).png().toBuffer()

    // Function matchers, so the media route below cannot be shadowed by a
    // glob that also matches /api/gallery itself.
    await page.route(
        url => url.pathname === '/api/gallery',
        route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(PAYLOAD) }),
    )
    // Covers the grid's thumb request and the lightbox's full-size src alike —
    // both are under /api/gallery/media/, and neither id exists in the
    // database this suite seeds.
    await page.route(
        url => url.pathname.startsWith('/api/gallery/media/'),
        route => route.fulfill({ contentType: 'image/png', body: png }),
    )
}

/** Bottom edge of the first match, in viewport coordinates. */
async function bottomOf(page: Page, selector: ReturnType<Page['locator']>): Promise<number> {
    const box = await selector.boundingBox()
    expect(box, 'element should be laid out and visible').not.toBeNull()
    return box!.y + box!.height
}

test.describe('Gallery lightbox', () => {
    test.use({ viewport: VIEWPORT })

    test.beforeEach(async ({ page }) => {
        await stubGallery(page)
        await page.goto('/gallery')
        await page.getByRole('button', { name: /^Open Op Tall/ }).click()
        await expect(page.getByRole('dialog')).toBeVisible()
    })

    test('a photograph far taller than the viewport is scaled to fit it', async ({ page }) => {
        const image = page.getByRole('dialog').locator('img').first()
        await expect(image).toBeVisible()

        expect(await bottomOf(page, image)).toBeLessThanOrEqual(VIEWPORT.height)
    })

    test('the step arrows stay on screen beside a tall photograph', async ({ page }) => {
        // `top: 50%` of the stage — the taller the stage grows, the further
        // down the page these go. Before the fix they sat around y=2100.
        for (const name of ['Previous item', 'Next item']) {
            const button = page.getByRole('button', { name })
            expect(await bottomOf(page, button), `${name} should be within the viewport`)
                .toBeLessThanOrEqual(VIEWPORT.height)
        }
    })

    test('the index counter stays on screen beside a tall photograph', async ({ page }) => {
        // `bottom: 20px` of the stage, so it tracks the stage's bottom edge
        // straight off the screen.
        const counter = page.getByRole('dialog').getByText('1 / 2')

        expect(await bottomOf(page, counter)).toBeLessThanOrEqual(VIEWPORT.height)
    })

    test('the dialog itself never grows past the viewport', async ({ page }) => {
        /* The root assertion the three above are consequences of. Read off
           scrollHeight rather than the bounding box: `.lb` is `position: fixed;
           inset: 0`, so its BOX is the viewport height even when its contents
           overflow it — the box would report 900 in both the broken and the
           fixed state, and the test would pass against the bug. */
        const overflow = await page.getByRole('dialog').evaluate(
            el => el.scrollHeight - el.clientHeight,
        )

        expect(overflow, 'the lightbox should have no vertical overflow').toBeLessThanOrEqual(1)
    })
})
