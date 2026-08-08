import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

interface ResolveAction {
    csvName: string
    csvRank: string
    unit: string
    action: 'match' | 'skeleton'
    discordUserId?: string  // required when action === 'match'
}

export async function POST(req: NextRequest) {
    await client.updateRoles()

    let me: User
    try {
        me = await client.fetchMe()
    } catch {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!client.hasRoles(me, PERMISSIONS.admin.massImport)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const actions: ResolveAction[] = await req.json()
    if (!Array.isArray(actions)) {
        return NextResponse.json({ error: 'Expected an array of resolve actions' }, { status: 400 })
    }

    let skeletonsCreated = 0
    let matched = 0

    for (const action of actions) {
        if (action.action === 'match' && action.discordUserId) {
            // Update all attendance records in all operations that used the placeholder
            // The placeholder records were saved with the csvName as userId during import
            // We skip unmatched members at import time, so a "match" here means re-running
            // the attendance insert for this user. For simplicity, update any records
            // where userId was stored as the skeleton ID if a skeleton was created earlier.
            // In the typical flow the skeleton was created first, then matched.
            await Db.operationAttendance.updateMany(
                { 'records.userId': action.csvName },  // placeholder key used for unmatched
                { $set: { 'records.$[elem].userId': action.discordUserId } },
                { arrayFilters: [{ 'elem.userId': action.csvName }] }
            )
            matched++
        } else if (action.action === 'skeleton') {
            // Check if skeleton already exists
            const existing = await Db.users.findOne({ csvName: action.csvName, isSkeletonAccount: true })
            if (existing) continue

            const skeletonId = new ObjectId().toString()
            const skeleton: Partial<User> = {
                _id: skeletonId,
                id: skeletonId,
                isSkeletonAccount: true,
                csvName: action.csvName,
                csvRank: action.csvRank,
                // Minimal required fields to satisfy the User shape
                hexAccentColor: '#4a4a4a',
                accentColor: 0,
                avatar: '',
                avatarURL: '',
                banner: '',
                bannerURL: '',
                globalName: action.csvName,
                tag: action.csvName,
                username: action.csvName.toLowerCase().replace(/\s+/g, '_'),
                guild: {
                    nickname: `${action.csvRank} ${action.csvName}`,
                    avatar: '',
                    avatarURL: '',
                    displayName: `${action.csvRank} ${action.csvName}`,
                    joinedTimestamp: 0,
                    roles: [],
                },
                milpac: {
                    currentRank: action.csvRank,
                },
            }

            await Db.users.insertOne(skeleton as User)

            // Update attendance records that were using the csvName as a placeholder key
            await Db.operationAttendance.updateMany(
                { 'records.userId': action.csvName },
                { $set: { 'records.$[elem].userId': skeletonId } },
                { arrayFilters: [{ 'elem.userId': action.csvName }] }
            )

            skeletonsCreated++
        }
    }

    return NextResponse.json({ matched, skeletonsCreated })
}
