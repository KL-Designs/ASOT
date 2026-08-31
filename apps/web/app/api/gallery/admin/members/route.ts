import { NextResponse } from 'next/server'

import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { memberDisplayName } from '@/lib/gallery/author'

/**
 * The author picker's list of members.
 *
 * Separate from `/api/members` rather than a widening of it, for two reasons
 * that both point the same way. That route is gated on
 * `PERMISSIONS.admin.massImport` — a J5 curator holds `gallery.manage` and
 * nothing of the sort — and it excludes skeleton accounts, which are exactly
 * the people this picker exists to name: `isSkeletonAccount` members are the
 * CSV-imported roster of the era the 2021 archive was photographed in, never
 * matched to a Discord account because most of them had left before the import
 * ran. A picker that hid them would be unable to credit most of the archive.
 *
 * `apps/web/CLAUDE.md` calls skeleton accounts read-only stubs in
 * member-facing logic, and that still holds: recording one as a photographer
 * writes to the media document, never to the user. Nothing here or downstream
 * mutates them, and the two places `authorId` is read — the unpublished-media
 * owner check and the submission accept/reject notification — are reached only
 * by a document a live member submitted, which a skeleton account cannot do.
 * They are flagged in the response anyway so the picker can say so.
 *
 * Names only. No Discord id beyond the one already used as `authorId`, no
 * roles, no ranks: this is a label chooser, and anything else would be a
 * roster export behind a gallery permission.
 */
export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !await hasPermission(me, 'gallery.manage')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const users = await Db.users
        .find({}, { projection: { id: 1, globalName: 1, username: 1, isSkeletonAccount: 1, 'guild.displayName': 1, 'guild.nickname': 1 } })
        .toArray()

    const members = users
        .map(u => ({
            id: u.id,
            displayName: memberDisplayName(u),
            /** Told to the picker rather than inferred from a blank avatar or
             *  an odd name — a reviewer choosing between two similar names
             *  should be able to see which one is the archive-era stub. */
            skeleton: u.isSkeletonAccount === true,
        }))
        .filter(m => !!m.id)
        // Sorted here rather than in Mongo: the display name is a fallback
        // chain across four fields, so no single index could order it.
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'en-AU'))

    return NextResponse.json({ members })
}
