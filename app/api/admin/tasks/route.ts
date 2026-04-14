import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification, createNotificationForRole } from '@/lib/notifications'

// GET /api/admin/tasks
// ?view=mine|created|all  (default: mine)
// ?includeCompleted=true  (default: false — excludes completed tasks)
export async function GET(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const view = req.nextUrl.searchParams.get('view') ?? 'mine'
    const includeCompleted = req.nextUrl.searchParams.get('includeCompleted') === 'true'

    // Resolve role IDs → role names for assignedRole matching
    const myRoleNames = client.roles
        .filter(r => (me.guild?.roles ?? []).includes(r.id))
        .map(r => r.name)

    let filter: Record<string, unknown>

    if (view === 'created') {
        filter = { assignedBy: me.id }
    } else if (view === 'all') {
        // All-tasks view requires elevated permissions
        if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        filter = {}
    } else {
        // 'mine' — assigned directly to me OR to a role I hold
        filter = {
            $or: [
                { assignedTo: me.id },
                ...(myRoleNames.length > 0 ? [{ assignedRole: { $in: myRoleNames } }] : []),
            ],
        }
    }

    if (!includeCompleted) {
        filter = { ...filter, completedAt: { $exists: false } }
    }

    const raw = await Db.tasks
        .find(filter)
        .sort({ completedAt: 1, createdAt: -1 })
        .toArray()

    const tasks = raw.map(t => ({
        ...t,
        _id: t._id!.toString(),
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : t.createdAt,
        dueDate: t.dueDate instanceof Date ? t.dueDate.toISOString() : (t.dueDate ?? null),
        originalDueDate: t.originalDueDate instanceof Date ? t.originalDueDate.toISOString() : (t.originalDueDate ?? null),
        extendedAt: t.extendedAt instanceof Date ? t.extendedAt.toISOString() : (t.extendedAt ?? null),
        completedAt: t.completedAt instanceof Date ? t.completedAt.toISOString() : (t.completedAt ?? null),
    }))

    return NextResponse.json({ tasks })
}

// POST /api/admin/tasks — create a new task
export async function POST(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { title, description, assignedTo, assignedToName, assignedRole, dueDate, department, type, actionUrl, relatedId } = body

    if (!title?.trim()) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (!assignedTo && !assignedRole) {
        return NextResponse.json({ error: 'Must assign to a member or a role' }, { status: 400 })
    }

    const assignerName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const task: Omit<Task, '_id'> = {
        title: title.trim(),
        ...(description?.trim() ? { description: description.trim() } : {}),
        ...(assignedTo ? { assignedTo, assignedToName: assignedToName ?? assignedTo } : {}),
        ...(assignedRole ? { assignedRole } : {}),
        assignedBy: me.id,
        assignedByName: assignerName,
        ...(dueDate ? { dueDate: new Date(dueDate) } : {}),
        ...(department ? { department } : {}),
        ...(type ? { type } : {}),
        ...(actionUrl ? { actionUrl } : {}),
        ...(relatedId ? { relatedId } : {}),
        status: 'pending',
        createdAt: new Date(),
    }

    const result = await Db.tasks.insertOne(task as Task)
    const taskId = result.insertedId.toString()

    // Notify assignee(s)
    if (assignedTo) {
        await createNotification({
            userId: assignedTo,
            type: 'task_assigned',
            title: 'New task assigned to you',
            body: title.trim(),
            actionUrl: actionUrl ?? '/admin/tasks',
            relatedId: taskId,
        })
    } else if (assignedRole) {
        await createNotificationForRole(assignedRole, {
            type: 'task_assigned',
            title: `New task assigned to ${assignedRole}`,
            body: title.trim(),
            actionUrl: actionUrl ?? '/admin/tasks',
            relatedId: taskId,
        })
    }

    return NextResponse.json({ ok: true, id: taskId })
}
