import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import fs from 'fs'
import path from 'path'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'


export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const item = await Db.feedback.findOne({ _id: new ObjectId(id) })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const comments = await Db.feedbackComments
        .find({ feedbackId: new ObjectId(id) })
        .sort({ createdAt: 1 })
        .toArray()

    const isJ4 = client.hasRoles(me, PERMISSIONS.feedback.manageStatus)

    return NextResponse.json({ ...item, comments, isJ4, myId: me.id })
}


export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const item = await Db.feedback.findOne({ _id: new ObjectId(id) })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const isJ4 = client.hasRoles(me, PERMISSIONS.feedback.manageStatus)
    if (item.authorId !== me.id && !isJ4) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await Db.feedback.deleteOne({ _id: new ObjectId(id) })
    await Db.feedbackComments.deleteMany({ feedbackId: new ObjectId(id) })

    const dir = path.resolve(`./uploads/feedback/${id}`)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true })

    return NextResponse.json({ success: true })
}
