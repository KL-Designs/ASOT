/**
 * DEV-ONLY — creates a pre-filled test application in j1_applications.
 * Skips Discord role assignment and notifications so it doesn't pollute the server.
 *
 * DELETE THIS FILE before deploying to production.
 */
import { NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import Db from '@/lib/mongo'

export async function POST() {
    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const ts = Date.now()
    const igName = `TEST_${ts.toString().slice(-5)}`

    const app: J1Application = {
        _id: new ObjectId() as any,
        discordUsername: me.username ?? me.globalName ?? 'TestUser',
        discordId: me.id,
        inGameName: igName,
        age: 22,
        experience: 'This is a dev test application auto-generated for testing the J1 recruitment workflow. No action needed — safe to delete.',
        status: 'pending',
        submittedAt: new Date(),
        region: 'Australia',
        armaHours: '500+',
        priorMilsim: true,
        dualClan: false,
        ownsArma: true,
        availableNights: 'Both',
        opsPerMonth: '3+',
        primaryRole: 'Rifleman',
        additionalRoles: ['Medic'],
        departmentInterest: ['J2 - Mission Making'],
        previousUnits: 'Test Unit Alpha',
        isDirectRecruit: false,
    }

    await Db.j1Applications.insertOne(app as any)

    return NextResponse.json({ ok: true, id: (app as any)._id.toString(), inGameName: igName })
}
