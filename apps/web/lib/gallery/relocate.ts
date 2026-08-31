import { ObjectId } from 'mongodb'
import type { Filter, FindOptions, UpdateFilter, WithId } from 'mongodb'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'fs'
import path from 'path'

import { buildContentPath, sanitizeSegment } from './content-path'
import { buildMediaFilename } from './filenames'
import { findByOperationKey, splitOperation } from './naming'
import { CONTENT_DIR, MEDIA_DIR, contentKey, resolveStorageKey } from './paths'

/**
 * Moving one piece of media into the readable content tree.
 *
 * This runs when a submission is published, and when a reviewer reassigns an
 * item's operation. Both are the same operation: work out which folder the
 * item belongs in, give the file a name carrying its id, and move it there.
 *
 * It is also the ONLY writer of
 * `year`/`campaign`/`operation`/`opLabel`/`mission`/`takenAt` for an item that
 * has bytes. An item with none — an embed, or a record whose
 * transcode failed — returns early below without writing anything, so those
 * fields are decided for it by operationFacets()
 * (lib/gallery/operation-facets.ts) instead. Exactly one producer each; never
 * both on one path.
 *
 * A rename, never a copy — bulk-reassigning three hundred items has to be
 * instant and must not duplicate bytes. The copy path below exists only for
 * EXDEV, which cannot happen while both trees are under storage/gallery but
 * costs nothing to survive.
 *
 * Dependencies are injected rather than imported so this is testable against a
 * fixture directory without changing the process's working directory —
 * paths.ts resolves its roots at module load, so a test that chdir'd would
 * have to re-import the whole module graph.
 */

/**
 * `findOne`/`updateOne` are declared with method syntax (`foo(x): y`, not
 * `foo: (x) => y`) so TypeScript checks their parameter types bivariantly.
 * That is what lets both sides satisfy this type with no cast:
 *   - the real driver's `Collection<GalleryMedia>` (`Db.galleryMedia`), whose
 *     `findOne`/`updateOne` accept the full `Filter`/`UpdateFilter` shape;
 *   - a unit-test fixture whose stand-in only accepts `{ _id: ObjectId }`,
 *     which is all relocate.ts ever passes.
 * Arrow-property syntax would check parameters contravariantly instead, and
 * reject the narrower fixture signature.
 */
export type RelocateDeps = {
    media: {
        findOne(filter: Filter<GalleryMedia>): Promise<WithId<GalleryMedia> | null>
        updateOne(filter: Filter<GalleryMedia>, update: UpdateFilter<GalleryMedia>): Promise<unknown>
    }
    operations: {
        findOne(filter: Filter<Operation>, options?: FindOptions): Promise<WithId<Operation> | null>
    }
    /**
     * J2's campaign organiser, read-only. Required rather than optional so a
     * caller cannot half-wire the resolver: an absent collection would resolve
     * every campaign mission as a standalone operation and mint a sibling
     * top-level folder per mission — silently, and exactly the bug the campaign
     * level was added to fix. lib/gallery/deps.ts is the one place that names
     * them, so there is a single thing to keep in step.
     */
    campaigns: {
        findOne(filter: Filter<OperationCampaign>, options?: FindOptions): Promise<WithId<OperationCampaign> | null>
    }
    campaignMissions: {
        findOne(filter: Filter<CampaignMission>, options?: FindOptions): Promise<WithId<CampaignMission> | null>
    }
    /** Defaults to the real tree. Tests point this at a fixture. */
    contentDir?: string
    mediaDir?: string
}

const ORDER_PREFIX = /^\s*(\d+)/

/**
 * The year an operation's date files under.
 *
 * Reads UTC, never the server's local time. The stored `date` is UTC, so an
 * operation logged near midnight on 1 January must resolve to the same year
 * everywhere it is read, regardless of which timezone the process happens to
 * be running in. Exported so nothing keeps its own copy — two independent
 * `getFullYear()`/`getUTCFullYear()` calls are exactly the kind of thing that
 * quietly disagrees the one day a year it matters, and this and
 * operationFacets() (lib/gallery/operation-facets.ts, the resolver for
 * anything with no bytes) run against the same document minutes apart.
 */
