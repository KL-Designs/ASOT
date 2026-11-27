import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

const ALLOWED_EXT = new Set(['pbo', 'html', 'htm', 'zip'])
const MAX_SIZE = 50 * 1024 * 1024 // 50 MB

function storageDir(operationId: string) {
    return path.join('..', '..', 'storage', 'uploads', 'mission-files', operationId)
}

/** GET /api/operations/[id]/mission-files — list uploaded files for an operation. J2 + J7 access. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isJ2 = client.hasRoles(me, ['J2 - Mission Creator', 'J2 - Team Leader', 'J2 - Department Leader', 'J2 - Creator Trainer'])
    const isJ7 = client.hasRoles(me, ['J7 - Team Leader', 'J7 - Department Leader', 'J7 - Assistant Team Leader', 'J4-Administration'])
    if (!isJ2 && !isJ7) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })

    const files = await Db.missionFiles
        .find({ operationId: id })
        .sort({ uploadedAt: -1 })
        .toArray()

    return NextResponse.json({ files: files.map(f => ({ ...f, _id: f._id!.toString() })) })
}

/** POST /api/operations/[id]/mission-files — upload a mission file. J2 only. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const isJ2 = client.hasRoles(me, ['J2 - Mission Creator', 'J2 - Team Leader', 'J2 - Department Leader', 'J2 - Creator Trainer', 'J4-Administration'])
    if (!isJ2) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid operation ID' }, { status: 400 })

    const operation = await Db.operations.findOne({ _id: new ObjectId(id) })
    if (!operation) return NextResponse.json({ error: 'Operation not found' }, { status: 404 })

    const formData = await req.formData().catch(() => null)
    if (!formData) return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })

    const file = formData.get('file') as File | null
    const note = (formData.get('note') as string | null)?.trim() || undefined

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    if (!ALLOWED_EXT.has(ext)) return NextResponse.json({ error: `File type .${ext} not allowed. Allowed: ${[...ALLOWED_EXT].join(', ')}` }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File exceeds 50 MB limit' }, { status: 400 })

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const buffer = Buffer.from(await file.arrayBuffer())

    // Version = count of prior uploads with same original name + 1
    const prior = await Db.missionFiles.countDocuments({ operationId: id, originalName: file.name })
    const version = prior + 1

    const fileId = crypto.randomUUID()
    const storedName = `${fileId}.${ext}`
    const dir = storageDir(id)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, storedName), buffer)

    const doc: Omit<MissionFileSubmission, '_id'> = {
        operationId: id,
        operationTitle: operation.title ?? '',
        originalName: file.name,
        storedName,
        ext,
        size: file.size,
        version,
        uploadedById: me.id,
        uploadedByName: displayName,
        uploadedAt: new Date(),
        ...(note ? { note } : {}),
    }

    const result = await Db.missionFiles.insertOne(doc as MissionFileSubmission)
    logAction({
        action: 'mission-file.upload',
        category: 'operation',
        performedBy: me.id,
        performedByName: displayName,
        department: 'j2',
        entityType: 'mission-file',
        entityId: result.insertedId.toString(),
        details: { operationId: id, operationTitle: operation.title, originalName: file.name, version },
    })

    return NextResponse.json({ file: { ...doc, _id: result.insertedId.toString() } })
}
