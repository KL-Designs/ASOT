import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'
import { hasDepartmentPermissions } from '@/lib/orbat/hasDepartmentPermissions'
import { DEPT_LINKS_MANAGE_KEY, leadKey, type DeptLinkDepartment } from '@/lib/dept-links/keys'
import { fetchSiteMeta } from '@/lib/dept-links/favicon'
import { isLinkVisible } from '@/lib/dept-links/visibility'

function parseId(id: string): ObjectId | null {
    try { return new ObjectId(id) } catch { return null }
}


// ── GET /api/admin/dept-links/[id]/favicon ───────────────────────────────────
// The no-existence-leak route (NFR-02): every failure after the 401 returns
// 404 with no distinguishing body or status, so this route can never be used
// to probe whether a link exists or is visible to the caller.

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const link = await Db.departmentLinks.findOne(
        { _id: objectId },
        { projection: { department: 1, visibleToRoleIds: 1, faviconData: 1, faviconContentType: 1, faviconStatus: 1 } }
    )
    if (!link) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const deptKey = link.department as keyof typeof PERMISSIONS.departments
    if (!PERMISSIONS.departments[deptKey] || !client.hasRoles(me, PERMISSIONS.departments[deptKey])) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    if (!isLinkVisible(me, link)) {
        const dept = link.department as DeptLinkDepartment
        const perms = await hasDepartmentPermissions(me, dept, [DEPT_LINKS_MANAGE_KEY, leadKey(dept)])
        if (!perms[DEPT_LINKS_MANAGE_KEY] && !perms[leadKey(dept)]) {
            return NextResponse.json({ error: 'Not found' }, { status: 404 })
        }
    }

    if (link.faviconStatus !== 'ok' || !link.faviconData || !link.faviconContentType) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const buffer = Buffer.from(link.faviconData, 'base64')
    return new NextResponse(buffer as BodyInit, {
        headers: {
            'Content-Type': link.faviconContentType,
            'Content-Length': String(buffer.length),
            'Cache-Control': 'private, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
        },
    })
}


// ── POST /api/admin/dept-links/[id]/favicon ──────────────────────────────────
// Manual refresh, re-runs the title+favicon pipeline only. Never touches
// url, nameOverride, restricted or order. Load-then-404-then-403 (D9).

export async function POST(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params
    const objectId = parseId(id)
    if (!objectId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const link = await Db.departmentLinks.findOne({ _id: objectId })
    if (!link) return NextResponse.json({ error: 'Link not found' }, { status: 404 })

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const dept = link.department as DeptLinkDepartment
    const perms = await hasDepartmentPermissions(me, dept, [DEPT_LINKS_MANAGE_KEY, leadKey(dept)])
    if (!perms[DEPT_LINKS_MANAGE_KEY] && !perms[leadKey(dept)]) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const meta = await fetchSiteMeta(link.url)

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    const updates = {
        fetchedTitle: meta.fetchedTitle,
        faviconData: meta.faviconData,
        faviconContentType: meta.faviconContentType,
        faviconFetchedAt: meta.faviconFetchedAt,
        faviconStatus: meta.faviconStatus,
        updatedAt: new Date(),
        updatedById: me.id,
        updatedByName: performedByName,
    }
    await Db.departmentLinks.updateOne({ _id: objectId }, { $set: updates })

    logAction({
        action: 'deptLinks.favicon_refresh',
        category: 'deptLinks',
        performedBy: me.id,
        performedByName,
        department: link.department,
        entityType: 'deptLink',
        entityId: id,
        target: `Refreshed favicon for "${link.nameOverride ?? link.fetchedTitle}"`,
    })

    return NextResponse.json({
        hasFavicon: meta.faviconStatus === 'ok',
        faviconVersion: meta.faviconFetchedAt ? meta.faviconFetchedAt.getTime() : null,
        fetchedTitle: meta.fetchedTitle,
    })
}
