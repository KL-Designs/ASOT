import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

interface ImportRecord {
    discordUsername: string
    inGameName: string
    age: number
    experience: string
    status: 'pending' | 'reviewing' | 'accepted' | 'rejected'
    submittedAt: string
    notes: string
}

// POST /api/admin/j1/import — bulk import historical application records
export async function POST(request: NextRequest) {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.departments.j1)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let body: { records: ImportRecord[] }
    try {
        body = await request.json()
    } catch {
        return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
    }

    const { records } = body
    if (!Array.isArray(records) || records.length === 0) {
        return NextResponse.json({ error: 'No records provided.' }, { status: 400 })
    }
    if (records.length > 2000) {
        return NextResponse.json({ error: 'Too many records (max 2000 per import).' }, { status: 400 })
    }

    const displayName = me.guild?.nickname || me.globalName || me.username || 'Unknown'

    const docs = records
        .filter(r => r.discordUsername?.trim())
        .map(r => ({
            discordUsername: r.discordUsername.trim(),
            inGameName: r.inGameName?.trim() || '',
            age: typeof r.age === 'number' ? r.age : 0,
            experience: r.experience?.trim() || '',
            status: r.status || 'pending',
            submittedAt: r.submittedAt ? new Date(r.submittedAt) : new Date(),
            notes: r.notes?.trim() || '',
            isDirectRecruit: false,
            reviewedBy: displayName,
            reviewedAt: new Date(),
        }))

    if (docs.length === 0) {
        return NextResponse.json({ error: 'No valid records to import.' }, { status: 400 })
    }

    const result = await Db.j1Applications.insertMany(docs, { ordered: false })
    return NextResponse.json({ inserted: result.insertedCount })
}
