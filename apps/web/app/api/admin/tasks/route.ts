import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { createNotification } from '@/lib/notifications'
import { sendTaskAssignedDM } from '@/lib/discord/bot'

// Roles that grant broad (all-member) task assignment access
const BROAD_ASSIGN_ROLES = ['HQ Staff', 'All Staff', 'J4-Administration']

// Roles each department staff are permitted to assign tasks to
const DEPT_ASSIGNABLE_ROLES: Record<string, string[]> = {
    j1: ['J1-Staff', 'J1-Recruiting'],
    j2: ['J2-Mission Making', 'J2-Team Lead'],
    j3: ['J3-Training', 'J3-Team Lead'],
    j4: ['J4-Administration'],
    j5: ['J5-Media'],
    j6: ['J6-Game Master', 'J6-Department Lead'],
    j7: ['J7 Community Development', 'J7 Staff'],
}

// GET /api/admin/tasks
// ?view=mine|created|all  (default: mine)
// ?includeCompleted=true  (default: false)
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
        createdAt:        t.createdAt instanceof Date        ? t.createdAt.toISOString()        : t.createdAt,
        dueDate:          t.dueDate instanceof Date          ? t.dueDate.toISOString()          : (t.dueDate ?? null),
        originalDueDate:  t.originalDueDate instanceof Date  ? t.originalDueDate.toISOString()  : (t.originalDueDate ?? null),
        extendedAt:       t.extendedAt instanceof Date       ? t.extendedAt.toISOString()       : (t.extendedAt ?? null),
        completedAt:      t.completedAt instanceof Date      ? t.completedAt.toISOString()      : (t.completedAt ?? null),
        startedAt:        t.startedAt instanceof Date        ? t.startedAt.toISOString()        : (t.startedAt ?? null),
        reminderDateTime: t.reminderDateTime instanceof Date ? t.reminderDateTime.toISOString() : (t.reminderDateTime ?? null),
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
    const {
        title, description,
        assignedTo, assignedToName,
        assignedRole,
        dueDate, reminderDateTime,
        department,
        type, actionUrl, relatedId,
    } = body

    // ── Validation ────────────────────────────────────────────────────────────

    if (!title?.trim()) {
        return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }
    if (!assignedTo && !assignedRole) {
        return NextResponse.json({ error: 'Must assign to a member or a role' }, { status: 400 })
    }
    if (!dueDate) {
        return NextResponse.json({ error: 'Due Date & Time is required' }, { status: 400 })
    }
    const dueDateObj = new Date(dueDate)
    if (isNaN(dueDateObj.getTime())) {
        return NextResponse.json({ error: 'Invalid due date' }, { status: 400 })
    }

    let reminderDateObj: Date | undefined
    if (reminderDateTime) {
        reminderDateObj = new Date(reminderDateTime)
        if (isNaN(reminderDateObj.getTime())) {
            return NextResponse.json({ error: 'Invalid reminder date' }, { status: 400 })
        }
        if (reminderDateObj > dueDateObj) {
            return NextResponse.json({ error: 'Reminder date must be before or on the due date' }, { status: 400 })
        }
    }

    // ── Permission check: validate role assignment scope ──────────────────────

    const myRoleNames = client.roles
        .filter(r => (me.guild?.roles ?? []).includes(r.id))
        .map(r => r.name)

    const hasBroadAccess = myRoleNames.some(r => BROAD_ASSIGN_ROLES.includes(r))

    if (assignedRole && !hasBroadAccess) {
        // Compute which roles this user may assign to
        const userDepts = Object.entries(DEPT_ASSIGNABLE_ROLES)
            .filter(([, roles]) => myRoleNames.some(r => roles.includes(r)))
            .map(([dept]) => dept)
        const allowed = userDepts.flatMap(d => DEPT_ASSIGNABLE_ROLES[d] ?? [])

        if (!allowed.includes(assignedRole)) {
            return NextResponse.json({ error: 'You do not have permission to assign tasks to that role' }, { status: 403 })
        }
    }

    // ── Build task document ───────────────────────────────────────────────────

    const assignerName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const task: Omit<Task, '_id'> = {
        title: title.trim(),
        ...(description?.trim() ? { description: description.trim() } : {}),
        ...(assignedTo ? { assignedTo, assignedToName: assignedToName ?? assignedTo } : {}),
        ...(assignedRole ? { assignedRole } : {}),
        assignedBy: me.id,
        assignedByName: assignerName,
        dueDate: dueDateObj,
        ...(reminderDateObj ? { reminderDateTime: reminderDateObj } : {}),
        ...(department ? { department } : {}),
        ...(type ? { type } : {}),
        ...(actionUrl ? { actionUrl } : {}),
        ...(relatedId ? { relatedId } : {}),
        status: 'pending',
        createdAt: new Date(),
    }

    const result = await Db.tasks.insertOne(task as Task)
    const taskId = result.insertedId.toString()

    // ── Notifications ─────────────────────────────────────────────────────────

    const dmBody = title.trim()
    // Deep-link: opens My Tasks tab and auto-expands this specific task
    const dmUrl  = `/dashboard/tasks?taskId=${taskId}`

    // Notify the specific member
    if (assignedTo) {
        await createNotification({
            userId: assignedTo,
            type: 'task_assigned',
            title: 'New task assigned to you',
            body: dmBody,
            actionUrl: dmUrl,
            relatedId: taskId,
        })
        sendTaskAssignedDM(assignedTo, dmBody, description?.trim() ?? '', dmUrl).catch(err =>
            console.error('[tasks] DM failed for', assignedTo, err)
        )
    }

    // Notify role members — skip anyone already notified as the direct assignee
    if (assignedRole) {
        const roleMembers = await Db.users
            .find({ 'guild.roles': assignedRole, discharged: { $exists: false }, isSkeletonAccount: { $ne: true } })
            .project<{ _id: string; id: string }>({ _id: 1, id: 1 })
            .toArray()

        // Exclude the specific member to prevent duplicate notifications
        const toNotify = roleMembers.filter(u => u.id !== assignedTo)

        if (toNotify.length > 0) {
            const notifDocs = toNotify.map(u => ({
                userId: u._id.toString(),
                type: 'task_assigned' as NotificationType,
                title: `New task assigned to ${assignedRole}`,
                body: dmBody,
                actionUrl: dmUrl,
                relatedId: taskId,
                createdAt: new Date(),
            } as Notification))
            await Db.notifications.insertMany(notifDocs).catch(err =>
                console.error('[tasks] bulk role notifications failed:', err)
            )
            for (const u of toNotify) {
                sendTaskAssignedDM(u.id.toString(), dmBody, description?.trim() ?? '', dmUrl).catch(err =>
                    console.error('[tasks] DM failed for role member', u.id, err)
                )
            }
        }
    }

    return NextResponse.json({ ok: true, id: taskId })
}
