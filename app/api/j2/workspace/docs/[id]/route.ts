import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'
import { ObjectId } from 'mongodb'

async function requireJ2() {
    let me: User
    try { me = await client.fetchMe() } catch { return null }
    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return null
    return me
}

// PATCH /api/j2/workspace/docs/[id] — update title
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await requireJ2()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    let oid
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }

    const body = await req.json()
    const { title } = body

    const doc = await Db.workspaceDocs.findOne({ _id: oid, deleted: { $ne: true } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const displayName = me.guild?.displayName || me.globalName || me.username || me.id
    const updates: Record<string, unknown> = { lastModifiedBy: me.id, lastModifiedByName: displayName, lastModifiedAt: new Date() }
    if (title !== undefined) updates.title = title.trim() || 'Untitled Document'

    await Db.workspaceDocs.updateOne({ _id: oid }, { $set: updates })

    if (title !== undefined && title !== doc.title) {
        logAction({
            action: 'workspace.doc.edit',
            category: 'system',
            performedBy: me.id,
            performedByName: displayName,
            department: 'j2',
            entityId: id,
            target: title,
            before: doc.title,
            after: title,
            details: { memberId: doc.memberId, memberName: doc.memberName },
        }).catch(() => {})
    }

    return NextResponse.json({ ok: true })
}

// DELETE /api/j2/workspace/docs/[id] — soft-delete
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await requireJ2()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    let oid
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }

    const doc = await Db.workspaceDocs.findOne({ _id: oid, deleted: { $ne: true } })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isOwner = doc.createdBy === me.id || doc.memberId === me.id
    const isLead = client.hasRoles(me, PERMISSIONS.departmentLeads.j2) || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!isOwner && !isLead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const displayName = me.guild?.displayName || me.globalName || me.username || me.id
    await Db.workspaceDocs.updateOne({ _id: oid }, { $set: { deleted: true, deletedBy: me.id, deletedAt: new Date() } })

    logAction({
        action: 'workspace.doc.delete',
        category: 'system',
        performedBy: me.id,
        performedByName: displayName,
        department: 'j2',
        entityId: id,
        target: doc.title as string,
        details: { memberId: doc.memberId, memberName: doc.memberName },
    }).catch(() => {})

    return NextResponse.json({ ok: true })
}
