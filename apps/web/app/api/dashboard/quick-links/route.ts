import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { visibilityFilter } from '@/lib/dept-links/visibility'

// ── GET /api/dashboard/quick-links ───────────────────────────────────────────
// One entry per department the caller belongs to, each pre-filtered to that
// caller's visible links via the same visibilityFilter the per-department
// route uses (shared helper so the two can't drift). Deliberately does NOT
// grant managers a see-everything bypass here — this route answers "what can
// I see", matching what a manager would see on the rail as a plain viewer,
// keeping /dashboard a summary rather than a management surface.

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const departments = me.departments ?? []
    if (departments.length === 0) return NextResponse.json({ groups: [] })

    const docs = await Db.departmentLinks
        .find({ department: { $in: departments }, ...visibilityFilter(me) }, {
            projection: { department: 1, url: 1, fetchedTitle: 1, nameOverride: 1, visibleToRoleIds: 1, order: 1, faviconFetchedAt: 1, faviconStatus: 1 },
        })
        .sort({ department: 1, order: 1 })
        .toArray()

    const groups: { department: string; links: DepartmentLinkListItem[] }[] = departments
        .map(department => ({
            department,
            links: docs
                .filter(d => d.department === department)
                .map(d => ({
                    _id: String(d._id),
                    department: d.department,
                    url: d.url,
                    fetchedTitle: d.fetchedTitle,
                    nameOverride: d.nameOverride,
                    visibleToRoleIds: (d.visibleToRoleIds ?? []).map(String),
                    order: d.order,
                    hasFavicon: d.faviconStatus === 'ok',
                    faviconVersion: d.faviconFetchedAt ? new Date(d.faviconFetchedAt).getTime() : null,
                })),
        }))
        .filter(g => g.links.length > 0)

    return NextResponse.json({ groups: JSON.parse(JSON.stringify(groups)) })
}
