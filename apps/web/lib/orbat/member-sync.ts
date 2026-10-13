import Db from '@/lib/mongo'
import client from '@/lib/discord'
import { fetchAllGuildMembers, addGuildRole, removeGuildRole } from '@/lib/discord/bot'
import { getClientServerGroupIds, applyTsServerGroups } from '@/lib/teamspeak/groups'
import { getConnection } from '@/lib/teamspeak/cache'

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

// The per-member rules for *what* is owed live in grant-bundles.ts — pure,
// and unit-tested without a database or a TeamSpeak connection. This file
// stays responsible for loading the catalogs, reading actual state, and
// diffing the two.
import { grantBundlesFor, type GrantBundle, type GrantCatalog } from './grant-bundles'
// What a member's MILPAC owes them on TeamSpeak — rank, awards, campaigns,
// certifications. Also pure; this file supplies the live group list and links.
import { buildResolver, milpacBundles, milpacSubject, type MilpacResolver } from '@/lib/teamspeak/milpac-groups'

/**
 * Every TeamSpeak group the sync may take away from this member: the ones a
 * department, ORBAT role or section carries, plus the rank groups. Awards,
 * campaigns and certifications are deliberately absent — see milpac-groups.ts.
 *
 * Rank groups are only included for a member whose own rank resolves to a
 * group. Somebody with no rank on their MILPAC, or a rank nothing is mapped
 * to, would otherwise have every rank group they hold read as "extra" and be
 * stripped to nothing — the site not knowing a rank is not a reason to remove
 * the one TeamSpeak has.
 */
