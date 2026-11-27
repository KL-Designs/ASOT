import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

function storageDir(operationId: string) {
    return path.join('..', '..', 'storage', 'uploads', 'mission-files', operationId)
}

/** GET /api/operations/[id]/mission-files/[fileId] — download a mission file. J2 + J7 access. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isJ2 = client.hasRoles(me, ['J2 - Mission Creator', 'J2 - Team Leader', 'J2 - Department Leader', 'J2 - Creator Trainer'])
    const isJ7 = client.hasRoles(me, ['J7 - Team Leader', 'J7 - Department Leader', 'J7 - Assistant Team Leader', 'J4-Administration'])
    if (!isJ2 && !isJ7) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, fileId } = await params
    if (!ObjectId.isValid(fileId)) return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 })

    const doc = await Db.missionFiles.findOne({ _id: new ObjectId(fileId), operationId: id })
    if (!doc) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    const filePath = path.join(storageDir(id), doc.storedName)
    if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'File missing from storage' }, { status: 404 })

    const buffer = fs.readFileSync(filePath)
    const contentType = doc.ext === 'html' || doc.ext === 'htm' ? 'text/html' : 'application/octet-stream'

    return new NextResponse(buffer, {
        headers: {
            'Content-Type': contentType,
            'Content-Disposition': `attachment; filename="${doc.originalName}"`,
            'Content-Length': String(buffer.length),
        },
    })
}

/** DELETE /api/operations/[id]/mission-files/[fileId] — delete a file. J2 (uploader or lead) + J4. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isJ2Lead = client.hasRoles(me, ['J2 - Team Leader', 'J2 - Department Leader', 'J4-Administration'])
    const isJ2Member = client.hasRoles(me, ['J2 - Mission Creator', 'J2 - Creator Trainer'])
    if (!isJ2Lead && !isJ2Member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id, fileId } = await params
    if (!ObjectId.isValid(fileId)) return NextResponse.json({ error: 'Invalid file ID' }, { status: 400 })

    const doc = await Db.missionFiles.findOne({ _id: new ObjectId(fileId), operationId: id })
    if (!doc) return NextResponse.json({ error: 'File not found' }, { status: 404 })

    // J2 members can only delete their own uploads; leads can delete any
    if (!isJ2Lead && doc.uploadedById !== me.id) {
        return NextResponse.json({ error: 'You can only delete your own uploads' }, { status: 403 })
    }

    await Db.missionFiles.deleteOne({ _id: new ObjectId(fileId) })

    const filePath = path.join(storageDir(id), doc.storedName)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'mission-file.delete',
        category: 'operation',
        performedBy: me.id,
        performedByName: displayName,
        department: 'j2',
        entityType: 'mission-file',
        entityId: fileId,
        details: { operationId: id, originalName: doc.originalName },
    })

    return NextResponse.json({ ok: true })
}
