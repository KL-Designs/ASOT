import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { parseGoogleDocsZip } from '@/lib/training-docs/parse-gdocs-zip'
import { hasDashboardAccess } from '@/lib/orbat/hasDashboardAccess'

// GET /api/training-docs?parentId=xxx  — list items in a folder (or root)
export async function GET(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!(await hasDashboardAccess(me))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const isJ3 = client.hasRoles(me, PERMISSIONS.trainingDocs.manage)
    const parentIdParam = req.nextUrl.searchParams.get('parentId')
    const parentId = parentIdParam ? new ObjectId(parentIdParam) : null

    const items = await Db.trainingDocs
        .find({ parentId }, { projection: { htmlContent: 0, imageFiles: 0 } })
        .sort({ type: -1, name: 1 })   // folders first, then alphabetical
        .toArray()

    return NextResponse.json({ items, isJ3 })
}

// POST /api/training-docs
//   JSON  { type:'folder', name, parentId?, iconName?, color? }          — create folder
//   JSON  { type:'document', name, parentId?, iconName?, color? }        — create blank document
//   Form  { file:.zip, name, parentId? }                                 — upload Google Docs zip
export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingDocs.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const actorName = me.guild?.displayName ?? me.username
    const now = new Date()

    const contentType = req.headers.get('content-type') ?? ''

    // ── JSON body: create folder or blank document ──────────────────────────────
    if (contentType.includes('application/json')) {
        const body = await req.json().catch(() => ({}))
        const { type = 'folder', name, parentId: parentIdRaw, iconName, color } = body

        if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
        if (type !== 'folder' && type !== 'document') return NextResponse.json({ error: 'Invalid type' }, { status: 400 })

        const parentId = parentIdRaw ? new ObjectId(parentIdRaw) : null
        if (parentId) {
            const parent = await Db.trainingDocs.findOne({ _id: parentId })
            if (!parent || parent.type !== 'folder') return NextResponse.json({ error: 'Parent folder not found' }, { status: 404 })
        }

        const doc: Omit<TrainingDocItem, '_id'> = {
            type,
            name: name.trim(),
            parentId,
            createdAt: now,
            updatedAt: now,
            createdById: me.id,
            createdByName: actorName,
            ...(type === 'document' ? { htmlContent: '', imageFiles: [] } : {}),
            ...(iconName ? { iconName } : {}),
            ...(color    ? { color }    : {}),
        }

        const result  = await Db.trainingDocs.insertOne(doc)
        const created = await Db.trainingDocs.findOne({ _id: result.insertedId })
        return NextResponse.json(created, { status: 201 })
    }

    // ── Multipart: upload Google Docs zip ───────────────────────────────────────
    if (contentType.includes('multipart/form-data')) {
        const form       = await req.formData()
        const file       = form.get('file') as File | null
        const name       = (form.get('name') as string | null)?.trim()
        const parentIdRaw = form.get('parentId') as string | null

        if (!file)  return NextResponse.json({ error: 'No file provided' }, { status: 400 })
        if (!name)  return NextResponse.json({ error: 'Name is required' }, { status: 400 })
        if (!file.name.endsWith('.zip')) return NextResponse.json({ error: 'File must be a .zip' }, { status: 400 })

        const parentId = parentIdRaw ? new ObjectId(parentIdRaw) : null
        if (parentId) {
            const parent = await Db.trainingDocs.findOne({ _id: parentId })
            if (!parent || parent.type !== 'folder') return NextResponse.json({ error: 'Parent folder not found' }, { status: 404 })
        }

        // Insert placeholder first so we have an ID for image filenames
        const result = await Db.trainingDocs.insertOne({
            type: 'document',
            name,
            parentId,
            htmlContent: '',
            imageFiles: [],
            originalFileName: file.name,
            createdAt: now,
            updatedAt: now,
            createdById: me.id,
            createdByName: actorName,
        })

        const docId  = result.insertedId.toString()
        const buffer = Buffer.from(await file.arrayBuffer())

        try {
            const { htmlContent, imageFiles } = await parseGoogleDocsZip(buffer, docId)
            await Db.trainingDocs.updateOne(
                { _id: result.insertedId },
                { $set: { htmlContent, imageFiles, updatedAt: new Date() } }
            )
        } catch (err) {
            await Db.trainingDocs.deleteOne({ _id: result.insertedId })
            console.error('Training doc parse error:', err)
            return NextResponse.json({ error: 'Failed to parse zip file' }, { status: 422 })
        }

        const created = await Db.trainingDocs.findOne(
            { _id: result.insertedId },
            { projection: { htmlContent: 0, imageFiles: 0 } }
        )
        return NextResponse.json(created, { status: 201 })
    }

    return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 })
}
