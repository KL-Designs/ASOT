import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { PERMISSION_KEYS } from '@/lib/permissions-catalog'
import { DEPT_ROLES } from '@/lib/discord/dept-roles'
import { MEMBERS_DEPT, PSEUDO_DEPT_CODES } from '@/lib/discord/dept-codes'

// Real departments — the only ones that may hold sub-roles, and so the only
// ones POST accepts.
const VALID_DEPTS = Object.keys(DEPT_ROLES)

// Everything the catalog holds, real departments plus pseudo-departments.
// GET reads and seeds against this; POST deliberately does not.
const SEEDED_DEPTS = [...VALID_DEPTS, ...PSEUDO_DEPT_CODES]

// Pseudo-departments get a name of their own — "MEMBERS Base Role" reads as
// a piece of plumbing, and this row is the one an admin actually clicks.
const BASE_ROLE_NAMES: Record<string, string> = { [MEMBERS_DEPT]: 'Members' }

// Ensures all base roles exist, creating any missing ones. Called at the top
// of GET so there's no separate migration step — the catalog is always
// complete by the time anything reads it, including on a database that
// predates the Members role.
async function ensureBaseRoles(): Promise<void> {
    const existing = await Db.departmentRoles.find({ isBase: true }).project({ department: 1 }).toArray()
    const existingDepts = new Set(existing.map(r => r.department))
    const missing = SEEDED_DEPTS.filter(d => !existingDepts.has(d))
    if (missing.length === 0) return

    const now = new Date()
    await Db.departmentRoles.insertMany(missing.map(department => ({
        _id: new ObjectId(),
        department,
        name: BASE_ROLE_NAMES[department] ?? `${department.toUpperCase()} Base Role`,
        isBase: true,
        discordRoleIds: [],
        tsGroupIds: [],
        permissions: [],
        linkedSlot: null,
        createdAt: now,
        createdBy: 'system',
        createdByName: 'System',
    })))
}


// ── GET /api/admin/department-roles ────────────────────────────────────────
// Optional ?department=j1 filter. Seeds any missing base roles first.

export async function GET(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const department = request.nextUrl.searchParams.get('department')
    if (department && !SEEDED_DEPTS.includes(department)) {
        return NextResponse.json({ error: 'Invalid department' }, { status: 400 })
    }
    const isManager = client.hasRoles(me, PERMISSIONS.admin.manageDepartmentRoles)
    const leadRoles = department ? PERMISSIONS.departmentLeads[department as keyof typeof PERMISSIONS.departmentLeads] : undefined
    const memberRoles = department ? PERMISSIONS.departments[department as keyof typeof PERMISSIONS.departments] : undefined
    const isDeptLead = leadRoles ? client.hasRoles(me, leadRoles) : false
    const isDeptMember = memberRoles ? client.hasRoles(me, memberRoles) : false
    if (!isManager && !isDeptLead && !isDeptMember) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await ensureBaseRoles()

    const filter = department ? { department } : {}
    const roles = await Db.departmentRoles.find(filter).sort({ department: 1, isBase: -1, name: 1 }).toArray()
    return NextResponse.json({ roles: JSON.parse(JSON.stringify(roles)) })
}


// ── POST /api/admin/department-roles ───────────────────────────────────────
// Body: { department, name, discordRoleIds, tsGroupIds, permissions }
// Always creates a sub-role (isBase: false) — base roles only come from seeding.

export async function POST(request: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.admin.manageDepartmentRoles)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const department: string = body.department
    if (!VALID_DEPTS.includes(department)) return NextResponse.json({ error: 'Invalid department' }, { status: 400 })

    const name: string = (body.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 })

    const existing = await Db.departmentRoles.findOne({ department, name })
    if (existing) return NextResponse.json({ error: 'A role with that name already exists in this department' }, { status: 409 })

    const discordRoleIds: string[] = Array.isArray(body.discordRoleIds) ? body.discordRoleIds : []
    const tsGroupIds: number[] = Array.isArray(body.tsGroupIds)
        ? body.tsGroupIds.filter((id: unknown) => typeof id === 'number')
        : []
    const permissions: string[] = Array.isArray(body.permissions)
        ? body.permissions.filter((p: unknown) => typeof p === 'string' && PERMISSION_KEYS.includes(p))
        : []

    const performedByName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const newRole: DepartmentRole = {
        _id: new ObjectId(),
        department,
        name,
        isBase: false,
        discordRoleIds,
        tsGroupIds,
        permissions,
        linkedSlot: null,
        createdAt: new Date(),
        createdBy: me.id,
        createdByName: performedByName,
    }
    await Db.departmentRoles.insertOne(newRole)

    return NextResponse.json({ role: JSON.parse(JSON.stringify(newRole)) })
}
