import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { logAction } from '@/lib/logAction'
import { sanitiseObjective } from '@/lib/j2/objective-suggestions'
import { objectiveAccess, toObjectiveView } from '@/lib/j2/objective-access'

/**
 * `PATCH` edits one objective suggestion (anybody in J2 — mission makers tidy
 * the pool as they use it). `DELETE` removes one (J2 leads).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await objectiveAccess(me)).canEdit) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    const _id = new ObjectId(id)

    const { fields, error } = sanitiseObjective(await req.json().catch(() => ({})), true)
    if (error) return NextResponse.json({ error }, { status: 400 })
    if (!Object.keys(fields).length) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })

    const name = me.guild?.displayName || me.globalName || me.username || me.id
    const result = await Db.objectiveSuggestions.findOneAndUpdate(
        { _id },
        { $set: { ...fields, updatedAt: new Date(), updatedByName: name } },
        { returnDocument: 'after' },
    )
    if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    logAction({
        action: 'j2.objective.update', category: 'system', department: 'j2',
        performedBy: me.id, performedByName: name,
        entityType: 'objective_suggestion', entityId: id, target: result.name,
        details: { changed: Object.keys(fields) },
    }).catch(console.error)

    return NextResponse.json(toObjectiveView(result))
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await objectiveAccess(me)).canConfirm) return NextResponse.json({ error: 'Only J2 leads can remove a suggestion.' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const existing = await Db.objectiveSuggestions.findOne({ _id: new ObjectId(id) })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await Db.objectiveSuggestions.deleteOne({ _id: existing._id })

    logAction({
        action: 'j2.objective.delete', category: 'system', department: 'j2',
        performedBy: me.id, performedByName: me.guild?.displayName || me.globalName || me.username || me.id,
        entityType: 'objective_suggestion', entityId: id, target: existing.name,
        // Kept in the log, since the entry itself is gone.
        before: { name: existing.name, overview: existing.overview, intel: existing.intel, linkedIntel: existing.linkedIntel, comments: existing.comments },
    }).catch(console.error)

    return NextResponse.json({ ok: true })
}