export function operationYear(date: Date): string {
    return String(date.getUTCFullYear())
}

/**
 * The four folder names an operation resolves to.
 *
 * `operation` is always the level DIRECTLY above the file's day folder, which
 * is the campaign mission for a campaign op and the operation itself for a
 * single mission. That is deliberate: it keeps the facet the public rail and
 * the Media tab already group on ("operation") naming the same kind of thing
 * it always has — one weekend's worth of photographs — and lets `campaign` be
 * purely additive, absent on every legacy document.
 */
export type OperationFolder = {
    year: string | null
    campaign: string | null
    operation: string | null
    mission: string | null
}

/** The day folder, capitalised. A closed vocabulary, so this is the one
 *  segment in the tree that is never user input and never needs sanitizing. */
const DAY_FOLDER: Record<'saturday' | 'sunday', string> = { saturday: 'Saturday', sunday: 'Sunday' }

/**
 * The campaign and campaign-mission folder names for an operation, or null
 * when it is a single mission.
 *
 * Every "no" is a single mission rather than an error or an `Unknown` folder.
 * A campaign that has been deleted, a `campaignMissionId` pointing at nothing,
 * a mission filed under a different campaign than the operation names — all of
 * those describe an operation whose campaign link is stale, and a stale link
 * must not be able to stop an accepted submission from being filed at all.
 *
 * `isSingleMission` is checked first because it is the field J2 sets to say
 * "this one is standalone" explicitly; an operation can carry it alongside a
 * leftover campaignId, and the explicit answer wins over the leftover.
 */
async function resolveCampaignFolders(
    deps: RelocateDeps,
    op: WithId<Operation>,
): Promise<{ campaign: string, mission: string } | null> {
    if (op.isSingleMission) return null
    if (!op.campaignId || typeof op.campaignMissionId !== 'string') return null
    if (!ObjectId.isValid(op.campaignMissionId)) return null

    /* Read as `unknown` and narrowed rather than trusted: `Operation.campaignId`
       is declared ObjectId, but campaign_missions stores its own `campaignId`
       as a STRING and several routes round-trip through `.toString()`, so a
       document written by any of them can hold either spelling. Narrowing is
       what keeps that from becoming a runtime `_id` filter that silently
       matches nothing — which would look exactly like "not in a campaign". */
    const rawCampaignId: unknown = op.campaignId
    const campaignId = rawCampaignId instanceof ObjectId ? rawCampaignId
        : typeof rawCampaignId === 'string' && ObjectId.isValid(rawCampaignId) ? new ObjectId(rawCampaignId)
            : null
    if (!campaignId) return null

    const mission = await deps.campaignMissions.findOne({ _id: new ObjectId(op.campaignMissionId) })
    if (!mission || mission.isDeleted) return null
    // The mission must belong to the campaign the operation names. They are
    // written by two different routes, and a mission moved between campaigns
    // would otherwise nest this operation's photographs under a campaign it
    // is no longer part of.
    if (String(mission.campaignId) !== campaignId.toHexString()) return null

    const campaign = await deps.campaigns.findOne({ _id: campaignId })
    if (!campaign || campaign.isDeleted) return null

    // Both names are free text an admin typed into the J2 organiser, so both
    // go through sanitizeSegment before they are ever joined into a path.
    // Either one sanitizing to nothing (a name that was only punctuation)
    // leaves no folder to name, which is a single mission, not an empty
    // segment in the middle of a path.
    const campaignFolder = sanitizeSegment(String(campaign.name ?? ''))
    const missionFolder = sanitizeSegment(String(mission.name ?? ''))
    if (!campaignFolder || !missionFolder) return null

    return { campaign: campaignFolder, mission: missionFolder }
}

