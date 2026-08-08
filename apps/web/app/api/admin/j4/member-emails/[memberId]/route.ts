import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.view)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const { memberId } = await params
    const doc = await Db.memberEmails.findOne({ memberId })
    return NextResponse.json({ emails: doc?.emails ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.masterSheet.import)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { memberId } = await params
    const { email } = await req.json()
    if (!email || typeof email !== 'string' || !email.includes('@')) {
        return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
    }

    const entry = { email: email.trim(), addedAt: new Date(), addedByName: me.guild?.nickname || me.globalName || me.username || 'Unknown' }

    const existing = await Db.memberEmails.findOne({ memberId })
    if (existing) {
        await Db.memberEmails.updateOne({ memberId }, { $push: { emails: entry } })
    } else {
        await Db.memberEmails.insertOne({
            _id: new ObjectId() as MemberEmail['_id'],
            memberId,
            emails: [entry],
        })
    }

    return NextResponse.json({ ok: true })
}
