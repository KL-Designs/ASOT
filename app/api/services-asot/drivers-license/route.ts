import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

const VIEW_ROLES = ['1-2']
const EDIT_ROLES = ['1-2-0 Command']

const SEED_DATA: Array<{ name: string; section: string; status: DriverLicenseEntry['status'] }> = [
    { section: 'PHQ', name: 'Talon', status: 'Under Review' },
    { section: 'PHQ', name: 'Andrew', status: 'Under Review' },
    { section: 'PHQ', name: 'Raz', status: 'Active' },
    { section: 'PHQ', name: 'Koda', status: 'Under Review' },

    { section: 'Alpha', name: 'Nic', status: 'Revoked' },
    { section: 'Alpha', name: 'Pants', status: 'Under Review' },
    { section: 'Alpha', name: 'Dawn', status: 'Revoked' },
    { section: 'Alpha', name: 'Frankie', status: 'Under Review' },
    { section: 'Alpha', name: 'Pegasus', status: 'Under Review' },
    { section: 'Alpha', name: 'Dempesy', status: 'Revoked' },
    { section: 'Alpha', name: 'Wombat', status: 'Active' },

    { section: 'Bravo', name: 'Rendez', status: 'Active' },
    { section: 'Bravo', name: 'Cheeseye', status: 'Revoked' },
    { section: 'Bravo', name: 'Soundless', status: 'Revoked' },
    { section: 'Bravo', name: 'Soapy', status: 'Active' },
    { section: 'Bravo', name: 'Tj', status: 'Under Review' },
    { section: 'Bravo', name: 'Iffy', status: 'Under Review' },
    { section: 'Bravo', name: 'Dennis', status: 'Revoked' },

    { section: 'Charlie', name: 'Flurp', status: 'Active' },
    { section: 'Charlie', name: 'Phantom', status: 'Revoked' },
    { section: 'Charlie', name: 'Osprey', status: 'Active' },
    { section: 'Charlie', name: 'Walshy', status: 'Under Review' },
    { section: 'Charlie', name: 'Noisy', status: 'Active' },
    { section: 'Charlie', name: 'J45un', status: 'Under Review' },
    { section: 'Charlie', name: 'Bones', status: 'Under Review' },
    { section: 'Charlie', name: 'Rox', status: 'Revoked' },
]

export async function GET() {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!client.hasRoles(me, VIEW_ROLES)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const count = await Db.driversLicense.countDocuments()
    if (count === 0) {
        const now = new Date()
        await Db.driversLicense.insertMany(SEED_DATA.map(d => ({ ...d, updatedAt: now })) as any[])
    }

    const entries = await Db.driversLicense.find({}, { sort: { section: 1, name: 1 } }).toArray()
    return NextResponse.json(entries.map(e => ({ ...e, _id: e._id.toString() })))
}

export async function POST(request: NextRequest) {
    let me: User
    try { me = await client.fetchMe() } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!client.hasRoles(me, EDIT_ROLES)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, section, status } = await request.json()
    if (!name?.trim() || !section || !status) {
        return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    }

    const entry = { name: name.trim(), section, status, updatedAt: new Date(), updatedBy: me.id }
    const result = await Db.driversLicense.insertOne(entry as any)
    return NextResponse.json({ ...entry, _id: result.insertedId.toString() })
}
