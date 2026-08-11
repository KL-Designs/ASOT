import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logs'
import { hasDepartmentPermissions } from '@/lib/orbat/hasDepartmentPermissions'
import { DEPT_LINKS_MANAGE_KEY, leadKey, type DeptLinkDepartment } from '@/lib/dept-links/keys'
import { validateLinkUrl } from '@/lib/dept-links/validate-url'
import { fetchSiteMeta } from '@/lib/dept-links/favicon'

const MAX_NAME_OVERRIDE_LENGTH = 80

function parseId(id: string): ObjectId | null {
    try { return new ObjectId(id) } catch { return null }
}

// Doc minus faviconData, plus hasFavicon: the shape every deptLinks audit
// log payload uses (D3: the log never carries favicon bytes).
function withoutFaviconData(doc: DepartmentLink): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...doc }
    delete copy.faviconData
    copy.hasFavicon = doc.faviconStatus === 'ok'
    return copy
}


// ── PATCH /api/admin/dept-links/[id] ─────────────────────────────────────────
// Body: { url?, nameOverride?, restricted?, order? }; each field mutates
// only its own concern (FR-03): a url change refetches title+favicon and
// never writes nameOverride; a nameOverride change never writes url/
// fetchedTitle. Load-then-404-then-403 (D9, intentional, not the no-leak
// favicon-route shape).

export async function PATCH(
    request: NextRequest,
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

    const body = await request.json().catch(() => null)
    const updates: Record<string, unknown> = {}

    if (body && 'url' in body && body.url !== undefined) {
        const v = validateLinkUrl(body.url)
        if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
        updates.url = v.href
        const meta = await fetchSiteMeta(v.href)
        updates.fetchedTitle = meta.fetchedTitle
        updates.faviconData = meta.faviconData
        updates.faviconContentType = meta.faviconContentType
        updates.faviconFetchedAt = meta.faviconFetchedAt
        updates.faviconStatus = meta.faviconStatus
    }

    if (body && 'nameOverride' in body && body.nameOverride !== undefined) {
        const raw = body.nameOverride
        if (typeof raw !== 'string' && raw !== null) {
            return NextResponse.json({ error: 'Display name override must be text or null' }, { status: 400 })
        }
        const trimmed = typeof raw === 'string' ? raw.trim() : ''
        if (trimmed.length > MAX_NAME_OVERRIDE_LENGTH) {
            return NextResponse.json({ error: 'Display name override must be 80 characters or fewer' }, { status: 400 })
        }
        updates.nameOverride = trimmed === '' ? null : trimmed
    }

    if (body && 'visibleToRoleIds' in body && body.visibleToRoleIds !== undefined) {
        if (!Array.isArray(body.visibleToRoleIds) || !body.visibleToRoleIds.every((id: unknown) => typeof id === 'string')) {
            return NextResponse.json({ error: 'visibleToRoleIds must be an array of role ids' }, { status: 400 })
        }
        try {
            updates.visibleToRoleIds = body.visibleToRoleIds.map((id: string) => new ObjectId(id))
        } catch {
            return NextResponse.json({ error: 'visibleToRoleIds contains an invalid id' }, { status: 400 })
        }
    }

    if (body && 'order' in body && body.order !== undefined) {
        if (typeof body.order !== 'number' || !Number.isFinite(body.order)) {
            return NextResponse.json({ error: 'order must be a finite number' }, { status: 400 })
        }
        updates.order = body.order
    }

    if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: 'No valid fields' }, { status: 400 })
    }

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    updates.updatedAt = new Date()
    updates.updatedById = me.id
    updates.updatedByName = performedByName

    await Db.departmentLinks.updateOne({ _id: objectId }, { $set: updates })

    const action = ('order' in (body ?? {})) && Object.keys(updates).length <= 4 ? 'deptLinks.reorder' : 'deptLinks.update'
    logAction({
        action,
        category: 'deptLinks',
        performedBy: me.id,
        performedByName,
        department: link.department,
        entityType: 'deptLink',
        entityId: id,
        before: withoutFaviconData(link),
        after: withoutFaviconData({ ...link, ...updates } as DepartmentLink),
    })

    return NextResponse.json({ success: true })
}


// ── DELETE /api/admin/dept-links/[id] ────────────────────────────────────────
// Hard delete. Confirmation is client-side via ConfirmDialog.

export async function DELETE(
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

    await Db.departmentLinks.deleteOne({ _id: objectId })

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id
    logAction({
        action: 'deptLinks.delete',
        category: 'deptLinks',
        performedBy: me.id,
        performedByName,
        department: link.department,
        entityType: 'deptLink',
        entityId: id,
        target: `Deleted quick link "${link.nameOverride ?? link.fetchedTitle}"`,
        before: withoutFaviconData(link),
    })

    return NextResponse.json({ success: true })
}
