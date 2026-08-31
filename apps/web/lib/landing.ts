import Db from '@/lib/mongo'
import { PLATOON_CATEGORIES } from '@/lib/orbat/constants'
import { FEATURED_THUMB_WIDTH, FEATURED_WIDE_THUMB_WIDTH, thumbUrl } from '@/lib/gallery/thumbs'

/**
 * Everything the public landing page renders, loaded straight from Mongo.
 *
 * The page is a server component, so these are direct calls rather than fetches
 * against our own API — a round-trip through `/api/*` to reach the same
 * database would only add latency and a serialisation hop.
 *
 * Every loader is individually catchable and returns a null-ish empty shape on
 * failure. The landing page is the front door: a cold TeamSpeak cache or an
 * operation with a malformed date should cost one band, not the whole page.
 */

/** An operation runs for hours, so "next" includes one that started recently. */
const RUNNING_WINDOW_MS = 6 * 60 * 60 * 1000

export type LandingOp = {
    id: string
    title: string
    date: string
    status: string
    department: string | null
    coverImage: string | null
    themeColor: string | null
    mapWorld: string | null
    /** Mission maker — the closest thing the schema has to a named Zeus. */
    ownedByName: string | null
    /** First public section, flattened to plain text. Null when there is none. */
    blurb: string | null
    /** Members who have self-reported as attending. */
    attending: number
    /** Members a section leader has confirmed turned up. */
    confirmed: number
    /**
     * Filled ORBAT slots across the platoons assigned to this op — the only
     * defensible denominator, since nothing stores a total-slots figure.
     * Null when the op has no platoon assignment to measure against.
     */
    slots: number | null
    rsvpOpen: boolean
    /**
     * When sign-on is scheduled to open, if it is. Undefined on the document
     * means nobody set a time and it will be opened by hand — so this is the
     * only case where the page can say *when* rather than just "not yet".
     */
    rsvpOpenAt: string | null
    stage: string | null
}

/**
 * Pull readable text out of a ProseMirror document.
 *
 * Operations have no summary field — the body is TipTap JSON — so the card's
 * blurb has to be recovered from the first public section. Stops at `limit`
 * characters on a word boundary rather than mid-sentence.
 */
function flattenPM(node: any, out: string[] = []): string[] {
    if (!node || out.join(' ').length > 600) return out
    if (typeof node.text === 'string') out.push(node.text)
    if (Array.isArray(node.content)) for (const child of node.content) flattenPM(child, out)
    return out
}

function summarise(op: any, limit = 240): string | null {
    const section = (op.sections ?? []).find((sec: any) => sec.isPublic && sec.content)
    if (!section) return null

    const text = flattenPM(section.content).join(' ').replace(/\s+/g, ' ').trim()
    if (!text) return null
    if (text.length <= limit) return text

    const cut = text.slice(0, limit)
    const lastSpace = cut.lastIndexOf(' ')
    return `${cut.slice(0, lastSpace > 0 ? lastSpace : limit)}…`
}

/**
 * How many people the assigned platoons could field.
 *
 * `assignedPlatoons` holds ORBAT category ids, so the denominator is the number
 * of filled slots in those categories. Counting filled rather than total slots
 * means the bar measures turnout against people who actually exist, not against
 * an aspirational establishment.
 */
async function countSlots(assignedPlatoons?: string[]): Promise<number | null> {
    if (!assignedPlatoons?.length) return null
    try {
        return await Db.orbatPositions.countDocuments({
            category: { $in: assignedPlatoons },
            userId: { $ne: null },
        })
    } catch { return null }
}

