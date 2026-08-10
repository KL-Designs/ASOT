import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { logAction } from '@/lib/logAction'
import { ObjectId } from 'mongodb'

async function requireJ2() {
    let me: User
    try { me = await client.fetchMe() } catch { return null }
    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || (await hasPermission(me, 'departmentLeads.j2'))
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return null
    return me
}

// POST /api/j2/workspace/docs/[id]/versions/[versionId]/restore
// Body: { mode: 'overwrite' | 'copy' }
//   overwrite — restore into the existing doc (clears its yjsState, fresh from version's snapshot)
//   copy      — create a new doc with the version's content
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; versionId: string }> }
) {
    const me = await requireJ2()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, versionId } = await params
    let oid, vId
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid doc id' }, { status: 400 }) }
    try { vId = new ObjectId(versionId) } catch { return NextResponse.json({ error: 'Invalid version id' }, { status: 400 }) }

    const doc = await Db.workspaceDocs.findOne({ _id: oid, deleted: { $ne: true } })
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })

    const version = await Db.workspaceVersions.findOne({ _id: vId, docId: id })
    if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 })

    const body = await req.json()
    const mode: 'overwrite' | 'copy' = body.mode === 'copy' ? 'copy' : 'overwrite'

    const displayName = me.guild?.displayName || me.globalName || me.username || me.id
    const now = new Date()

    if (mode === 'overwrite') {
        // Clear the yjsState so the next collab open starts fresh from blank
        // and load the version's contentSnapshot as plaintext.
        // Hocuspocus will use the cleared state and the editor re-initialises.
        await Db.workspaceDocs.updateOne(
            { _id: oid },
            { $set: { yjsState: null, lastModifiedBy: me.id, lastModifiedByName: displayName, lastModifiedAt: now, restoredFromVersion: versionId } }
        )

        // Record a new version snapshot marking the restore
        await Db.workspaceVersions.insertOne({
            docId: id,
            docTitle: doc.title as string,
            contentSnapshot: version.contentSnapshot as string,
            savedBy: me.id,
            savedByName: displayName,
            savedAt: now,
            label: `Restored from ${(version.label as string) || `version ${(version.savedAt as Date).toLocaleDateString('en-AU')}`}`,
            restoreOf: versionId,
        })

        logAction({
            action: 'workspace.version.restore',
            category: 'system',
            performedBy: me.id,
            performedByName: displayName,
            department: 'j2',
            entityId: id,
            target: doc.title as string,
            details: { memberId: doc.memberId, memberName: doc.memberName, versionId, restoreMode: 'overwrite', versionLabel: version.label ?? null },
        }).catch(() => {})

        return NextResponse.json({ ok: true, mode: 'overwrite' })
    } else {
        // Create a new document as a copy
        const copyTitle = `${doc.title} (restored copy)`
        const newDoc = {
            memberId: doc.memberId as string,
            memberName: doc.memberName as string,
            department: 'j2',
            title: copyTitle,
            yjsState: null,
            createdBy: me.id,
            createdByName: displayName,
            createdAt: now,
            lastModifiedBy: me.id,
            lastModifiedByName: displayName,
            lastModifiedAt: now,
            deleted: false,
            restoredFromVersion: versionId,
            restoredFromDoc: id,
        }
        const newResult = await Db.workspaceDocs.insertOne(newDoc)
        const newDocId = newResult.insertedId.toString()

        // Save initial version snapshot for the copy
        await Db.workspaceVersions.insertOne({
            docId: newDocId,
            docTitle: copyTitle,
            contentSnapshot: version.contentSnapshot as string,
            savedBy: me.id,
            savedByName: displayName,
            savedAt: now,
            label: `Initial — restored from "${doc.title}"`,
            restoreOf: versionId,
        })

        logAction({
            action: 'workspace.version.restore',
            category: 'system',
            performedBy: me.id,
            performedByName: displayName,
            department: 'j2',
            entityId: newDocId,
            target: copyTitle,
            details: { memberId: doc.memberId, memberName: doc.memberName, versionId, restoreMode: 'copy', originalDocId: id, versionLabel: version.label ?? null },
        }).catch(() => {})

        return NextResponse.json({ ok: true, mode: 'copy', newDocId })
    }
}
