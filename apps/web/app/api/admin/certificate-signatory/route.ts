import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'
import {
    SIGNATORY_SETTING_ID,
    SIGNATORY_CATEGORY,
    getSignatoryPosition,
    resolveSignatoryFor,
} from '@/lib/milpac-gen/signatory'

/**
 * Which ORBAT position signs rendered certificates.
 *
 * Stores only the position id, never the officer's name — the holder is
 * resolved at render time so a change of command needs no edit here.
 */

export const dynamic = 'force-dynamic'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [setting, positions, active] = await Promise.all([
        Db.siteSettings.findOne({ _id: SIGNATORY_SETTING_ID }).catch(() => null),
        Db.orbatPositions
            .find({ category: SIGNATORY_CATEGORY })
            .sort({ sectionOrder: 1, positionOrder: 1 })
            .toArray(),
        getSignatoryPosition(),
    ])

    // Resolve every slot's holder so the picker can show who each role is,
    // rather than a list of role names with no faces attached.
    const holders = await Promise.all(positions.map(p => resolveSignatoryFor(p)))

    return NextResponse.json({
        // null when nobody has chosen — the UI shows which slot is being used
        // by default via `activePositionId`.
        positionId: (setting as { positionId?: string } | null)?.positionId ?? null,
        activePositionId: active ? String(active._id) : null,
        signatory: await resolveSignatoryFor(active),
        positions: positions.map((p, i) => ({
            _id:    String(p._id),
            role:   p.role,
            holder: holders[i].signaturer
                ? `${holders[i].signaturerRankShort} ${holders[i].signaturer}`.trim()
                : null,
        })),
    })
}

export async function PUT(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { positionId?: string | null }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    const positionId = body.positionId || null

    // Only a real CHQ position, so a bad id can't silently unsign every
    // certificate the unit issues.
    if (positionId && !await getPositionInCategory(positionId)) {
        return NextResponse.json({ error: 'Unknown position' }, { status: 400 })
    }

    const before = await Db.siteSettings.findOne({ _id: SIGNATORY_SETTING_ID }).catch(() => null)

    await Db.siteSettings.updateOne(
        { _id: SIGNATORY_SETTING_ID },
        { $set: { positionId } },
        { upsert: true },
    )

    await logAction({
        action: 'orbat.certificateSignatory.set',
        category: 'orbat',
        performedBy: me.id,
        performedByName: me.name || me.username,
        before: { positionId: (before as { positionId?: string } | null)?.positionId ?? null },
        after:  { positionId },
    })

    return NextResponse.json({ ok: true })
}

async function getPositionInCategory(id: string) {
    const { ObjectId } = await import('mongodb')
    if (!ObjectId.isValid(id)) return null
    return Db.orbatPositions.findOne({ _id: new ObjectId(id), category: SIGNATORY_CATEGORY })
}
