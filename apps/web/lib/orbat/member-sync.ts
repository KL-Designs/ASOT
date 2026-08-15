import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { DEPT_CODES } from '@/lib/discord/dept-codes'
import { fetchAllGuildMembers, addGuildRole, removeGuildRole } from '@/lib/discord/bot'
import { getClientServerGroupIds, applyTsServerGroups } from '@/lib/teamspeak/groups'
import { getGroupCache, getConnection } from '@/lib/teamspeak/cache'

export interface GrantDetail {
    id: string | number
    name: string
    source: string
}

export interface MemberSyncEntry {
    userId: string
    name: string
    avatarURL: string
    onRoster: boolean
    status: 'red' | 'orange' | 'green'
    discord: { missing: GrantDetail[]; extra: GrantDetail[] }
    teamspeak: { missing: GrantDetail[]; extra: GrantDetail[]; linked: boolean }
}

export interface MemberSyncReport {
    onRoster: MemberSyncEntry[]
    offRoster: MemberSyncEntry[]
    tsAvailable: boolean
}

interface GrantBundle {
    discordRoleIds: string[]
    tsGroupIds: number[]
    source: string
}

/** Merges every contributing bundle into one expected-ID set per grant type,
 *  keeping a list of every source that contributed each ID (a Discord role
 *  or TS group can legitimately be granted by more than one source at once —
 *  e.g. a department base role AND an ORBAT role both listing it). */
function mergeBundles(bundles: GrantBundle[]) {
    const discordIds = new Set<string>()
    const tsIds = new Set<number>()
    const discordSource = new Map<string, string[]>()
    const tsSource = new Map<number, string[]>()

    for (const b of bundles) {
        for (const id of b.discordRoleIds) {
            discordIds.add(id)
            discordSource.set(id, [...(discordSource.get(id) ?? []), b.source])
        }
        for (const id of b.tsGroupIds) {
            tsIds.add(id)
            tsSource.set(id, [...(tsSource.get(id) ?? []), b.source])
        }
    }
    return { discordIds, tsIds, discordSource, tsSource }
}

/** `missing` = expected but not actually held. `extra` = actually held, part
 *  of the managed-ID universe (so we know some Role/Group catalog cares about
 *  it), but not currently expected from anything. IDs outside the managed
 *  universe (unrelated Discord roles, rank roles, etc.) are never reported. */
function diffIds<T extends string | number>(
    expected: Set<T>,
    managed: Set<T>,
    actual: Set<T>,
    sourceById: Map<T, string[]>,
    nameById: Map<T, string>,
): { missing: GrantDetail[]; extra: GrantDetail[] } {
    const missing: GrantDetail[] = [...expected]
        .filter(id => !actual.has(id))
        .map(id => ({ id, name: nameById.get(id) ?? String(id), source: (sourceById.get(id) ?? []).join('; ') }))

    const extra: GrantDetail[] = [...actual]
        .filter(id => managed.has(id) && !expected.has(id))
        .map(id => ({ id, name: nameById.get(id) ?? String(id), source: 'Not expected from any current department or ORBAT role' }))

    return { missing, extra }
}

function statusFor(discord: MemberSyncEntry['discord'], teamspeak: MemberSyncEntry['teamspeak']): MemberSyncEntry['status'] {
    if (discord.missing.length || teamspeak.missing.length) return 'red'
    if (discord.extra.length || teamspeak.extra.length) return 'orange'
    return 'green'
}

/** Preconditions: caller has already resolved `client.fetchMe()` (so
 *  `client.roles` is populated — see `lib/discord/index.ts`'s `rolesReady`).
 *  Throws if `fetchAllGuildMembers()` fails (e.g. no `DISCORD_BOT_TOKEN`) —
 *  same fail-hard behaviour as the existing `sync-dept` route; callers
 *  should let it propagate to a 500, not swallow it. */
