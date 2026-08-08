import { NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import { DEFAULT_TEXT_MODEL_ANTHROPIC, DEFAULT_TEXT_MODEL_OPENAI, DEFAULT_IMAGE_MODEL_OPENAI } from '@/lib/ai/costs'

const DEFAULT_CONFIG: Omit<AiSiteConfig, '_id' | 'updatedAt' | 'updatedById' | 'updatedByName'> = {
    globalEnabled: false,
    providers: {
        anthropic: { enabled: true,  defaultModel: DEFAULT_TEXT_MODEL_ANTHROPIC },
        openai:    { enabled: true,  defaultModel: DEFAULT_TEXT_MODEL_OPENAI, defaultImageModel: DEFAULT_IMAGE_MODEL_OPENAI },
    },
    featureDefaults: {
        'intel.image_generate': { provider: 'openai',    model: DEFAULT_IMAGE_MODEL_OPENAI },
        'intel.image_edit':     { provider: 'openai',    model: DEFAULT_IMAGE_MODEL_OPENAI },
        'training.answer_review': { provider: 'anthropic', model: DEFAULT_TEXT_MODEL_ANTHROPIC },
        'text.general':         { provider: 'anthropic', model: DEFAULT_TEXT_MODEL_ANTHROPIC },
    },
}

export async function GET() {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!client.hasRoles(me, PERMISSIONS.ai.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const config = await Db.aiConfig.findOne({ _id: 'main' })
        const result = config ?? { ...DEFAULT_CONFIG, _id: 'main', updatedAt: new Date(), updatedById: '', updatedByName: '' }

        return NextResponse.json({
            config: result,
            providerStatus: {
                anthropic: !!process.env.ANTHROPIC_API_KEY,
                openai:    !!process.env.OPENAI_API_KEY,
            },
        })
    } catch (err) {
        console.error('[api/ai/config GET]', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}

export async function PUT(req: Request) {
    try {
        const me = await client.fetchMe().catch(() => null)
        if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        if (!client.hasRoles(me, PERMISSIONS.ai.manage)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const body = await req.json() as Partial<AiSiteConfig>

        await Db.aiConfig.updateOne(
            { _id: 'main' },
            {
                $set: {
                    globalEnabled:  body.globalEnabled  ?? false,
                    providers:      body.providers      ?? DEFAULT_CONFIG.providers,
                    featureDefaults: body.featureDefaults ?? DEFAULT_CONFIG.featureDefaults,
                    updatedAt:      new Date(),
                    updatedById:    me.id,
                    updatedByName:  me.name ?? me.globalName ?? me.id,
                },
            },
            { upsert: true }
        )

        return NextResponse.json({ ok: true })
    } catch (err) {
        console.error('[api/ai/config PUT]', err)
        return NextResponse.json({ error: 'Server error' }, { status: 500 })
    }
}
