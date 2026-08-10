import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { logAction } from '@/lib/logAction'

async function requireJ2() {
    let me: User
    try { me = await client.fetchMe() } catch { return null }
    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || (await hasPermission(me, 'departmentLeads.j2'))
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return null
    return me
}

// GET /api/j2/workspace/docs?memberId=X — list docs for a workspace member
export async function GET(req: NextRequest) {
    const me = await requireJ2()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const memberId = req.nextUrl.searchParams.get('memberId')
    const filter: Record<string, unknown> = { department: 'j2', deleted: { $ne: true } }
    if (memberId) filter.memberId = memberId

    const docs = await Db.workspaceDocs
        .find(filter, { projection: { yjsState: 0 } }) // exclude binary state from list
        .sort({ lastModifiedAt: -1 })
        .toArray()
    return NextResponse.json({ docs: docs.map((d: { _id: { toString: () => string } }) => ({ ...d, _id: d._id.toString() })) })
}

// POST /api/j2/workspace/docs — create a new document
export async function POST(req: NextRequest) {
    const me = await requireJ2()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { memberId, memberName, title } = await req.json()
    if (!memberId || !memberName) {
        return NextResponse.json({ error: 'memberId and memberName required' }, { status: 400 })
    }

    const displayName = me.guild?.displayName || me.globalName || me.username || me.id
    const now = new Date()

    const doc = {
        memberId,
        memberName,
        department: 'j2',
        title: title?.trim() || 'Untitled Document',
        createdBy: me.id,
        createdByName: displayName,
        createdAt: now,
        lastModifiedBy: me.id,
        lastModifiedByName: displayName,
        lastModifiedAt: now,
        deleted: false,
    }

    const result = await Db.workspaceDocs.insertOne(doc)

    logAction({
        action: 'workspace.doc.create',
        category: 'system',
        performedBy: me.id,
        performedByName: displayName,
        department: 'j2',
        entityId: result.insertedId.toString(),
        target: doc.title,
        details: { memberId, memberName },
    }).catch(() => {})

    return NextResponse.json({ ok: true, id: result.insertedId.toString(), doc: { ...doc, _id: result.insertedId.toString() } })
}
