import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { createNotification } from '@/lib/notifications'
import { sendFeedbackStatusDM } from '@/lib/discord/bot'

const VALID_STATUSES = ['open', 'in_progress', 'priority', 'investigating', 'fixed', 'implemented', 'wont_fix']

const STATUS_LABELS: Record<string, string> = {
    open: 'Open',
    in_progress: 'In Progress',
    priority: 'Priority',
    investigating: 'Investigating',
    fixed: 'Fixed',
    implemented: 'Implemented',
    wont_fix: "Won't Fix",
}


export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (!client.hasRoles(me, PERMISSIONS.feedback.manageStatus)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const body = await request.json()
    const { status } = body

    if (!VALID_STATUSES.includes(status)) {
        return NextResponse.json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
    }

    const item = await Db.feedback.findOne({ _id: new ObjectId(id) })
    if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await Db.feedback.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status, updatedAt: new Date() } }
    )

    // Notify the author if someone else changed the status
    if (item.authorId && item.authorId !== me.id) {
        const actionUrl = `/feedback/${id}`
        await createNotification({
            userId: item.authorId,
            type: 'task_assigned',
            title: 'Feedback status updated',
            body: `Your submission "${item.title}" has been marked as ${STATUS_LABELS[status] ?? status}`,
            actionUrl,
        })
        sendFeedbackStatusDM(item.authorId, item.title, status, actionUrl).catch(() => null)
    }

    return NextResponse.json({ success: true, status })
}