/**
 * Which folder an operation's media belongs in.
 *
 * Reuses an existing folder wherever one matches — that is what puts a new
 * submission beside the legacy files from the same operation rather than in a
 * duplicate folder next to them. Creates nothing on disk; it only returns the
 * names.
 *
 * The numbered two-tier match below applies to whatever occupies the
 * top-level-within-year slot: the CAMPAIGN for a campaign mission, the
 * operation for a single mission. That is the whole point of the campaign
 * level — three missions of one campaign now compete for one numbered folder
 * instead of minting three siblings.
 */
export async function resolveOperationFolder(
    deps: RelocateDeps,
    operationId: ObjectId | null,
): Promise<OperationFolder> {
    const contentDir = deps.contentDir ?? CONTENT_DIR
    if (!operationId) return { year: null, campaign: null, operation: null, mission: null }

    const op = await deps.operations.findOne({ _id: operationId }, {
        projection: { title: 1, date: 1, campaignId: 1, campaignMissionId: 1, daySlot: 1, isSingleMission: 1 },
    })
    if (!op?.date) {
        // Without a date there is no year folder to sit in, and inventing one
        // would file the item under a year nothing else agrees with — so the
        // bytes go to Unknown/. The operation itself is still returned: the
        // member chose it, and operationFacets()'s own undated branch keeps
        // `operation`/`opLabel` set and unsets only `year` — folding it into
        // a bare Unknown here too would make the two disagree on a document
        // reachable from either path.
        //
        // The campaign is deliberately NOT resolved here. Unknown/ has exactly
        // one level, so there is no folder for a campaign to name; returning
        // one would put a campaign row in the rail with nothing on disk behind
        // it, and a year folder must not come back through the campaign either.
        return { year: null, campaign: null, operation: op ? String(op.title ?? '') : null, mission: null }
    }

    const title = String(op.title ?? '')
    const year = operationYear(new Date(op.date))
    const yearDir = path.join(contentDir, year)

    const campaignFolders = await resolveCampaignFolders(deps, op)

    /* No day folder when the operation has no slot — the file simply sits one
       level up. Never guessed from the title's "— Sat"/"— Sun" suffix: an
       operation that has not been given a slot has not been given one, and a
       guess here would file photographs under a day J2 never agreed to. */
    const day = op.daySlot === 'saturday' || op.daySlot === 'sunday' ? DAY_FOLDER[op.daySlot] : null

    let existing: string[] = []
    try {
        existing = readdirSync(yearDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
    } catch {
        // The year folder does not exist yet. Not an error — the first
        // operation of a year creates it.
    }

    /* Two-tier: the folder whose label carries the same trailing parenthetical
       first, then one whose label matches with the parenthetical dropped.
       Matching only on the full key could not see "9. Op Copper Ridge (Lanze
       Verde)" from an operation titled "OPERATION Copper Ridge", so accepting
       a submission for it minted "10. Op Copper Ridge" beside the folder that
       already held that operation's photographs — a duplicate folder, and the
       split facet rail this whole feature exists to stop. See naming.ts for
       why the order, not an unconditional strip, is what keeps that safe. */
    /* The campaign's name when there is one, the operation's title otherwise.
       One name, one slot: a campaign mission must NOT bring its own title to
       this level, because "OPERATION Trinity I", "II" and "III" match nothing
       and each mint their own numbered folder — three siblings for one
       campaign, which is the report this whole level was added for. */
    const topName = campaignFolders ? campaignFolders.campaign : title

    const match = findByOperationKey(topName, existing, folder => splitOperation(folder).label)

    const highest = existing.reduce((max, folder) => {
        const m = folder.match(ORDER_PREFIX)
        return m ? Math.max(max, parseInt(m[1], 10)) : max
    }, 0)

    // splitOperation's label, not the raw title: the folder convention is
    // "8. Op Brand New", not "8. OPERATION Brand New — Sun". A campaign name
    // is shortened by the same two rules, so "Operation Trinity" becomes
    // "Op Trinity" and reads as one of the year's numbered folders rather
    // than as a different species of thing sitting beside them.
    const label = topName
        .replace(/\s*[\u2014\u2013-]\s*(sat|sun|saturday|sunday)\s*$/i, '')
        .replace(/^operation\s+/i, 'Op ')
        .trim()

    const top = match ?? sanitizeSegment(`${highest + 1}. ${label}`)

    /* The campaign-mission folder is its `name` verbatim — no order prefix.
       The sequence is already in the name J2 gives it ("Operation Trinity I",
       "Operation Trinity II"), so a second number would read as a competing
       ordering of the same thing. It needs no minting either: a verbatim name
       always resolves to the same folder, which is what makes re-filing the
       same operation idempotent. */
    if (campaignFolders) return { year, campaign: top, operation: campaignFolders.mission, mission: day }

    return { year, campaign: null, operation: top, mission: day }
}

/**
 * Move one item's file into the content tree and update its document.
 *
 * Returns the keys it moved between, or null when there was nothing to do —
 * the file is already in the right place, or there is no file behind the key.
 * A missing file returns null WITHOUT rewriting storageKey: pointing a record
 * at a path that has no bytes turns a recoverable problem into a broken tile.
 */
export async function relocateMedia(
    deps: RelocateDeps,
    id: ObjectId,
): Promise<{ from: string | null, to: string } | null> {
    const contentDir = deps.contentDir ?? CONTENT_DIR
    const mediaDir = deps.mediaDir ?? MEDIA_DIR

    const doc = await deps.media.findOne({ _id: id })
    if (!doc) return null

    const fromKey = typeof doc.storageKey === 'string' ? doc.storageKey : null
    if (!fromKey) return null

    const source = resolveFrom(fromKey, contentDir, mediaDir)
    if (!source || !existsSync(source)) return null

    const operationId = doc.operationId instanceof ObjectId ? doc.operationId : null
    const { year, campaign, operation, mission: day } = await resolveOperationFolder(deps, operationId)

    const ext = source.slice(source.lastIndexOf('.') + 1).toLowerCase()
    const file = buildMediaFilename({
        id: id.toString(),
        ext,
        author: typeof doc.authorName === 'string' ? doc.authorName : null,
        caption: typeof doc.caption === 'string' ? doc.caption : null,
    })

    /* Three sources, in this order.
     *
     *   1. The operation's own day slot, when it has one. It is the level the
     *      new grammar puts here, and it is derived rather than remembered, so
     *      it must win over whatever the document happens to be carrying —
     *      otherwise an item filed before the slot was set would keep a stale
     *      folder forever.
     *   2. Nothing, when the item is in a campaign but the operation has no
     *      day slot. The campaign-mission folder above it IS the level a legacy
     *      "I"/"II" folder used to occupy — the archive's own mission level,
     *      now derived from the campaign organiser instead of guessed from a
     *      folder name — so carrying the old one through as well would nest one
     *      mission label inside another.
     *   3. The mission the document already has, otherwise. Reassigning a
     *      legacy file's operation must not silently flatten its mission
     *      folder, which is the case this clause has always covered.
     *
     * `operation` being null means the file is going to Unknown/, which has no
     * level to hang a mission off at all.
     */
    const legacyMission = typeof doc.mission === 'string' && operation && !campaign ? doc.mission : null
    const mission = operation ? day ?? legacyMission : null
    const relative = buildContentPath({ year, campaign, operation, mission, file })
    const toKey = contentKey(relative)

    const destination = path.join(contentDir, ...relative.split('/'))
    if (path.resolve(destination) === path.resolve(source)) return null

    mkdirSync(path.dirname(destination), { recursive: true })
    // If updateOne below throws after this succeeds, the bytes now sit at
    // `destination` but the document still names `source` — a broken tile
    // until something reconciles the two. There is no transaction spanning a
    // filesystem and a database, and moving the file first is still the
    // right order (the alternative loses track of where the bytes went). It
    // self-heals: the new filename still carries [id], so the reconcile pass
    // matches it back to this document by id and rewrites storageKey — the
    // item renders broken until someone runs one (the start menu's
    // Migrations -> Reconcile: gallery disk, or any backup restore). The
    // Health view that will show it without being asked is Plan B.
    move(source, destination)

    const set: Record<string, unknown> = { storageKey: toKey }
    const unset: Record<string, ''> = {}

    if (year) set.year = year; else unset.year = ''
    /* Unset when the path drops it, for the same reason `mission` is below: a
       document that kept claiming a campaign whose folder it no longer sits in
       would put the item in a rail row nothing on disk agrees with, and the
       rail filters on this field. An item reassigned from a campaign mission to
       a standalone operation takes this branch. */
    if (campaign) set.campaign = campaign; else unset.campaign = ''
    if (operation) {
        set.operation = operation
        set.opLabel = splitOperation(operation).label
    } else {
        unset.operation = ''
        unset.opLabel = ''
    }
    /* Unset when the path drops it, exactly as reconcile.ts does. `mission` is
       computed above as null whenever there is no operation to hang it off, so
       reassigning a legacy file to Unknown moves the bytes to `Unknown/…`
       while the document kept claiming `mission: 'I'` — a fifth field on which
       the two halves of one operation disagreed, and one the facet rail
       filters on. */
    if (mission) set.mission = mission; else unset.mission = ''

    // takenAt follows the operation, exactly as operationFacets()
    // (lib/gallery/operation-facets.ts) does — the two must never disagree.
    // That function always writes takenAt (null in its Unknown branch, never
    // left alone), so an item relocated to Unknown here must do the same:
    // otherwise a stale date from a previous operation would survive the
    // reassignment and the gallery would keep sorting/grouping the tile on it.
    if (operationId) {
        const op = await deps.operations.findOne({ _id: operationId }, { projection: { date: 1 } })
        set.takenAt = op?.date ? new Date(op.date) : null
    } else {
        set.takenAt = null
    }

    await deps.media.updateOne({ _id: id }, {
        $set: set,
        ...(Object.keys(unset).length ? { $unset: unset } : {}),
    })

    return { from: fromKey, to: toKey }
}

/** resolveStorageKey against the injected roots rather than the real ones. */
function resolveFrom(key: string, contentDir: string, mediaDir: string): string | null {
    if (contentDir === CONTENT_DIR && mediaDir === MEDIA_DIR) return resolveStorageKey(key)

    if (key.startsWith('media:')) {
        const file = key.slice('media:'.length)
        if (!/^[0-9a-f]{24}(_poster)?\.[a-z0-9]{2,5}$/.test(file)) return null
        return path.join(mediaDir, file)
    }
    if (key.startsWith('content:') || key.startsWith('legacy:')) {
        const segments = key.slice(key.indexOf(':') + 1).split('/')
        // Two to five, matching resolveStorageKey and parseContentPath. Five is
        // the campaign grammar's own depth; a cap left at four here would make
        // every campaign item's source path unresolvable, so relocateMedia
        // would return null and quietly stop re-filing them.
        if (segments.length < 2 || segments.length > 5) return null
        if (segments.some(s => !s || s === '.' || s === '..' || s.includes('\\'))) return null
        return path.join(contentDir, ...segments)
    }
    return null
}

/** Rename where the filesystem allows it; copy-then-unlink across devices. */
function move(source: string, destination: string): void {
    try {
        renameSync(source, destination)
    } catch (err: unknown) {
        if (!isErrno(err, 'EXDEV')) throw err
        copyFileSync(source, destination)
        unlinkSync(source)
    }
}

/** A thrown value is `unknown`, and `in` NARROWS it — where an
 *  `as NodeJS.ErrnoException` only asserted the shape and would have read
 *  `undefined` off any non-Error throw, silently rethrowing nothing useful. */
function isErrno(err: unknown, code: string): boolean {
    return typeof err === 'object' && err !== null && 'code' in err && err.code === code
}
