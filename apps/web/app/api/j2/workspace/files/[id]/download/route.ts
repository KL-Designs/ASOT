import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'
import { readFile, access } from 'fs/promises'
import path from 'path'
import { ObjectId } from 'mongodb'

const STORAGE_DIR = path.join(process.cwd(), '..', '..', 'storage', 'j2')

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || (await hasPermission(me, 'departmentLeads.j2'))
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    let oid
    try { oid = new ObjectId(id) } catch { return NextResponse.json({ error: 'Invalid id' }, { status: 400 }) }

    const doc = await Db.workspaceFiles.findOne({ _id: oid })
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const filePath = path.join(STORAGE_DIR, doc.storedName as string)
    try { await access(filePath) } catch {
        return NextResponse.json({ error: 'File not found on server' }, { status: 404 })
    }

    const buffer = await readFile(filePath)
    return new NextResponse(buffer, {
        headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${doc.originalName}"`,
            'Content-Length': String(buffer.length),
        },
    })
}
