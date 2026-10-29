import { NextRequest, NextResponse } from 'next/server'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification } from '@/lib/notifications'
import { logAction } from '@/lib/logAction'
import { findNextSelection } from '@/lib/training/find-next-selection'
import { allStepsDone, doneSteps } from '@/lib/recruitment/induction-pack'
import { loadInductionPack } from '@/lib/recruitment/induction-pack-db'

export const dynamic = 'force-dynamic'

/**
 * Row 213, Part D: the signed-in member's own induction. GET returns the
 * steps and their progress, and marks the induction opened the first time.
 * POST records a step done or undone, or registers interest in the next
 * Selection (Q4: interest only; J3 then adds them as a candidate).
 */

function displayName(me: User) {
    return me.guild?.nickname || me.globalName || me.username || 'Unknown'
}

async function view(userId: string) {
    const [config, progress, next] = await Promise.all([
        loadInductionPack(),
        Db.inductionProgress.findOne({ userId }),
        findNextSelection(),
    ])
    return {
        welcomeText: config.welcomeText,
        imageUrl: config.imageUrl ?? '',
        links: config.links,
        selectionText: config.selectionText,
        calendarUrl: config.calendarUrl,
        steps: config.steps,
        stepsDone: doneSteps(config, progress),
        completedAt: progress?.completedAt ?? null,
        selectionInterest: progress?.selectionInterest ?? null,
        next: next ? { at: next.at, instanceRef: next.instanceRef } : null,
    }
}

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    // Only the first open counts; members who were never sent the pack are not tracked until they act.
    await Db.inductionProgress.updateOne(
        { userId: me.id, openedAt: { $exists: false } },
        { $set: { openedAt: new Date() } },
    )
    return NextResponse.json(await view(me.id))
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: { action?: string; stepId?: string; done?: boolean }
    try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }

    const now = new Date()
    const name = displayName(me)
    const base = { $setOnInsert: { userId: me.id, openedAt: now }, $set: { userName: name } }

    if (body.action === 'step') {
        const config = await loadInductionPack()
        const step = config.steps.find(s => s.id === body.stepId)
        if (!step) return NextResponse.json({ error: 'No such step.' }, { status: 400 })
        await Db.inductionProgress.updateOne(
            { userId: me.id },
            body.done === false
                ? { ...base, $pull: { stepsDone: step.id } }
                : { ...base, $addToSet: { stepsDone: step.id } },
            { upsert: true },
        )
        // Completion is recorded once and kept, even if a step is later unticked or added.
        const progress = await Db.inductionProgress.findOne({ userId: me.id })
        if (progress && !progress.completedAt && allStepsDone(config, progress)) {
            await Db.inductionProgress.updateOne({ userId: me.id }, { $set: { completedAt: now } })
        }
        return NextResponse.json(await view(me.id))
    }

    if (body.action === 'selection-interest') {
        const existing = await Db.inductionProgress.findOne({ userId: me.id }, { projection: { selectionInterest: 1 } })
        if (existing?.selectionInterest) return NextResponse.json(await view(me.id))

        const next = await findNextSelection()
        const interest = { at: now, ...(next ? { instanceId: next.instanceId, instanceRef: next.instanceRef } : {}) }
        await Db.inductionProgress.updateOne(
            { userId: me.id },
            { ...base, $set: { ...base.$set, selectionInterest: interest } },
            { upsert: true },
        )

        const leads = await Db.users
            .find({ 'guild.roles': { $in: PERMISSIONS.departmentLeads.j3 } })
            .project<{ _id: string }>({ _id: 1 })
            .toArray()
        await Promise.all(leads.map(u => createNotification({
            userId: u._id.toString(),
            type: 'selection_interest',
            title: 'Selection interest',
            body: next
                ? `${name} registered interest in ${next.instanceRef}.`
                : `${name} registered interest in the next Selection (none is scheduled yet).`,
            actionUrl: '/dashboard/j3',
            relatedId: next?.instanceId,
        })))
        await logAction({
            action: 'j3.selection.interest',
            category: 'training',
            performedBy: me.id,
            performedByName: name,
            department: 'j3',
            entityType: 'courseInstance',
            entityId: next?.instanceId,
            target: next?.instanceRef ?? 'next Selection',
        })
        return NextResponse.json(await view(me.id))
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
