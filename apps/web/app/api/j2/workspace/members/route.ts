import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { hasPermission } from '@/lib/orbat/hasPermission'

// GET /api/j2/workspace/members
// Returns all J2 members (alphabetical) with workspace metadata:
// file count, doc count, most recent file/doc date, linked op count
export async function GET() {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || (await hasPermission(me, 'departmentLeads.j2'))
        || client.hasRoles(me, PERMISSIONS.pages.admin)
    if (!ok) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // All J2 members (active)
    const users = await Db.users
        .find({
            departments: 'j2',
            isSkeletonAccount: { $ne: true },
            discharged: { $exists: false },
        })
        .project({
            id: 1, username: 1, name: 1, globalName: 1,
            'guild.nickname': 1, 'guild.displayName': 1,
            'milpac.currentRank': 1,
            departmentRoleIds: 1,
        })
        .sort({ username: 1 })
        .toArray()

    if (!users.length) return NextResponse.json({ members: [] })

    const userIds = users.map(u => u.id)

    // Aggregate file counts + last upload per member
    const fileMeta = await Db.workspaceFiles
        .aggregate([
            { $match: { department: 'j2', memberId: { $in: userIds } } },
            { $group: { _id: '$memberId', fileCount: { $sum: 1 }, lastUpload: { $max: '$uploadedAt' } } },
        ])
        .toArray()

    const docMeta = await Db.workspaceDocs
        .aggregate([
            { $match: { department: 'j2', memberId: { $in: userIds }, deleted: { $ne: true } } },
            { $group: { _id: '$memberId', docCount: { $sum: 1 }, lastDoc: { $max: '$lastModifiedAt' } } },
        ])
        .toArray()

    // Operations owned by each J2 member (ownedBy = Discord user ID)
    const opMeta = await Db.operations
        .aggregate([
            { $match: { ownedBy: { $in: userIds }, deletedAt: { $exists: false } } },
            { $group: { _id: '$ownedBy', opCount: { $sum: 1 } } },
        ])
        .toArray()

    const fileMap = Object.fromEntries(fileMeta.map((f) => [(f as { _id: string })._id, f]))
    const docMap  = Object.fromEntries(docMeta.map((d) => [(d as { _id: string })._id, d]))
    const opMap   = Object.fromEntries(opMeta.map(o => [o._id, o]))

    // J2's leadership-slot DepartmentRoles — position labels are derived from
    // whether a member's departmentRoleIds includes the linked role for that
    // slot, replacing the legacy teamLeadDepts/dept2icRoles/dept3icRoles
    // arrays (frozen, no longer written).
    const j2Roles = await Db.departmentRoles.find({ department: 'j2' }).toArray()
    const leaderRoleId = j2Roles.find(r => r.linkedSlot === 'leader')?._id
    const secondRoleId = j2Roles.find(r => r.linkedSlot === '2ic')?._id
    const thirdRoleId  = j2Roles.find(r => r.linkedSlot === '3ic')?._id

    const members = users.map(u => {
        const displayName = u.name
            || u.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim()
            || u.globalName
            || u.username
            || u.id

        const fm = fileMap[u.id]
        const dm = docMap[u.id]
        const om = opMap[u.id]

        const lastActivity = [fm?.lastUpload, dm?.lastDoc].filter(Boolean).sort().reverse()[0] ?? null

        // Determine position label from DepartmentRole holdings
        const heldRoleIds = (u.departmentRoleIds ?? []).map(String)
        let position: string | null = null
        if (leaderRoleId && heldRoleIds.includes(String(leaderRoleId))) position = 'Department Leader'
        else if (secondRoleId && heldRoleIds.includes(String(secondRoleId))) position = 'Team Leader'
        else if (thirdRoleId && heldRoleIds.includes(String(thirdRoleId))) position = 'Creator Trainer'

        return {
            id: u.id,
            displayName,
            currentRank: u.milpac?.currentRank ?? null,
            position,
            fileCount:  fm?.fileCount  ?? 0,
            docCount:   dm?.docCount   ?? 0,
            opCount:    om?.opCount    ?? 0,
            lastActivity: lastActivity ? (lastActivity as Date).toISOString() : null,
        }
    })

    // Sort alphabetically by displayName
    members.sort((a, b) => a.displayName.localeCompare(b.displayName))

    return NextResponse.json({ members })
}
