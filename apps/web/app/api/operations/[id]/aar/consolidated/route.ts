import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { can } from '@/lib/operations/permissions'
import { toBoardUser } from '@/lib/attendance/board-user'
import { canEditMissionAar, inCompanyHq, summariseFeedback, viewableSections } from '@/lib/operations/aar-access'
import { loadAarContext } from '@/lib/operations/aar-context'

/**
 * `GET /api/operations/{id}/aar/consolidated` — row 328's consolidated view.
 *
 * Opens once the viewer has saved their own report and feedback (J4 and the
 * mission maker skip that). In the staff order: the shared Mission AAR blocks
 * when switched on, each Call Sign's points for the sections this viewer may
 * read, the Mission Feedback averages, and the commendations. Raw points of a
 * section are never sent to someone who may not read that section.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })
    const operationId = new ObjectId(id)

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await can(me, 'aar.view'))) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const ctx = await loadAarContext(operationId, me)
    if (!ctx.open) return NextResponse.json({ error: 'The operation has not finished yet' }, { status: 403 })
    if (!ctx.unlocked) return NextResponse.json({ error: 'Save your own report and feedback first', locked: true }, { status: 403 })

    const sections = viewableSections(ctx.roster, me.id, ctx.standing)
    const [aars, feedback, blocks, commendations] = await Promise.all([
        sections.length ? Db.operationAars.find({ operationId, section: { $in: sections } }).toArray() : [],
        Db.operationFeedback.find({ operationId }).toArray(),
        ctx.missionAarEnabled ? Db.operationMissionAars.find({ operationId }).toArray() : [],
        Db.operationCommendations.find({ operationId }).sort({ createdAt: 1 }).toArray(),
    ])

    const ids = [...new Set(aars.map(a => a.userId))]
    const users = ids.length ? await Db.users.find({ id: { $in: ids } }).toArray() : []
    const names = new Map(users.map(u => [u.id, toBoardUser(u, u.id).displayName]))

    // Comments are the mission maker's to read, with the staff who run the night.
    const seesComments = ctx.standing.isMissionMaker || ctx.standing.isJ4 || ctx.standing.canManageAll || inCompanyHq(ctx.roster, me.id)
    const summary = summariseFeedback(feedback)

    return NextResponse.json({
        missionAar: ctx.missionAarEnabled
            ? sections.map(title => {
                const b = blocks.find(x => x.section === title)
                return {
                    section: title,
                    canEdit: canEditMissionAar(ctx.roster, me.id, title, ctx.standing),
                    situation: b?.situation ?? '',
                    missingCaptured: b?.missingCaptured ?? '',
                    vehicles: b?.vehicles ?? [],
                    updatedAt: b?.updatedAt ?? null,
                    updatedByName: b?.updatedByName ?? null,
                }
            })
            : null,
        callSigns: sections.map(title => ({
            section: title,
            entries: aars
                .filter(a => a.section === title)
                .map(a => ({ userId: a.userId, name: names.get(a.userId) ?? a.userId, fix: a.fix, improve: a.improve, sustain: a.sustain, writtenByName: a.writtenByName })),
        })),
        feedback: { ...summary, comments: seesComments ? summary.comments : null },
        commendations: commendations.map(c => ({
            id: String(c._id), authorName: c.authorName, authorSection: c.authorSection, targetType: c.targetType,
            targetName: c.targetName, wording: c.wording, createdAt: c.createdAt, mine: c.authorId === me.id,
        })),
        canDeleteAnyCommendation: ctx.standing.canManageAll || ctx.standing.isJ4 || ctx.standing.isMissionMaker,
    })
}
