import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { CERTIFICATIONS } from '@/lib/certifications'

const VALID_QUALIFICATIONS = CERTIFICATIONS.map(c => c.label) as string[]

// GET /api/admin/tickets — list tickets, optionally filtered
export async function GET(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = req.nextUrl
    const filter: Record<string, string> = {}
    const department = searchParams.get('department')
    const status = searchParams.get('status')
    const issuedById = searchParams.get('issuedById')

    if (department) filter.department = department
    if (status) filter.status = status
    if (issuedById) filter.issuedById = issuedById

    const raw = await Db.tickets
        .find(filter)
        .sort({ issuedAt: -1 })
        .toArray()

    const tickets = raw.map(t => ({ ...t, _id: t._id!.toString() }))

    return NextResponse.json({ tickets })
}

// POST /api/admin/tickets — create a new ticket
export async function POST(req: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j3)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { type, action, qualification, targetUserId, targetUserName, notes } = body

    if (!type || !action || !qualification || !targetUserId || !targetUserName) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (action !== 'add' && action !== 'remove') {
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (!VALID_QUALIFICATIONS.includes(qualification)) {
        return NextResponse.json({ error: 'Invalid qualification' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || me.id

    const ticket: Omit<Ticket, '_id'> = {
        type: 'j3-qualification',
        department: 'j3',
        status: 'open',
        action,
        qualification,
        targetUserId,
        targetUserName,
        issuedById: me.id,
        issuedByName: displayName,
        issuedAt: new Date(),
        ...(notes?.trim() ? { notes: notes.trim() } : {}),
    }

    const result = await Db.tickets.insertOne(ticket as Ticket)

    return NextResponse.json({ ok: true, id: result.insertedId.toString() })
}
