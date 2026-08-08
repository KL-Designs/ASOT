import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import { estimateTextCost, estimateImageCost } from '@/lib/ai/service'
import type { AiTextRequest, AiImageRequest } from '@/lib/ai/service'

export async function POST(req: Request) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!client.hasRoles(me, PERMISSIONS.ai.use)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const body = await req.json() as {
            type: 'text' | 'image'
            feature: AiFeature
            request: AiTextRequest | AiImageRequest
        }

        if (!body.type || !body.feature || !body.request) {
            return NextResponse.json({ error: 'type, feature, and request are required' }, { status: 400 })
        }

        const ctx = {
            userId:   me.id,
            userName: me.name ?? me.globalName ?? me.id,
            roles:    me.guild?.roles ?? [],
            feature:  body.feature,
        }

        const estimate = body.type === 'text'
            ? await estimateTextCost(body.request as AiTextRequest, ctx)
            : await estimateImageCost(body.request as AiImageRequest, ctx)

        return NextResponse.json({ estimate })
    } catch (err) {
        console.error('[api/ai/estimate POST]', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
