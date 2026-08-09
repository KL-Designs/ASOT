import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { getOrbatEntryByUserId } from '@/lib/orbat'
import { generateUniform } from '@/lib/milpac-gen/uniform'
import { generateBox } from '@/lib/milpac-gen/box'
import { buildUniformData, buildBoxData, computeUniformHash } from '@/lib/milpac-gen/data-mapper'

export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ username: string }> }
) {
    const { username } = await params

    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.pages.admin)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const user = await Db.users.findOne({ username, discharged: { $exists: false } })
    if (!user) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

    const orbatEntry = await getOrbatEntryByUserId(user.id)
    const uniformData = buildUniformData(user as unknown as User, orbatEntry)
    const boxData     = buildBoxData(user as unknown as User)
    const hash        = computeUniformHash(uniformData, boxData)

    await generateUniform(uniformData)
    await generateBox(boxData)

    await Db.users.updateOne(
        { username },
        { $set: { 'milpac.uniformHash': hash } }
    )

    return NextResponse.json({ success: true })
}
