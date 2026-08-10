import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { fetchAllGuildMembers, addGuildRole, removeGuildRole } from '@/lib/discord/bot'
import { applyTsServerGroups, getClientServerGroupIds } from '@/lib/teamspeak/groups'
import { logAction } from '@/lib/logs'
import { DEPT_ROLES } from '@/lib/discord/dept-roles'

// POST /api/admin/members/sync-dept — J4 only
// Full push reconciliation, NOT a Discord-discovery scan: for every current
// member of the department, computes the union of Discord role IDs /
// TeamSpeak group IDs their held DepartmentRoles (base + subs + leadership
// slot) say they should have, compares against their actual live Discord
// roles and TeamSpeak groups, and grants what's missing / revokes what's
// extra. Only ever touches an ID that appears as a grant on SOME
// DepartmentRole in this department's catalog, so unrelated Discord roles
// (rank, event roles, other departments' grants) are never touched. Never
// adds new members — membership changes only happen via the
// department-membership ticket flow.
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

    const [members, deptRoles, guildMembers] = await Promise.all([
        Db.users.find({ departments: department }).project<Pick<User, 'id' | 'departmentRoleIds' | 'teamspeak'>>({ id: 1, departmentRoleIds: 1, teamspeak: 1 }).toArray(),
        Db.departmentRoles.find({ department }).toArray(),
        fetchAllGuildMembers(),
    ])

    const guildRoleMap = new Map(guildMembers.map(m => [m.userId, new Set(m.roleIds)]))
    const managedDiscordIds = new Set(deptRoles.flatMap(r => r.discordRoleIds))
    const managedTsGroupIds = new Set(deptRoles.flatMap(r => r.tsGroupIds))
    const baseRole = deptRoles.find(r => r.isBase)
    const rolesById = new Map(deptRoles.map(r => [String(r._id), r]))

    let discordGranted = 0, discordRevoked = 0, tsGranted = 0, tsRevoked = 0

    await Promise.all(members.map(async member => {
        const heldRoles = [
            ...(baseRole ? [baseRole] : []),
            ...(member.departmentRoleIds ?? [])
                .map(id => rolesById.get(String(id)))
                .filter((r): r is DepartmentRole => !!r),
        ]
        const shouldHaveDiscord = new Set(heldRoles.flatMap(r => r.discordRoleIds))
        const shouldHaveTs = new Set(heldRoles.flatMap(r => r.tsGroupIds))

        const actualDiscord = guildRoleMap.get(member.id) ?? new Set<string>()
        const discordToGrant = [...shouldHaveDiscord].filter(id => !actualDiscord.has(id))
        const discordToRevoke = [...actualDiscord].filter(id => managedDiscordIds.has(id) && !shouldHaveDiscord.has(id))

        const cldbid = member.teamspeak?.cldbid
        const actualTs = cldbid ? new Set(await getClientServerGroupIds(cldbid)) : new Set<number>()
        const tsToGrant = [...shouldHaveTs].filter(id => !actualTs.has(id))
        const tsToRevoke = [...actualTs].filter(id => managedTsGroupIds.has(id) && !shouldHaveTs.has(id))

        discordGranted += discordToGrant.length
        discordRevoked += discordToRevoke.length
        tsGranted += tsToGrant.length
        tsRevoked += tsToRevoke.length

        await Promise.allSettled([
            ...discordToGrant.map(id => addGuildRole(member.id, id)),
            ...discordToRevoke.map(id => removeGuildRole(member.id, id)),
            tsToGrant.length ? applyTsServerGroups(member.id, 'add', tsToGrant) : Promise.resolve(),
            tsToRevoke.length ? applyTsServerGroups(member.id, 'remove', tsToRevoke) : Promise.resolve(),
        ])
    }))

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'member.department.sync',
        category: 'member',
        performedBy: me.id,
        performedByName,
        target: department.toUpperCase(),
        details: { department, membersChecked: members.length, discordGranted, discordRevoked, tsGranted, tsRevoked },
    }).catch(() => {})

    return NextResponse.json({ ok: true, membersChecked: members.length, discordGranted, discordRevoked, tsGranted, tsRevoked })
}