export async function computeMemberSyncReport(): Promise<MemberSyncReport> {
    let tsAvailable = true
    try {
        await getConnection()
    } catch {
        tsAvailable = false
    }

    const [users, departmentRoles, orbatRoles, orbatPositions, orbatSectionMeta, guildMembers] = await Promise.all([
        Db.users.find({ discharged: { $exists: false } })
            .project<Pick<User, 'id' | 'name' | 'globalName' | 'username' | 'avatarURL' | 'guild' | 'departments' | 'departmentRoleIds' | 'teamspeak'>>(
                { id: 1, name: 1, globalName: 1, username: 1, avatarURL: 1, guild: 1, departments: 1, departmentRoleIds: 1, teamspeak: 1 },
            )
            .toArray(),
        Db.departmentRoles.find({}).toArray(),
        Db.orbatRoles.find({}).toArray(),
        Db.orbatPositions.find({ userId: { $ne: null } }).toArray(),
        Db.orbatSectionMeta.find({}).toArray(),
        fetchAllGuildMembers(),
    ])

    const managedDiscordIds = new Set<string>([
        ...departmentRoles.flatMap(r => r.discordRoleIds),
        ...orbatRoles.flatMap(r => r.discordRoleIds),
        ...orbatSectionMeta.map(m => m.discordRoleId).filter((id): id is string => !!id),
    ])
    const managedTsGroupIds = new Set<number>([
        ...departmentRoles.flatMap(r => r.tsGroupIds),
        ...orbatRoles.flatMap(r => r.tsGroupIds),
        ...orbatSectionMeta.map(m => m.tsGroupId).filter((id): id is number => typeof id === 'number'),
    ])

    const guildRoleMap = new Map(guildMembers.map(m => [m.userId, new Set(m.roleIds)]))
    const roleNameById = new Map(client.roles.map(r => [r.id, r.name]))
    const tsGroupCache = getGroupCache()
    const tsGroupNameById = new Map((tsGroupCache?.groups ?? []).map(g => [g.id, g.name]))

    const positionByUserId = new Map(orbatPositions.filter(p => p.userId).map(p => [p.userId as string, p]))
    const orbatRoleById = new Map(orbatRoles.map(r => [String(r._id), r]))
    const deptRoleById = new Map(departmentRoles.map(r => [String(r._id), r]))
    const deptBaseByDept = new Map(departmentRoles.filter(r => r.isBase).map(r => [r.department, r]))
    const sectionMetaByKey = new Map(orbatSectionMeta.map(m => [`${m.category}:${m.sectionTitle ?? ''}`, m]))

    function bundlesFor(user: typeof users[number]): GrantBundle[] {
        const bundles: GrantBundle[] = []

        for (const dept of user.departments ?? []) {
            const base = deptBaseByDept.get(dept)
            if (base) bundles.push({ discordRoleIds: base.discordRoleIds, tsGroupIds: base.tsGroupIds, source: `Department: ${dept.toUpperCase()} base role` })
        }
        for (const id of user.departmentRoleIds ?? []) {
            const role = deptRoleById.get(String(id))
            if (role && (user.departments ?? []).includes(role.department)) {
                bundles.push({ discordRoleIds: role.discordRoleIds, tsGroupIds: role.tsGroupIds, source: `Department: ${role.name}` })
            }
        }

        const position = positionByUserId.get(user.id)
        if (position) {
            if (position.roleId) {
                const role = orbatRoleById.get(String(position.roleId))
                if (role) bundles.push({ discordRoleIds: role.discordRoleIds, tsGroupIds: role.tsGroupIds, source: `ORBAT: ${role.name}` })
            }
            const categoryMeta = sectionMetaByKey.get(`${position.category}:`)
            if (categoryMeta) {
                bundles.push({
                    discordRoleIds: categoryMeta.discordRoleId ? [categoryMeta.discordRoleId] : [],
                    tsGroupIds: typeof categoryMeta.tsGroupId === 'number' ? [categoryMeta.tsGroupId] : [],
                    source: `ORBAT category: ${position.category}`,
                })
            }
            if (position.sectionTitle) {
                const sectionMeta = sectionMetaByKey.get(`${position.category}:${position.sectionTitle}`)
                if (sectionMeta) {
                    bundles.push({
                        discordRoleIds: sectionMeta.discordRoleId ? [sectionMeta.discordRoleId] : [],
                        tsGroupIds: typeof sectionMeta.tsGroupId === 'number' ? [sectionMeta.tsGroupId] : [],
                        source: `ORBAT section: ${position.sectionTitle}`,
                    })
                }
            }
        }

        return bundles
    }

    async function buildEntry(user: typeof users[number]): Promise<MemberSyncEntry> {
        const { discordIds, tsIds, discordSource, tsSource } = mergeBundles(bundlesFor(user))

        const actualDiscord = guildRoleMap.get(user.id) ?? new Set<string>()
        const cldbid = user.teamspeak?.cldbid
        const actualTs = (cldbid && tsAvailable) ? new Set(await getClientServerGroupIds(cldbid)) : new Set<number>()

        const discordDiff = diffIds(discordIds, managedDiscordIds, actualDiscord, discordSource, roleNameById)
        const teamspeakDiff = (cldbid && tsAvailable)
            ? diffIds(tsIds, managedTsGroupIds, actualTs, tsSource, tsGroupNameById)
            : { missing: [], extra: [] }

        const onRoster = (user.departments?.length ?? 0) > 0 || positionByUserId.has(user.id)
        const teamspeak = { ...teamspeakDiff, linked: !!cldbid }

        return {
            userId: user.id,
            name: user.guild?.nickname || user.guild?.displayName || user.globalName || user.username || user.id,
            avatarURL: user.avatarURL,
            onRoster,
            status: statusFor(discordDiff, teamspeak),
            discord: discordDiff,
            teamspeak,
        }
    }

    const entries = await Promise.all(users.map(buildEntry))

    return {
        onRoster: entries.filter(e => e.onRoster),
        offRoster: entries.filter(e => !e.onRoster),
        tsAvailable,
    }
}

