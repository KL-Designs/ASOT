import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { CERTIFICATIONS } from '@/lib/military/certifications'
import { RANK_GROUPS } from '@/lib/military/ranks'
import { RESERVIST_CATEGORY_IDS } from '@/lib/orbat/constants'
import { applyOrbatMove } from '@/lib/orbat/move'
import { createNotification, createNotificationForRole } from '@/lib/notifications'
import { syncDeptDiscordRole, applyBaseDepartmentRoleSync, revokeDepartmentSubRoles, assignLeadershipSlot, unassignLeadershipSlot, DEPT_ROLES } from '@/lib/discord/dept-roles'
import type { LeadershipSlot } from '@/lib/discord/dept-codes'

// Maps ticket department → role(s) that should be notified
const TICKET_NOTIFY_ROLES: Record<string, string[]> = {
    j3: ['J3-Team Lead'],
    j4: ['J4-Administration'],
}

const VALID_QUALIFICATIONS = CERTIFICATIONS.map(c => c.label) as string[]
const VALID_RANKS = RANK_GROUPS.flatMap(g => g.ranks.map(r => r.name))

// GET /api/admin/tickets — list tickets, optionally filtered
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

    const { searchParams } = req.nextUrl
    const filter: Record<string, unknown> = {}
    const department = searchParams.get('department')
    const status = searchParams.get('status')
    const issuedById = searchParams.get('issuedById')
    const requiredApproverUserId = searchParams.get('requiredApproverUserId')

    if (department) filter.department = department
    if (status) filter.status = status
    if (issuedById) filter.issuedById = issuedById
    if (requiredApproverUserId) filter.requiredApproverUserId = requiredApproverUserId

    const raw = await Db.tickets
        .find(filter)
        .sort({ issuedAt: -1 })
        .toArray()

    const tickets = raw.map(t => ({ ...t, _id: t._id!.toString() }))

    return NextResponse.json({ tickets })
}