async function decorateOp(op: any): Promise<LandingOp> {
    const attendance = await Db.operationAttendance.findOne(
        { operationId: op._id },
        { projection: { 'records.rsvp': 1, 'records.confirmed': 1, stage: 1, rsvpOpen: 1, rsvpOpenAt: 1 } },
    ).catch(() => null)

    const records = attendance?.records ?? []

    return {
        id: String(op._id),
        title: op.title,
        date: new Date(op.date).toISOString(),
        status: op.status ?? 'Upcoming',
        department: op.department ?? null,
        coverImage: op.coverImage ?? null,
        themeColor: op.themeColor ?? null,
        mapWorld: op.mapWorld ?? null,
        ownedByName: op.ownedByName ?? null,
        blurb: summarise(op),
        attending: records.filter((r: any) => r.rsvp === 'attending').length,
        confirmed: records.filter((r: any) => r.confirmed).length,
        slots: await countSlots(op.assignedPlatoons),
        rsvpOpen: !!attendance?.rsvpOpen,
        rsvpOpenAt: attendance?.rsvpOpenAt ? new Date(attendance.rsvpOpenAt).toISOString() : null,
        stage: attendance?.stage ?? null,
    }
}

/** Fields safe to read on a public page — never `internalNotes` or `zeusNotes`. */
const PUBLIC_OP_FIELDS = {
    title: 1, date: 1, status: 1, department: 1, coverImage: 1,
    themeColor: 1, mapWorld: 1, ownedByName: 1, assignedPlatoons: 1, sections: 1,
} as const

export async function getFeaturedOp(): Promise<LandingOp | null> {
    try {
        const op = await Db.operations.findOne(
            {
                deletedAt: { $exists: false },
                // 'In Development' is HQ-only; this page is public.
                status: { $in: ['Upcoming', 'Active'] },
                date: { $gte: new Date(Date.now() - RUNNING_WINDOW_MS) },
            },
            { sort: { date: 1 }, projection: PUBLIC_OP_FIELDS },
        )
        return op ? await decorateOp(op) : null
    } catch { return null }
}

/**
 * The operations log — upcoming first, then recent.
 *
 * The old homepage headed this "Recent & Upcoming" over three cards all marked
 * COMPLETED, which reads as a dead unit to someone deciding whether to apply.
 * Ordering upcoming ahead of completed is the whole point of the section.
 */
export async function getOperationsLog(limit = 6): Promise<LandingOp[]> {
    try {
        const now = new Date(Date.now() - RUNNING_WINDOW_MS)

        const [upcoming, recent] = await Promise.all([
            Db.operations.find(
                { deletedAt: { $exists: false }, status: { $in: ['Upcoming', 'Active'] }, date: { $gte: now } },
                { sort: { date: 1 }, limit, projection: PUBLIC_OP_FIELDS },
            ).toArray(),
            Db.operations.find(
                { deletedAt: { $exists: false }, status: 'Completed' },
                { sort: { date: -1 }, limit, projection: PUBLIC_OP_FIELDS },
            ).toArray(),
        ])

        return (await Promise.all(
            [...upcoming, ...recent].slice(0, limit).map(decorateOp),
        ))
    } catch { return [] }
}

export type PlatoonStat = {
    id: string
    label: string
    /** Distinct members posted to the category. */
    members: number
    /** Named sections within it. */
    sections: number
}

/**
 * Headcount and section count per platoon.
 *
 * `distinct` on userId rather than a document count: one member can hold two
 * slots, and the card claims a number of people.
 */
export async function getPlatoonStats(): Promise<PlatoonStat[]> {
    try {
        return await Promise.all(
            PLATOON_CATEGORIES.map(async cat => {
                const [members, sections] = await Promise.all([
                    Db.orbatPositions.distinct('userId', { category: cat._id, userId: { $ne: null } }),
                    Db.orbatPositions.distinct('sectionTitle', { category: cat._id }),
                ])
                return {
                    id: cat._id,
                    label: cat.label,
                    members: members.length,
                    sections: sections.filter(Boolean).length,
                }
            }),
        )
    } catch { return [] }
}

/**
 * The current Screenshot of the Month, which doubles as the hero background.
 *
 * Loaded server-side rather than fetched on mount so the hero paints with its
 * photograph already in place — and so a month with none set renders the
 * fallback banner instead of briefly showing a broken image.
 */
