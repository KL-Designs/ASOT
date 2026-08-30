import { describe, test, expect, vi } from 'vitest'
import { ObjectId } from 'mongodb'
import type { Filter } from 'mongodb'

/**
 * What the public archive grid is allowed to contain.
 *
 * `scripts/index-gallery.mjs` gives the 58 files in `featured/` and the one in
 * `sotm/` their own documents so J5's console can manage them by id (spec
 * §6.7). Both directories predate media ids: those documents carry no year, no
 * operation, no author and no caption, and several are the same photograph the
 * visitor can already see — dated and attributed — in the archive itself.
 * Indexing them without a filter put 59 blank tiles on the public grid, some
 * of them duplicates.
 *
 * The fixture below runs the route's real filter object rather than asserting
 * on its shape, so a filter that stopped excluding them — or started excluding
 * an embed, which has no storageKey at all — fails here.
 */

const CONTENT = new ObjectId('6a9380f11c4e5d2a77b31099')
const FEATURED = new ObjectId('6a9380f11c4e5d2a77b31100')
const SOTM = new ObjectId('6a9380f11c4e5d2a77b31101')
const EMBED = new ObjectId('6a9380f11c4e5d2a77b31102')
const HIDDEN = new ObjectId('6a9380f11c4e5d2a77b31103')

type Doc = { _id: ObjectId, storageKey?: string, status: string }

const DOCS: Doc[] = [
    { _id: CONTENT, storageKey: 'content:2025/1. Op Black Hill/I/a.png', status: 'live' },
    { _id: FEATURED, storageKey: 'featured:q.jpg', status: 'live' },
    { _id: SOTM, storageKey: 'sotm:r.jpg', status: 'live' },
    // An embed has no bytes of its own and therefore no storageKey. `$not`
    // matches a missing field, which is exactly what keeps it in the grid.
    { _id: EMBED, status: 'live' },
    { _id: HIDDEN, storageKey: 'content:2025/1. Op Black Hill/I/b.png', status: 'hidden' },
]

/** The two clauses the route's filter actually uses, applied for real. */
function matches(filter: Filter<GalleryMedia>, doc: Doc): boolean {
    const status = filter.status
    if (typeof status === 'string' && doc.status !== status) return false

    const key = filter.storageKey
    if (key && typeof key === 'object' && '$not' in key) {
        const not = key.$not
        if (not instanceof RegExp && typeof doc.storageKey === 'string' && not.test(doc.storageKey)) return false
    }
    return true
}

vi.mock('@/lib/mongo', () => ({
    default: {
        galleryMedia: {
            find: (filter: Filter<GalleryMedia>) => ({
                toArray: async () => DOCS.filter(d => matches(filter, d)),
            }),
        },
        galleryTags: {
            find: () => ({ sort: () => ({ toArray: async () => [] }) }),
        },
    },
}))

const { GET } = await import('./route')

describe('GET /api/gallery', () => {
    test('excludes featured/ and sotm/ fixtures from the public grid', async () => {
        const json = await (await GET()).json()
        const ids: string[] = json.items.map((i: GalleryItemAPI) => i.id)

        expect(ids).not.toContain(FEATURED.toString())
        expect(ids).not.toContain(SOTM.toString())
    })

    test('keeps archive items and embeds', async () => {
        const json = await (await GET()).json()
        const ids: string[] = json.items.map((i: GalleryItemAPI) => i.id)

        expect(ids).toContain(CONTENT.toString())
        expect(ids).toContain(EMBED.toString())
        // Still only live media, exactly as before.
        expect(ids).not.toContain(HIDDEN.toString())
    })
})