// POST /api/admin/tickets — create a new ticket
export async function POST(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // All admin-page users (including All Staff) may submit tickets
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { type } = body

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    // ── J3 Promotion ──────────────────────────────────────────────────────────
    if (type === 'j3-promotion') {
        if (!client.hasRoles(me, PERMISSIONS.departments.j3)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const { action, proposedRank, targetUserId, targetUserName, notes } = body

        if (!action || !proposedRank || !targetUserId || !targetUserName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        if (action !== 'promote' && action !== 'demote') {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
        }

        if (!VALID_RANKS.includes(proposedRank)) {
            return NextResponse.json({ error: 'Invalid rank' }, { status: 400 })
        }

        const ticket: Omit<Ticket, '_id'> = {
            type: 'j3-promotion',
            department: 'j4',
            status: 'open',
            action,
            proposedRank,
            targetUserId,
            targetUserName,
            issuedById: me.id,
            issuedByName: displayName,
            issuedAt: new Date(),
            ...(notes?.trim() ? { notes: notes.trim() } : {}),
        }

        const result = await Db.tickets.insertOne(ticket as Ticket)
        await createNotificationForRole('J4-Administration', {
            type: 'task_assigned',
            title: 'New promotion ticket',
            body: `${action === 'promote' ? 'Promotion' : 'Demotion'} request for ${targetUserName} — ${proposedRank}`,
            actionUrl: '/dashboard/unit/tickets',
            relatedId: result.insertedId.toString(),
        })
        return NextResponse.json({ ok: true, id: result.insertedId.toString() })
    }

    // ── Move Request ──────────────────────────────────────────────────────────
    if (type === 'move-request') {
        const { fromPositionId, toPositionId, toIsReservist, targetUserId, targetUserName, notes } = body

        if (!fromPositionId || !targetUserId || !targetUserName) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }
        if (!toIsReservist && !toPositionId) {
            return NextResponse.json({ error: 'Missing destination position' }, { status: 400 })
        }

        // Fetch from position
        let fromId: ObjectId
        try { fromId = new ObjectId(fromPositionId) } catch {
            return NextResponse.json({ error: 'Invalid fromPositionId' }, { status: 400 })
        }
        const fromPos = await Db.orbatPositions.findOne({ _id: fromId })
        if (!fromPos) return NextResponse.json({ error: 'Source position not found' }, { status: 404 })
        if (fromPos.userId !== targetUserId) {
            return NextResponse.json({ error: 'Member is not in the specified source position' }, { status: 400 })
        }

        const fromIsReservist = RESERVIST_CATEGORY_IDS.includes(fromPos.category)

        // Fetch to position (if not moving to reservist)
        let toPos: OrbatPosition | null = null
        if (!toIsReservist) {
            let toId: ObjectId
            try { toId = new ObjectId(toPositionId) } catch {
                return NextResponse.json({ error: 'Invalid toPositionId' }, { status: 400 })
            }
            toPos = await Db.orbatPositions.findOne({ _id: toId })
            if (!toPos) return NextResponse.json({ error: 'Destination position not found' }, { status: 404 })
            if (toPos.userId !== null) {
                return NextResponse.json({ error: 'Destination position is already occupied' }, { status: 409 })
            }
        }

        // Find section leaders
        const sourceLeaderPos = fromIsReservist ? null : await Db.orbatPositions.findOne({
            category: fromPos.category,
            sectionTitle: fromPos.sectionTitle,
            positionOrder: 0,
        })
        const destLeaderPos = (toIsReservist || !toPos) ? null : await Db.orbatPositions.findOne({
            category: toPos.category,
            sectionTitle: toPos.sectionTitle,
            positionOrder: 0,
        })

        const isSourceLeader = !fromIsReservist && sourceLeaderPos?.userId === me.id
        const isDestLeader = !toIsReservist && destLeaderPos?.userId === me.id

        // Determine approval routing
        let autoApprove = false
        let requiredApproverUserId: string | undefined
        let requiredApproverName: string | undefined

        if (fromIsReservist && isDestLeader) {
            autoApprove = true
        } else if (toIsReservist && isSourceLeader) {
            autoApprove = true
        } else if (isSourceLeader && !toIsReservist) {
            // Moving my member to another section — destination leader must approve
            if (!destLeaderPos?.userId) {
                return NextResponse.json({ error: 'The destination section has no active leader to approve this move.' }, { status: 400 })
            }
            requiredApproverUserId = destLeaderPos.userId
        } else if (isDestLeader && !fromIsReservist) {
            // Pulling member from another section — source leader must approve
            if (!sourceLeaderPos?.userId) {
                return NextResponse.json({ error: 'The source section has no active leader to approve this move.' }, { status: 400 })
            }
            requiredApproverUserId = sourceLeaderPos.userId
        } else {
            return NextResponse.json({ error: 'Only section leaders may submit move requests involving their section.' }, { status: 403 })
        }

        // Look up approver display name
        if (requiredApproverUserId) {
            const approverUser = await Db.users.findOne({ id: requiredApproverUserId })
            requiredApproverName = approverUser
                ? (approverUser.guild?.nickname || approverUser.guild?.displayName || approverUser.globalName || approverUser.username || requiredApproverUserId)
                : requiredApproverUserId
        }

        const now = new Date()

        const ticket: Omit<Ticket, '_id'> = {
            type: 'move-request',
            department: 'allstaff',
            status: autoApprove ? 'actioned' : 'open',
            targetUserId,
            targetUserName,
            issuedById: me.id,
            issuedByName: displayName,
            issuedAt: now,
            fromPositionId: fromPos._id.toString(),
            fromSectionTitle: fromPos.sectionTitle,
            fromCategory: fromPos.category,
            fromPositionRole: fromPos.role,
            fromIsReservist,
            toPositionId: toPos ? toPos._id.toString() : null,
            toSectionTitle: toPos?.sectionTitle ?? '',
            toCategory: toPos?.category ?? 'activeReservist',
            toPositionRole: toPos?.role ?? '',
            toIsReservist: toIsReservist ?? false,
            ...(requiredApproverUserId ? { requiredApproverUserId, requiredApproverName } : {}),
            ...(notes?.trim() ? { notes: notes.trim() } : {}),
            ...(autoApprove ? { actionedById: me.id, actionedByName: displayName, actionedAt: now } : {}),
        }

        const result = await Db.tickets.insertOne(ticket as Ticket)

        if (autoApprove) {
            await applyOrbatMove({ fromPos, toPos, toIsReservist: toIsReservist ?? false, targetUserId })
        } else if (requiredApproverUserId) {
            await createNotification({
                userId: requiredApproverUserId,
                type: 'task_assigned',
                title: 'Move request requires your approval',
                body: `${displayName} submitted a move request for ${targetUserName}`,
                actionUrl: '/dashboard/unit/tickets',
                relatedId: result.insertedId.toString(),
            })
        }

        return NextResponse.json({
            ok: true,
            id: result.insertedId.toString(),
            autoApproved: autoApprove,
            requiredApproverName: requiredApproverName ?? null,
        })
    }

    // ── J4 Discharge ──────────────────────────────────────────────────────────
    if (type === 'j4-discharge') {
        // Any admin-page user may initiate; J4 must approve

        const { targetUserId, targetUserName, dischargeType, dischargeReason, notes } = body

        if (!targetUserId || !targetUserName || !dischargeType || !dischargeReason?.trim()) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }
        if (dischargeType !== 'honorable' && dischargeType !== 'general' && dischargeType !== 'dishonorable') {
            return NextResponse.json({ error: 'Invalid dischargeType' }, { status: 400 })
        }
        if (targetUserId === me.id) {
            return NextResponse.json({ error: 'Cannot discharge yourself' }, { status: 400 })
        }

        const ticket: Omit<Ticket, '_id'> = {
            type: 'j4-discharge',
            department: 'j4',
            status: 'open',
            targetUserId,
            targetUserName,
            issuedById: me.id,
            issuedByName: displayName,
            issuedAt: new Date(),
            dischargeType,
            dischargeReason: dischargeReason.trim(),
            ...(notes?.trim() ? { notes: notes.trim() } : {}),
        }

        const result = await Db.tickets.insertOne(ticket as Ticket)
        await createNotificationForRole('J4-Administration', {
            type: 'task_assigned',
            title: 'New discharge ticket',
            body: `${dischargeType === 'honorable' ? 'Honourable' : dischargeType === 'general' ? 'General' : 'Dishonourable'} discharge request for ${targetUserName}`,
            actionUrl: '/dashboard/unit/tickets',
            relatedId: result.insertedId.toString(),
        })
        return NextResponse.json({ ok: true, id: result.insertedId.toString() })
    }

    // ── Discipline ────────────────────────────────────────────────────────────
    if (type === 'discipline') {
        // Any authenticated admin-page user can submit a discipline ticket
        const { targetUserId, targetUserName, disciplineReason, notes } = body

        if (!targetUserId || !targetUserName || !disciplineReason?.trim()) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }
        if (targetUserId === me.id) {
            return NextResponse.json({ error: 'Cannot file a discipline ticket against yourself' }, { status: 400 })
        }

        const ticket: Omit<Ticket, '_id'> = {
            type: 'discipline',
            department: 'allstaff',
            status: 'open',
            targetUserId,
            targetUserName,
            issuedById: me.id,
            issuedByName: displayName,
            issuedAt: new Date(),
            disciplineReason: disciplineReason.trim(),
            ...(notes?.trim() ? { notes: notes.trim() } : {}),
        }

        const result = await Db.tickets.insertOne(ticket as Ticket)
        await createNotificationForRole('J4-Administration', {
            type: 'task_assigned',
            title: 'New discipline ticket',
            body: `Discipline report filed against ${targetUserName} by ${displayName}`,
            actionUrl: '/dashboard/unit/tickets',
            relatedId: result.insertedId.toString(),
        })
        return NextResponse.json({ ok: true, id: result.insertedId.toString() })
    }

    // ── Department Membership ─────────────────────────────────────────────────
    if (type === 'department-membership') {
        const { targetUserId, targetUserName, deptCode, memberAction } = body
        const validDepts = Object.keys(DEPT_ROLES)
        const validActions = ['add', 'remove', 'set-lead', 'remove-lead', 'set-2ic', 'remove-2ic', 'set-3ic', 'remove-3ic']

        if (!targetUserId || !targetUserName || !validDepts.includes(deptCode) || !validActions.includes(memberAction)) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }

        const leadRoles = PERMISSIONS.departmentLeads[deptCode as keyof typeof PERMISSIONS.departmentLeads]
        if (!client.hasRoles(me, leadRoles)) {
            return NextResponse.json({ error: 'Access Denied' }, { status: 403 })
        }

        const now = new Date()

        // Leadership slots (leader/2ic/3ic) are DepartmentRole holdings, not
        // flat arrays — see lib/discord/dept-roles.ts's assignLeadershipSlot/
        // unassignLeadershipSlot, which handle their own Discord/TeamSpeak
        // sync internally (including auto-granting base membership on
        // assign). Awaited directly, unlike the add/remove sync calls below,
        // since a "no role linked to this slot yet" failure needs to reach
        // the caller as a 400 rather than being silently logged.
        const slotForAction: Partial<Record<string, LeadershipSlot>> = {
            'set-lead': 'leader', 'remove-lead': 'leader',
            'set-2ic': '2ic', 'remove-2ic': '2ic',
            'set-3ic': '3ic', 'remove-3ic': '3ic',
        }
        const slot = slotForAction[memberAction]
        if (slot) {
            try {
                if (memberAction.startsWith('set-')) {
                    await assignLeadershipSlot(targetUserId, deptCode, slot)
                } else {
                    await unassignLeadershipSlot(targetUserId, deptCode, slot)
                }
            } catch (err) {
                return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update position' }, { status: 400 })
            }
        } else if (memberAction === 'add') {
            await Db.users.updateOne({ id: targetUserId }, { $addToSet: { departments: deptCode } })
        } else if (memberAction === 'remove') {
            await Db.users.updateOne({ id: targetUserId }, { $pull: { departments: deptCode } })
        }

        if (memberAction === 'add' || memberAction === 'remove') {
            syncDeptDiscordRole(targetUserId, deptCode, memberAction).catch(err =>
                console.error('[tickets] dept Discord role sync failed:', err)
            )
        }

        // Base department role — implicit for every member of this department,
        // never stored per-user. Stacks on top of the section-level Discord
        // sync above, same pattern as ORBAT's role-level grants.
        if (memberAction === 'add' || memberAction === 'remove') {
            applyBaseDepartmentRoleSync(targetUserId, deptCode, memberAction).catch(err =>
                console.error('[tickets] dept base-role sync failed:', err)
            )
        }
        if (memberAction === 'remove') {
            revokeDepartmentSubRoles(targetUserId, deptCode).catch(err =>
                console.error('[tickets] dept sub-role cleanup failed:', err)
            )
        }

        // Log as pre-actioned ticket
        const ticket: Omit<Ticket, '_id'> = {
            type: 'department-membership',
            department: deptCode as Ticket['department'],
            status: 'actioned',
            targetUserId,
            targetUserName,
            issuedById: me.id,
            issuedByName: displayName,
            issuedAt: now,
            actionedById: me.id,
            actionedByName: displayName,
            actionedAt: now,
            deptCode,
            memberAction,
        }
        const result = await Db.tickets.insertOne(ticket as Ticket)
        return NextResponse.json({ ok: true, id: result.insertedId.toString() })
    }

    // ── Performance Report ────────────────────────────────────────────────────
    if (type === 'performance-report') {
        const { targetUserId, targetUserName, performanceReason, notes } = body

        if (!targetUserId || !targetUserName || !performanceReason?.trim()) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
        }
        if (targetUserId === me.id) {
            return NextResponse.json({ error: 'Cannot file a performance report against yourself' }, { status: 400 })
        }

        const ticket: Omit<Ticket, '_id'> = {
            type: 'performance-report',
            department: 'j4',
            status: 'open',
            targetUserId,
            targetUserName,
            issuedById: me.id,
            issuedByName: displayName,
            issuedAt: new Date(),
            performanceReason: performanceReason.trim(),
            ...(notes?.trim() ? { notes: notes.trim() } : {}),
        }

        const result = await Db.tickets.insertOne(ticket as Ticket)
        await createNotificationForRole('J4-Administration', {
            type: 'task_assigned',
            title: 'New performance report',
            body: `Performance report filed against ${targetUserName} by ${displayName}`,
            actionUrl: '/dashboard/unit/tickets',
            relatedId: result.insertedId.toString(),
        })
        return NextResponse.json({ ok: true, id: result.insertedId.toString() })
    }

    // ── J3 Qualification (default) ────────────────────────────────────────────
    if (!client.hasRoles(me, PERMISSIONS.departments.j3)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { action, qualification, targetUserId, targetUserName, notes } = body

    if (!action || !qualification || !targetUserId || !targetUserName) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (action !== 'add' && action !== 'remove') {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (!VALID_QUALIFICATIONS.includes(qualification)) {
        return NextResponse.json({ error: 'Invalid qualification' }, { status: 400 })
    }

    const ticket: Omit<Ticket, '_id'> = {
        type: 'j3-qualification',
        department: 'j3',
        status: 'open',
        action,
        qualification,
        targetUserId,
        targetUserName,
        issuedById: me.id,
        issuedByName: displayName,
        issuedAt: new Date(),
        ...(notes?.trim() ? { notes: notes.trim() } : {}),
    }

    const result = await Db.tickets.insertOne(ticket as Ticket)
    await createNotificationForRole('J3-Team Lead', {
        type: 'task_assigned',
        title: `New qualification ticket`,
        body: `${action === 'add' ? 'Add' : 'Remove'} ${qualification} for ${targetUserName}`,
        actionUrl: '/dashboard/unit/tickets',
        relatedId: result.insertedId.toString(),
    })

    return NextResponse.json({ ok: true, id: result.insertedId.toString() })
}

