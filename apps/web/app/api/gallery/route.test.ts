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
const UNNUMBERED = new ObjectId('6a9380f11c4e5d2a77b31104')

type Doc = { _id: ObjectId, storageKey?: string, status: string, operation?: string, takenAt?: Date }

const DOCS: Doc[] = [
    // An old numbered folder and a new unnumbered one, deliberately dated the
    // other way round from their names: the numbered folder is the LATER
    // operation. Reading the order out of the folder name would rank it first
    // and rank the unnumbered one MAX_SAFE_INTEGER, i.e. last.
    {
        _id: CONTENT, storageKey: 'content:2025/1. Op Black Hill/I/a.png', status: 'live',
        operation: '1. Op Black Hill', takenAt: new Date('2025-06-14T09:00:00Z'),
    },
    { _id: FEATURED, storageKey: 'featured:q.jpg', status: 'live' },
    { _id: SOTM, storageKey: 'sotm:r.jpg', status: 'live' },
    // An embed has no bytes of its own and therefore no storageKey. `$not`
    // matches a missing field, which is exactly what keeps it in the grid.
    { _id: EMBED, status: 'live' },
    { _id: HIDDEN, storageKey: 'content:2025/1. Op Black Hill/I/b.png', status: 'hidden' },
    {
        _id: UNNUMBERED, storageKey: 'content:2025/Op Copper Ridge/Saturday/c.png', status: 'live',
        operation: 'Op Copper Ridge', takenAt: new Date('2025-02-08T09:00:00Z'),
    },
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

    /* Every archive item is content:-keyed with an /api/gallery/media/{id}
       src, so there is nothing in the URL for the client to name a download
       from — all 4,781 saved as a bare ObjectId with no extension. The
       readable name the feature put on disk is sent explicitly. */
    test('sends the readable on-disk filename for a download', async () => {
        const json = await (await GET()).json()
        const items: GalleryItemAPI[] = json.items

        expect(items.find(i => i.id === CONTENT.toString())?.file).toBe('a.png')
        // An embed has no bytes and therefore no file to name.
        expect(items.find(i => i.id === EMBED.toString())?.file).toBeNull()
    })

    test('keeps archive items and embeds', async () => {
        const json = await (await GET()).json()
        const ids: string[] = json.items.map((i: GalleryItemAPI) => i.id)

        expect(ids).toContain(CONTENT.toString())
        expect(ids).toContain(EMBED.toString())
        // Still only live media, exactly as before.
        expect(ids).not.toContain(HIDDEN.toString())
    })

    /* opOrder used to be splitOperation(m.operation).order — the folder's
       leading number, with MAX_SAFE_INTEGER for a folder that had none. New
       folders carry no number at all, so that reading would have put every new
       operation last and left the ordering to the alphabetical tiebreak in
       sortPhotos/FacetRail. The fixture dates the NUMBERED folder later than
       the unnumbered one on purpose: under the old rule '1. Op Black Hill'
       ranked 1 and 'Op Copper Ridge' ranked MAX_SAFE_INTEGER, the exact
       reverse of the answer below. */
    test('orders operations by their date, not by a number in the folder name', async () => {
        const json = await (await GET()).json()
        const items: GalleryItemAPI[] = json.items

        const numbered = items.find(i => i.id === CONTENT.toString())
        const unnumbered = items.find(i => i.id === UNNUMBERED.toString())

        expect(unnumbered?.opOrder).toBe(new Date('2025-02-08T09:00:00Z').getTime())
        expect(numbered?.opOrder).toBe(new Date('2025-06-14T09:00:00Z').getTime())
        expect(unnumbered!.opOrder).toBeLessThan(numbered!.opOrder)
    })

    /* The rule sortPhotos already states for takenAt, now also true of the
       key the by-operation sort and the facet rail use: an item with no date
       is missing information, not the beginning of time, so it sorts last. */
    test('an item with no date sorts after every dated one', async () => {
        const json = await (await GET()).json()
        const items: GalleryItemAPI[] = json.items

        const embed = items.find(i => i.id === EMBED.toString())
        expect(embed?.opOrder).toBe(Number.MAX_SAFE_INTEGER)
    })
})
