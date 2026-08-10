import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { fetchAllGuildMembers } from '@/lib/discord/bot'
import { logAction } from '@/lib/logs'
import { DEPT_ROLES, applyBaseDepartmentRoleSync } from '@/lib/discord/dept-roles'

// POST /api/admin/members/sync-dept — J4 only
// Reads current Discord guild members for the given department's roles and
// adds any matched DB users who are missing from the department / lead list.
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j4)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const department = (body?.department as string | undefined)?.toLowerCase()

    if (!department || !DEPT_ROLES[department]) {
        return NextResponse.json({ error: 'Invalid department.' }, { status: 400 })
    }

    const mapping = DEPT_ROLES[department]

    // Resolve Discord role IDs from the DB
    const [memberRole, leadRole] = await Promise.all([
        Db.roles.findOne({ name: mapping.member }),
        mapping.lead ? Db.roles.findOne({ name: mapping.lead }) : Promise.resolve(null),
    ])

    if (!memberRole?.id) {
        return NextResponse.json({ error: `Discord role "${mapping.member}" not found in DB.` }, { status: 500 })
    }

    const memberRoleId = memberRole.id
    const leadRoleId = leadRole?.id ?? null

    // Fetch all guild members from Discord
    const guildMembers = await fetchAllGuildMembers()

    // Build sets of Discord user IDs that hold each role
    const memberRoleHolders = new Set(
        guildMembers.filter(m => m.roleIds.includes(memberRoleId)).map(m => m.userId)
    )
    const leadRoleHolders = leadRoleId
        ? new Set(guildMembers.filter(m => m.roleIds.includes(leadRoleId)).map(m => m.userId))
        : new Set<string>()

    // Fetch all DB users who are in the Discord guild members list (match by id field)
    const holderIds = [...new Set([...memberRoleHolders, ...leadRoleHolders])]
    const dbUsers = holderIds.length > 0
        ? await Db.users.find({ id: { $in: holderIds } }).toArray()
        : []

    let membersAdded = 0
    let leadsAdded = 0

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    for (const user of dbUsers) {
        const hasMemberRole = memberRoleHolders.has(user.id)
        const hasLeadRole = leadRoleHolders.has(user.id)
        const isAlreadyMember = user.departments?.includes(department) ?? false
        const isAlreadyLead = user.teamLeadDepts?.includes(department) ?? false

        const setOps: Record<string, unknown> = {}
        const addToSetOps: Record<string, unknown> = {}

        if (hasMemberRole && !isAlreadyMember) {
            addToSetOps.departments = department
            membersAdded++
        }
        if (hasLeadRole && !isAlreadyLead) {
            addToSetOps.teamLeadDepts = department
            // Ensure they're also in departments
            if (!hasMemberRole && !isAlreadyMember) {
                addToSetOps.departments = department
                membersAdded++
            }
            leadsAdded++
        }

        if (Object.keys(addToSetOps).length > 0 || Object.keys(setOps).length > 0) {
            const update: Record<string, unknown> = {}
            if (Object.keys(addToSetOps).length > 0) update.$addToSet = addToSetOps
            if (Object.keys(setOps).length > 0) update.$set = setOps
            await Db.users.updateOne({ id: user.id }, update)

            if (addToSetOps.departments) {
                applyBaseDepartmentRoleSync(user.id, department, 'add').catch(err =>
                    console.error('[members/sync-dept] base-role sync failed:', err)
                )
            }
        }
    }

    logAction({
        action: 'member.department.sync',
        category: 'member',
        performedBy: me.id,
        performedByName,
        target: department.toUpperCase(),
        details: { department, membersAdded, leadsAdded, guildMembersScanned: guildMembers.length },
    }).catch(() => {})

    return NextResponse.json({ ok: true, membersAdded, leadsAdded, scanned: guildMembers.length })
}
