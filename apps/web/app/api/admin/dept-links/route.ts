import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'
import { hasDepartmentPermissions } from '@/lib/orbat/hasDepartmentPermissions'
import { isDeptLinkDepartment, DEPT_LINKS_MANAGE_KEY, leadKey } from '@/lib/dept-links/keys'
import { validateLinkUrl } from '@/lib/dept-links/validate-url'
import { fetchSiteMeta } from '@/lib/dept-links/favicon'
import { visibilityFilter } from '@/lib/dept-links/visibility'

const MAX_LINKS_PER_DEPARTMENT = 24
const MAX_NAME_OVERRIDE_LENGTH = 80

// Doc minus faviconData, plus hasFavicon: the shape every deptLinks audit
// log payload uses (D3: the log never carries favicon bytes).
function withoutFaviconData(doc: DepartmentLink): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...doc }
    delete copy.faviconData
    copy.hasFavicon = doc.faviconStatus === 'ok'
    return copy
}


// ── GET /api/admin/dept-links?department=jN ─────────────────────────────────
// Any member of the department may view. Non-managers only see links their
// held sub-roles are assigned to (or unrestricted ones); the visibility
// filter is applied in the Mongo query itself, never client-side or in JS.

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const department = request.nextUrl.searchParams.get('department')
    if (!department || !isDeptLinkDepartment(department)) {
        return NextResponse.json({ error: 'department is required' }, { status: 400 })
    }

    const deptKey = department as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey] || !client.hasRoles(me, PERMISSIONS.departments[deptKey])) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const perms = await hasDepartmentPermissions(me, department, [DEPT_LINKS_MANAGE_KEY, leadKey(department)])
    const canManage = perms[DEPT_LINKS_MANAGE_KEY] || perms[leadKey(department)]

    const filter: Record<string, unknown> = canManage
        ? { department }
        : { department, ...visibilityFilter(me) }

    const docs = await Db.departmentLinks
        .find(filter, { projection: { department: 1, url: 1, fetchedTitle: 1, nameOverride: 1, visibleToRoleIds: 1, order: 1, faviconFetchedAt: 1, faviconStatus: 1 } })
        .sort({ order: 1 })
        .toArray()

    const links: DepartmentLinkListItem[] = docs.map(d => ({
        _id: String(d._id),
        department: d.department,
        url: d.url,
        fetchedTitle: d.fetchedTitle,
        nameOverride: d.nameOverride,
        visibleToRoleIds: (d.visibleToRoleIds ?? []).map(String),
        order: d.order,
        hasFavicon: d.faviconStatus === 'ok',
        faviconVersion: d.faviconFetchedAt ? new Date(d.faviconFetchedAt).getTime() : null,
    }))

    return NextResponse.json({ links: JSON.parse(JSON.stringify(links)), canManage })
}


// ── POST /api/admin/dept-links ───────────────────────────────────────────────
// Body: { department, url, nameOverride?, visibleToRoleIds? }. Manage gate only.

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => null)
    const department = body?.department
    if (!isDeptLinkDepartment(department)) {
        return NextResponse.json({ error: 'department is required' }, { status: 400 })
    }

    const perms = await hasDepartmentPermissions(me, department, [DEPT_LINKS_MANAGE_KEY, leadKey(department)])
    if (!perms[DEPT_LINKS_MANAGE_KEY] && !perms[leadKey(department)]) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const v = validateLinkUrl(body?.url)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    let nameOverride: string | null = null
    if (body && 'nameOverride' in body && body.nameOverride !== undefined) {
        const raw = body.nameOverride
        if (typeof raw !== 'string' && raw !== null) {
            return NextResponse.json({ error: 'Display name override must be text or null' }, { status: 400 })
        }
        const trimmed = typeof raw === 'string' ? raw.trim() : ''
        if (trimmed.length > MAX_NAME_OVERRIDE_LENGTH) {
            return NextResponse.json({ error: 'Display name override must be 80 characters or fewer' }, { status: 400 })
        }
        nameOverride = trimmed === '' ? null : trimmed
    }

    let visibleToRoleIds: ObjectId[] = []
    if (body && 'visibleToRoleIds' in body && body.visibleToRoleIds !== undefined) {
        if (!Array.isArray(body.visibleToRoleIds) || !body.visibleToRoleIds.every((id: unknown) => typeof id === 'string')) {
            return NextResponse.json({ error: 'visibleToRoleIds must be an array of role ids' }, { status: 400 })
        }
        try {
            visibleToRoleIds = body.visibleToRoleIds.map((id: string) => new ObjectId(id))
        } catch {
            return NextResponse.json({ error: 'visibleToRoleIds contains an invalid id' }, { status: 400 })
        }
    }

    const count = await Db.departmentLinks.countDocuments({ department })
    if (count >= MAX_LINKS_PER_DEPARTMENT) {
        return NextResponse.json({ error: 'This department already has the maximum of 24 quick links. Delete one before adding another.' }, { status: 400 })
    }

    const last = await Db.departmentLinks.find({ department }).sort({ order: -1 }).limit(1).toArray()
    const order = (last[0]?.order ?? -1) + 1

    const meta = await fetchSiteMeta(v.href)

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const doc: DepartmentLink = {
        _id: new ObjectId(),
        department,
        url: v.href,
        fetchedTitle: meta.fetchedTitle,
        nameOverride,
        visibleToRoleIds,
        order,
        faviconData: meta.faviconData,
        faviconContentType: meta.faviconContentType,
        faviconFetchedAt: meta.faviconFetchedAt,
        faviconStatus: meta.faviconStatus,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
    await Db.departmentLinks.insertOne(doc)

    const displayName = nameOverride ?? doc.fetchedTitle
    logAction({
        action: 'deptLinks.create',
        category: 'deptLinks',
        performedBy: me.id,
        performedByName,
        department,
        entityType: 'deptLink',
        entityId: String(doc._id),
        target: `Added quick link "${displayName}"`,
        after: withoutFaviconData(doc),
    })

    const listItem: DepartmentLinkListItem = {
        _id: String(doc._id),
        department: doc.department,
        url: doc.url,
        fetchedTitle: doc.fetchedTitle,
        nameOverride: doc.nameOverride,
        visibleToRoleIds: doc.visibleToRoleIds.map(String),
        order: doc.order,
        hasFavicon: doc.faviconStatus === 'ok',
        faviconVersion: doc.faviconFetchedAt ? doc.faviconFetchedAt.getTime() : null,
    }

    return NextResponse.json({ link: JSON.parse(JSON.stringify(listItem)) })
}