function managedTsIds(
    departmentRoles: DepartmentRole[],
    orbatRoles: OrbatRole[],
    orbatSectionMeta: OrbatSectionMeta[],
    resolver: MilpacResolver,
    rank: string | null | undefined,
): Set<number> {
    const rankKnown = !!rank && resolver.groupIds('rank', rank).length > 0
    return new Set<number>([
        ...departmentRoles.flatMap(r => r.tsGroupIds),
        ...orbatRoles.flatMap(r => r.tsGroupIds),
        ...orbatSectionMeta.map(m => m.tsGroupId).filter((id): id is number => typeof id === 'number'),
        ...(rankKnown ? resolver.rankGroupIds : []),
    ])
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
        .map(id => ({ id, name: nameById.get(id) ?? String(id), source: 'Not expected from any current department, ORBAT role or rank' }))

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
    // Resolved directly from the live connection rather than getGroupCache() —
    // that cache is only warmed by the periodic cron job or a visit to the
    // TeamSpeak clients page, so relying on it here left group names showing
    // as raw sgid numbers whenever this ran before either had populated it.
    let tsGroupNameById = new Map<number, string>()
    let tsGroups: { id: number; name: string }[] = []
    try {
        const ts = await getConnection()
        const allGroups = await ts.serverGroupList()
        tsGroups = allGroups.map(g => ({ id: Number(g.sgid), name: g.name }))
        tsGroupNameById = new Map(tsGroups.map(g => [g.id, g.name]))
    } catch {
        tsAvailable = false
    }

    const [users, departmentRoles, orbatRoles, orbatPositions, orbatSectionMeta, guildMembers, tsLinks] = await Promise.all([
        Db.users.find({ discharged: { $exists: false }, isSkeletonAccount: { $ne: true } })
            .project<Pick<User, 'id' | 'name' | 'globalName' | 'username' | 'avatarURL' | 'guild' | 'departments' | 'departmentRoleIds' | 'teamspeak' | 'milpac'>>(
                {
                    id: 1, name: 1, globalName: 1, username: 1, avatarURL: 1, guild: 1, departments: 1, departmentRoleIds: 1, teamspeak: 1,
                    // Only what milpacSubject reads — a whole MILPAC per member is a lot to load for four lists.
                    'milpac.currentRank': 1, 'milpac.awards.name': 1, 'milpac.operations.name': 1, 'milpac.qualifications.qualification': 1,
                },
            )
            .toArray(),
        Db.departmentRoles.find({}).toArray(),
        Db.orbatRoles.find({}).toArray(),
        Db.orbatPositions.find({ userId: { $ne: null } }).toArray(),
        Db.orbatSectionMeta.find({}).toArray(),
        fetchAllGuildMembers(),
        Db.tsGroupLinks.find({}).toArray(),
    ])
    const milpacResolver = buildResolver(tsGroups, tsLinks)

    const managedDiscordIds = new Set<string>([
        ...departmentRoles.flatMap(r => r.discordRoleIds),
        ...orbatRoles.flatMap(r => r.discordRoleIds),
        ...orbatSectionMeta.map(m => m.discordRoleId).filter((id): id is string => !!id),
    ])

    const guildRoleMap = new Map(guildMembers.map(m => [m.userId, new Set(m.roleIds)]))
    const roleNameById = new Map(client.roles.map(r => [r.id, r.name]))

    const positionByUserId = new Map(orbatPositions.filter(p => p.userId).map(p => [p.userId as string, p]))
    const orbatRoleById = new Map(orbatRoles.map(r => [String(r._id), r]))
    const deptRoleById = new Map(departmentRoles.map(r => [String(r._id), r]))
    const deptBaseByDept = new Map(departmentRoles.filter(r => r.isBase).map(r => [r.department, r]))
    const sectionMetaByKey = new Map(orbatSectionMeta.map(m => [`${m.category}:${m.sectionTitle ?? ''}`, m]))

    // `deptBaseByDept` carries the permanent Members base role along with the
    // seven real departments — it is seeded `isBase: true` like any of them —
    // which is how grantBundlesFor reaches it for everyone in the ORBAT.
    const grantCatalog: GrantCatalog = { deptBaseByDept, deptRoleById, orbatRoleById, positionByUserId, sectionMetaByKey }

    function bundlesFor(user: typeof users[number]): GrantBundle[] {
        return grantBundlesFor(user, grantCatalog)
    }

    async function buildEntry(user: typeof users[number]): Promise<MemberSyncEntry> {
        const actualDiscord = guildRoleMap.get(user.id) ?? new Set<string>()
        const cldbid = user.teamspeak?.cldbid
        const actualTs = (cldbid && tsAvailable) ? new Set(await getClientServerGroupIds(cldbid)) : new Set<number>()

        // The MILPAC bundles need to know what is already held, to leave a
        // member wearing an accepted variant of their rank alone.
        const { discordIds, tsIds, discordSource, tsSource } = mergeBundles([
            ...bundlesFor(user),
            ...milpacBundles(milpacSubject(user.milpac), milpacResolver, actualTs),
        ])

        const discordDiff = diffIds(discordIds, managedDiscordIds, actualDiscord, discordSource, roleNameById)
        const teamspeakDiff = (cldbid && tsAvailable)
            ? diffIds(
                tsIds,
                managedTsIds(departmentRoles, orbatRoles, orbatSectionMeta, milpacResolver, user.milpac?.currentRank),
                actualTs, tsSource, tsGroupNameById,
            )
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

export interface MemberTsSyncResult {
    skipped: boolean
    reason?: string
    granted: number
    revoked: number
}

/**
 * Bring ONE member's TeamSpeak groups into line, now.
 *
 * `computeMemberSyncReport` answers for the whole unit and has to fetch every
 * guild member and every client's groups to do it — right for the Member Sync
 * tab, far too heavy to run each time somebody's rank changes. This is the
 * same rules for a single member, TeamSpeak only: called after a MILPAC edit,
 * a Mastersheet apply or an award, so the change reaches TeamSpeak without
 * anybody opening the sync tab.
 *
 * Never throws. A member with no linked TeamSpeak account, or a server that is
 * down, is `skipped` — the write that triggered this has already succeeded and
 * must not be failed by it.
 */
export async function syncMemberTeamspeak(userId: string): Promise<MemberTsSyncResult> {
    const nothing = (reason: string): MemberTsSyncResult => ({ skipped: true, reason, granted: 0, revoked: 0 })
    try {
        const user = await Db.users.findOne({ $or: [{ id: userId }, { _id: userId }] })
        if (!user || user.discharged || user.isSkeletonAccount) return nothing('Not an active member')
        const cldbid = user.teamspeak?.cldbid
        if (!cldbid) return nothing('Member has no linked TeamSpeak account')

        let tsGroups: { id: number; name: string }[]
        try {
            const ts = await getConnection()
            tsGroups = (await ts.serverGroupList()).map(g => ({ id: Number(g.sgid), name: g.name }))
        } catch {
            return nothing('Failed to connect to TeamSpeak server')
        }

        const [departmentRoles, orbatRoles, position, orbatSectionMeta, tsLinks] = await Promise.all([
            Db.departmentRoles.find({}).toArray(),
            Db.orbatRoles.find({}).toArray(),
            Db.orbatPositions.findOne({ userId: user.id }),
            Db.orbatSectionMeta.find({}).toArray(),
            Db.tsGroupLinks.find({}).toArray(),
        ])
        const resolver = buildResolver(tsGroups, tsLinks)
        const catalog: GrantCatalog = {
            deptBaseByDept: new Map(departmentRoles.filter(r => r.isBase).map(r => [r.department, r])),
            deptRoleById: new Map(departmentRoles.map(r => [String(r._id), r])),
            orbatRoleById: new Map(orbatRoles.map(r => [String(r._id), r])),
            positionByUserId: new Map(position ? [[user.id, position]] : []),
            sectionMetaByKey: new Map(orbatSectionMeta.map(m => [`${m.category}:${m.sectionTitle ?? ''}`, m])),
        }

        // [] when the server cannot be read, which makes everything look
        // missing and nothing look extra: a redundant grant, never a wrong
        // removal. See getClientServerGroupIds.
        const actual = new Set(await getClientServerGroupIds(cldbid))
        const expected = mergeBundles([
            ...grantBundlesFor(user, catalog),
            ...milpacBundles(milpacSubject(user.milpac), resolver, actual),
        ]).tsIds
        const managed = managedTsIds(departmentRoles, orbatRoles, orbatSectionMeta, resolver, user.milpac?.currentRank)

        const toGrant = [...expected].filter(id => !actual.has(id))
        const toRevoke = [...actual].filter(id => managed.has(id) && !expected.has(id))
        if (!toGrant.length && !toRevoke.length) return { skipped: false, granted: 0, revoked: 0 }

        const [grant, revoke] = await Promise.all([
            toGrant.length ? applyTsServerGroups(user.id, 'add', toGrant) : null,
            toRevoke.length ? applyTsServerGroups(user.id, 'remove', toRevoke) : null,
        ])
        const failed = [grant, revoke].find(r => r?.skipped)
        if (failed) return nothing(failed.reason ?? 'TeamSpeak sync was skipped')
        return { skipped: false, granted: toGrant.length, revoked: toRevoke.length }
    } catch (err) {
        console.error('[TeamSpeak] syncMemberTeamspeak failed:', err)
        return nothing('TeamSpeak sync failed')
    }
}

/** Fire-and-forget form, for the end of a route that has already done its work. */
export function queueMemberTeamspeakSync(userId: string | null | undefined): void {
    if (!userId) return
    void syncMemberTeamspeak(userId)
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
