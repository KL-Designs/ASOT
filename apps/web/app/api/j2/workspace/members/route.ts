import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

// GET /api/j2/workspace/members
// Returns all J2 members (alphabetical) with workspace metadata:
// file count, doc count, most recent file/doc date, linked op count
export async function GET() {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ok = client.hasRoles(me, PERMISSIONS.departments.j2)
        || client.hasRoles(me, PERMISSIONS.departmentLeads.j2)
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
            teamLeadDepts: 1, dept2icRoles: 1, dept3icRoles: 1,
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

        // Determine position label
        let position: string | null = null
        if (u.teamLeadDepts?.includes('j2')) position = 'Department Leader'
        else if (u.dept2icRoles?.includes('j2')) position = 'Team Leader'
        else if (u.dept3icRoles?.includes('j2')) position = 'Creator Trainer'

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