export interface MemberSyncApplyResult {
    membersChecked: number
    discordGranted: number
    discordRevoked: number
    discordFailed: number
    tsGranted: number
    tsRevoked: number
    tsFailed: number
}

const APPLY_BATCH_SIZE = 5

/** Re-runs computeMemberSyncReport() (fresh live Discord/TeamSpeak state,
 *  never trusts a diff computed earlier in the request lifecycle) and grants
 *  / revokes whatever each target member's fresh diff says. `userIds`
 *  omitted = every currently out-of-sync member; provided = only those
 *  (used for both the per-member Sync button and Sync All). Processes
 *  members in small batches (not one giant Promise.all) to avoid bursting
 *  past Discord's rate limit — `botRequest` has no retry/backoff of its own.
 *  Counts reflect actual settled outcomes, not attempts: a rejected
 *  addGuildRole/removeGuildRole counts as failed, not granted/revoked.
 *  TeamSpeak counts are best-effort — applyTsServerGroups() itself doesn't
 *  expose per-group success/failure (it internally allSettles and always
 *  reports {skipped:false} once it reaches the server), so a TS grant/revoke
 *  batch counts as fully successful or fully failed together. */
export async function applyMemberSyncFixes(userIds?: string[]): Promise<MemberSyncApplyResult> {
    const report = await computeMemberSyncReport()
    const allEntries = [...report.onRoster, ...report.offRoster]
    const targets = userIds
        ? allEntries.filter(e => userIds.includes(e.userId))
        : allEntries.filter(e => e.status !== 'green')

    let discordGranted = 0, discordRevoked = 0, discordFailed = 0
    let tsGranted = 0, tsRevoked = 0, tsFailed = 0

    for (let i = 0; i < targets.length; i += APPLY_BATCH_SIZE) {
        const batch = targets.slice(i, i + APPLY_BATCH_SIZE)

        await Promise.all(batch.map(async entry => {
            const discordToGrant = entry.discord.missing.map(g => String(g.id))
            const discordToRevoke = entry.discord.extra.map(g => String(g.id))
            const tsToGrant = entry.teamspeak.missing.map(g => Number(g.id))
            const tsToRevoke = entry.teamspeak.extra.map(g => Number(g.id))

            const [grantResults, revokeResults, tsGrantResult, tsRevokeResult] = await Promise.all([
                Promise.allSettled(discordToGrant.map(id => addGuildRole(entry.userId, id))),
                Promise.allSettled(discordToRevoke.map(id => removeGuildRole(entry.userId, id))),
                tsToGrant.length ? applyTsServerGroups(entry.userId, 'add', tsToGrant) : Promise.resolve(null),
                tsToRevoke.length ? applyTsServerGroups(entry.userId, 'remove', tsToRevoke) : Promise.resolve(null),
            ])

            for (const r of grantResults) r.status === 'fulfilled' ? discordGranted++ : discordFailed++
            for (const r of revokeResults) r.status === 'fulfilled' ? discordRevoked++ : discordFailed++

            if (tsToGrant.length) {
                if (tsGrantResult && !tsGrantResult.skipped) tsGranted += tsToGrant.length
                else tsFailed += tsToGrant.length
            }
            if (tsToRevoke.length) {
                if (tsRevokeResult && !tsRevokeResult.skipped) tsRevoked += tsToRevoke.length
                else tsFailed += tsToRevoke.length
            }
        }))
    }

    return { membersChecked: targets.length, discordGranted, discordRevoked, discordFailed, tsGranted, tsRevoked, tsFailed }
}
