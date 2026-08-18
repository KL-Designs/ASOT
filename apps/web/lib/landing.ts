import Db from '@/lib/mongo'
import { PLATOON_CATEGORIES } from '@/lib/orbat/constants'

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
        { projection: { 'records.rsvp': 1, 'records.confirmed': 1, stage: 1, rsvpOpen: 1 } },
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
    src: string
    /** The filename, tidied up — see the note in getGalleryTiles. */
    caption: string
}

/**
 * A random handful of the gallery's featured images.
 *
 * Featured is the curated shelf, so it is a better source for the home page
 * than the newest files in the content tree — those are just whatever was
 * uploaded last. Shuffled per request, so a return visit gets a different set.
 *
 * The caption is the filename made presentable, because that is all the gallery
 * stores: it is a filesystem tree with no titles, dates or photographer
 * credits. Rather than invent a credit, this claims none.
 */
export async function getGalleryTiles(limit = 6): Promise<GalleryTile[]> {
    const fs = await import('fs/promises')

    try {
        const files = (await fs.readdir('../../storage/gallery/featured'))
            .filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f))

        // Fisher-Yates over a copy — a sort() with a random comparator is not a
        // uniform shuffle, and this is small enough that the real thing is free.
        for (let i = files.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[files[i], files[j]] = [files[j], files[i]]
        }

        return files.slice(0, limit).map(file => ({
            src: `/api/gallery/featured?img=${encodeURIComponent(file)}`,
            caption: file
                .replace(/\.[^.]+$/, '')
                .replace(/[-_]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim(),
        }))
    }

    // No featured folder on disk — the strip renders nothing rather than a
    // row of broken images.
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
