import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { writeFile, unlink, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { logAction } from '@/lib/logAction'
import { randomUUID } from 'crypto'

const STORAGE_DIR = path.join(process.cwd(), '..', '..', 'storage', 'j2')

async function ensureDir() {
    if (!existsSync(STORAGE_DIR)) await mkdir(STORAGE_DIR, { recursive: true })
}

async function requireJ2() {
    let me: User
    try { me = await client.fetchMe() } catch { return null }
    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || (await hasPermission(me, 'departmentLeads.j2'))
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return null
    return me
}

// GET /api/j2/workspace/files?memberId=X — list files for a workspace member
export async function GET(req: NextRequest) {
    const me = await requireJ2()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const memberId = req.nextUrl.searchParams.get('memberId')
    const filter: Record<string, unknown> = { department: 'j2' }
    if (memberId) filter.memberId = memberId

    const files = await Db.workspaceFiles.find(filter).sort({ uploadedAt: -1 }).toArray()
    return NextResponse.json({ files: files.map((f: { _id: { toString: () => string } }) => ({ ...f, _id: f._id.toString() })) })
}

// POST /api/j2/workspace/files — upload a file
export async function POST(req: NextRequest) {
    const me = await requireJ2()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const memberId = formData.get('memberId') as string | null
    const memberName = formData.get('memberName') as string | null
    const description = (formData.get('description') as string | null) ?? ''

    if (!file || !memberId || !memberName) {
        return NextResponse.json({ error: 'file, memberId, and memberName are required' }, { status: 400 })
    }

    await ensureDir()

    const originalName = file.name
    const ext = path.extname(originalName).toLowerCase()
    const storedName = `${randomUUID()}${ext}`
    const filePath = path.join(STORAGE_DIR, storedName)

    const bytes = await file.arrayBuffer()
    await writeFile(filePath, Buffer.from(bytes))

    const displayName = me.guild?.displayName || me.globalName || me.username || me.id

    const doc = {
        memberId,
        memberName,
        department: 'j2',
        originalName,
        storedName,
        ext,
        size: file.size,
        uploadedBy: me.id,
        uploadedByName: displayName,
        uploadedAt: new Date(),
        description,
    }

    const result = await Db.workspaceFiles.insertOne(doc)

    logAction({
        action: 'workspace.file.upload',
        category: 'system',
        performedBy: me.id,
        performedByName: displayName,
        department: 'j2',
        entityId: result.insertedId.toString(),
        target: originalName,
        details: { memberId, memberName },
    }).catch(() => {})

    return NextResponse.json({ ok: true, id: result.insertedId.toString() })
}

// DELETE /api/j2/workspace/files?id=X — delete a file
export async function DELETE(req: NextRequest) {
    const me = await requireJ2()
    if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const { ObjectId } = await import('mongodb')
    let oid
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }

    const doc = await Db.workspaceFiles.findOne({ _id: oid })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isOwner = doc.uploadedBy === me.id || doc.memberId === me.id
    const isLead = (await hasPermission(me, 'departmentLeads.j2')) || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!isOwner && !isLead) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const filePath = path.join(STORAGE_DIR, doc.storedName as string)
    if (existsSync(filePath)) await unlink(filePath).catch(() => {})
    await Db.workspaceFiles.deleteOne({ _id: oid })

    const displayName = me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'workspace.file.delete',
        category: 'system',
        performedBy: me.id,
        performedByName: displayName,
        department: 'j2',
        entityId: id,
        target: doc.originalName as string,
        details: { memberId: doc.memberId, memberName: doc.memberName },
    }).catch(() => {})

    return NextResponse.json({ ok: true })
}
