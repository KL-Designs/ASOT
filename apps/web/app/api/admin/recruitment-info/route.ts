import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { DEFAULT_RECRUITMENT_INFO, type RecruitmentInfoContent } from '@/lib/recruitment-defaults'
import { sanitizeRecruitmentInfo } from '@/lib/sanitizeRecruitmentInfo'

export const dynamic = 'force-dynamic'

export async function GET() {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departments.j4))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const config = await Db.recruitVideoConfig.findOne({ _id: 'main' }).catch(() => null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const info = (config as any)?.recruitmentInfo ?? DEFAULT_RECRUITMENT_INFO
    return NextResponse.json(sanitizeRecruitmentInfo(info))
}

export async function PUT(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me || !client.hasRoles(me, PERMISSIONS.departments.j4))
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    let body: RecruitmentInfoContent
    try { body = await req.json() } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }) }

    await Db.recruitVideoConfig.updateOne(
        { _id: 'main' },
        { $set: { recruitmentInfo: sanitizeRecruitmentInfo(body) } },
        { upsert: true }
    )

    return NextResponse.json({ ok: true })
}
