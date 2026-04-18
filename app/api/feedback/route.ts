import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import fs from 'fs'
import path from 'path'
import Db from '@/lib/mongo'
import client from '@/lib/discord'

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILES = 5
const MAX_FILE_SIZE = 5 * 1024 * 1024


export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const type = searchParams.get('type')

    const filter: Record<string, unknown> = {}
    if (status && status !== 'all') filter.status = status
    if (type && type !== 'all') filter.type = type

    const items = await Db.feedback
        .find(filter)
        .sort({ upvoteCount: -1, createdAt: -1 })
        .toArray()

    return NextResponse.json(items)
}


export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()

    const title = (formData.get('title') as string | null)?.trim()
    const type = formData.get('type') as string | null
    const description = (formData.get('description') as string | null)?.trim()

    if (!title || !type || !description) {
        return NextResponse.json({ error: 'title, type, and description are required' }, { status: 400 })
    }
    if (type !== 'bug' && type !== 'feature') {
        return NextResponse.json({ error: 'type must be bug or feature' }, { status: 400 })
    }

    const files = formData.getAll('attachments') as File[]
    if (files.length > MAX_FILES) {
        return NextResponse.json({ error: `Maximum ${MAX_FILES} attachments allowed` }, { status: 400 })
    }
    for (const f of files) {
        if (!ALLOWED_TYPES.includes(f.type)) {
            return NextResponse.json({ error: 'Only JPEG, PNG, and WebP images are allowed' }, { status: 400 })
        }
        if (f.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'Each file must be under 5 MB' }, { status: 400 })
        }
    }

    const _id = new ObjectId()
    const now = new Date()

    const doc: Feedback = {
        _id,
        title,
        type,
        description,
        status: 'open',
        authorId: me.id,
        authorName: me.guild.displayName ?? me.username,
        createdAt: now,
        updatedAt: now,
        attachments: [],
        upvotes: [],
        upvoteCount: 0,
        commentCount: 0,
    }

    await Db.feedback.insertOne(doc)

    const savedFilenames: string[] = []
    if (files.length > 0) {
        const dir = path.resolve(`./uploads/feedback/${_id.toString()}`)
        fs.mkdirSync(dir, { recursive: true })

        for (const file of files) {
            const safeName = file.name.replace(/[^\w.\-() ]/g, '_')
            const dest = path.join(dir, safeName)
            if (!dest.startsWith(dir)) continue
            const buffer = Buffer.from(await file.arrayBuffer())
            fs.writeFileSync(dest, buffer)
            savedFilenames.push(safeName)
        }

        if (savedFilenames.length > 0) {
            await Db.feedback.updateOne({ _id }, { $set: { attachments: savedFilenames } })
            doc.attachments = savedFilenames
        }
    }

    return NextResponse.json(doc, { status: 201 })
}
