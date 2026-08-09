import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import fs from 'fs'
import path from 'path'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime']
const MAX_IMAGE_SIZE = 8 * 1024 * 1024   // 8 MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024  // 50 MB
const MAX_TOTAL_FILES = 10


export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const ticket = await Db.communityTickets.findOne({ _id: new ObjectId(id) })
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (ticket.authorId !== me.id && !isJ4) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (ticket.attachments.length + files.length > MAX_TOTAL_FILES) {
        return NextResponse.json({ error: `Maximum ${MAX_TOTAL_FILES} attachments allowed` }, { status: 400 })
    }

    const dir = path.resolve(`../../storage/uploads/community-tickets/${id}`)
    fs.mkdirSync(dir, { recursive: true })

    const saved: string[] = []
    const errors: string[] = []

    for (const file of files) {
        const isImage = ALLOWED_IMAGE_TYPES.includes(file.type)
        const isVideo = ALLOWED_VIDEO_TYPES.includes(file.type)

        if (!isImage && !isVideo) {
            errors.push(`${file.name}: unsupported file type`)
            continue
        }
        const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE
        if (file.size > maxSize) {
            errors.push(`${file.name}: exceeds size limit`)
            continue
        }

        const safeName = `${Date.now()}_${file.name.replace(/[^\w.\-() ]/g, '_')}`
        const dest = path.join(dir, safeName)
        if (!dest.startsWith(dir)) continue

        const buffer = Buffer.from(await file.arrayBuffer())
        fs.writeFileSync(dest, buffer)
        saved.push(safeName)
    }

    if (saved.length > 0) {
        await Db.communityTickets.updateOne(
            { _id: new ObjectId(id) },
            { $push: { attachments: { $each: saved } } }
        )
    }

    return NextResponse.json({ saved, errors })
}


export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { searchParams } = new URL(req.url)
    const file = searchParams.get('file')
    if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.communityTickets.manage)
    const ticket = await Db.communityTickets.findOne(
        { _id: new ObjectId(id) },
        { projection: { visibility: 1, isDeleted: 1 } }
    )
    if (!ticket) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.isDeleted && !isJ4) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (ticket.visibility === 'private' && !isJ4) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const dir = path.resolve(`../../storage/uploads/community-tickets/${id}`)
    const filePath = path.join(dir, file)
    if (!filePath.startsWith(dir) || !fs.existsSync(filePath)) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const data = fs.readFileSync(filePath)
    const ext = path.extname(file).toLowerCase()
    const mime =
        ext === '.mp4' ? 'video/mp4' :
        ext === '.webm' ? 'video/webm' :
        ext === '.gif' ? 'image/gif' :
        ext === '.png' ? 'image/png' :
        ext === '.webp' ? 'image/webp' :
        'image/jpeg'

    return new NextResponse(data, { headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=3600' } })
}