export async function getScreenshotOfMonth(): Promise<ScreenshotOfMonth | null> {
    try {
        const doc = await Db.siteSettings.findOne({ _id: 'screenshotOfMonth' })
        if (!doc) return null
        const { _id: _ignored, ...sotm } = doc as any
        return sotm as ScreenshotOfMonth
    } catch { return null }
}

export type GalleryTile = {
    /** The full-size original. Nothing renders this — the mosaic uses the two
     *  thumbnails below — but it is the honest identity of the tile and what a
     *  future "open this photograph" would need. */
    src: string
    /** The mosaic's single-column tiles (~341 CSS px at a 1400px `.inner`, so
     *  682 at 2x): an 800px WebP from the thumbnail route. */
    thumb: string
    /** The mosaic's double-width tiles (~694 CSS px, so 1388 at 2x): a 1600px
     *  WebP. Two sizes rather than one because four of the six tiles are
     *  double-width and the other two are half their size — serving 1600 to all
     *  six would be four times the bytes for detail the small ones cannot
     *  show. */
    thumbWide: string
    /** The media's own caption or operation label, when it has one — see the
     *  note in getGalleryTiles. */
    caption: string
}

/**
 * A random handful of the gallery's featured images.
 *
 * Reads `gallery_media` where `featuredOrder` is set — the same rotation the
 * public gallery's featured rail plays (`/api/gallery/route.ts`) and the
 * Featured tab curates (`PUT /api/gallery/admin/featured/order`) — rather
 * than its own `readdir` of storage/gallery/featured, which this used to
 * walk directly. That directory is legacy bytes only: nothing removes a file
 * from it when J5 drops the item from the rotation in the console, so the
 * two sources disagreed the moment featuredOrder existed — a screenshot
 * pulled from the rail this morning could still be on the homepage this
 * afternoon. Querying the same field the rail reads is what keeps the
 * homepage and the gallery page from ever showing a different rotation.
 *
 * Shuffled per request, so a return visit gets a different set — the
 * ordering `featuredOrder` itself carries is what the rail plays in
 * sequence; the homepage only ever wanted a handful, not that sequence.
 *
 * The caption is the media's own caption, falling back to its operation
 * label — unlike the old filename-derived text, these documents actually
 * carry one now.
 */
export async function getGalleryTiles(limit = 6): Promise<GalleryTile[]> {
    try {
        const docs = await Db.galleryMedia
            .find({ status: 'live', featuredOrder: { $exists: true } })
            .toArray()

        // Fisher-Yates over a copy — a sort() with a random comparator is not a
        // uniform shuffle, and this is small enough that the real thing is free.
        for (let i = docs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[docs[i], docs[j]] = [docs[j], docs[i]]
        }

        return docs.slice(0, limit).map(doc => ({
            src: `/api/gallery/media/${doc._id.toString()}`,
            /* Resized copies, not the original. Six featured items on this
               archive is six 4K screenshots averaging 3.8MB — roughly 23MB of
               images on the home page's first paint, to fill tiles no wider
               than 694 CSS px. */
            thumb: thumbUrl(doc._id.toString(), FEATURED_THUMB_WIDTH),
            thumbWide: thumbUrl(doc._id.toString(), FEATURED_WIDE_THUMB_WIDTH),
            caption: doc.caption || doc.opLabel || '',
        }))
    }

    // A database error must not take the homepage down with it: the strip
    // renders nothing and the rest of the page still serves. An empty
    // rotation is not this case and never reaches here — find().toArray()
    // returns [] and maps to [] on the happy path.
    catch { return [] }
}

/** Distinct members holding a filled ORBAT slot, excluding inactive reservists. */
export async function getRosterCount(): Promise<number | null> {
    try {
        const ids = await Db.orbatPositions.distinct('userId', {
            userId: { $ne: null },
            category: { $nin: ['inactiveReservist'] },
        })
        return ids.length
    } catch { return null }
}
