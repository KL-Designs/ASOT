import { NextRequest, NextResponse } from 'next/server'
import { callText } from '@/lib/ai/service'
import { resolveHelpViewer } from '@/lib/help/viewer'
import { loadVisibleArticles } from '@/lib/help/store'
import { ASK_MAX_QUESTION, buildAskSystemPrompt, citedSlugs, pickArticles, sanitiseHistory } from '@/lib/help/ai'
import { cleanPath } from '@/lib/help/validate'

/**
 * POST `/api/help/ask` `{ question, pathname?, history? }` — the help wiki's
 * live question box. Answers from the articles the asker may read
 * (`lib/help/ai.ts` picks them), through `callText`, so AI budgets, the J4
 * master switch and usage logging (`help.ask`) all apply. Gated on
 * `PERMISSIONS.ai.use`, like every other AI feature.
 *
 * Nothing is stored: the conversation lives in the reader's browser and comes
 * back as `history`, trimmed to the last few turns.
 */
export async function POST(req: NextRequest) {
    const viewer = await resolveHelpViewer()
    if (!viewer.signedIn || !viewer.id) return NextResponse.json({ error: 'Sign in to ask a question.' }, { status: 401 })
    if (!viewer.canAsk) return NextResponse.json({ error: "Your account can't use the AI assistant." }, { status: 403 })

    const body = await req.json().catch(() => null)
    const question = typeof body?.question === 'string' ? body.question.trim().slice(0, ASK_MAX_QUESTION) : ''
    if (!question) return NextResponse.json({ error: 'Write a question first.' }, { status: 400 })
    const pathname = (typeof body?.pathname === 'string' && cleanPath(body.pathname)) || '/'
    const history = sanitiseHistory(body?.history)

    const articles = await loadVisibleArticles(viewer.level)
    const picked = pickArticles(articles, question, pathname, history)

    try {
        const result = await callText(
            {
                systemPrompt: buildAskSystemPrompt(picked, pathname),
                messages: [...history, { role: 'user', content: question }],
                maxTokens: 700,
            },
            { userId: viewer.id, userName: viewer.name ?? viewer.id, roles: viewer.user?.guild?.roles ?? [], feature: 'help.ask', relatedId: pathname },
        )
        const answer = result.content.trim()
        const known = new Set(articles.map(a => a.slug))
        const sources = citedSlugs(answer, known)
            .map(slug => articles.find(a => a.slug === slug)!)
            .map(a => ({ slug: a.slug, title: a.title }))
        return NextResponse.json({ answer, sources })
    } catch (e) {
        const message = e instanceof Error ? e.message : 'The assistant is unavailable.'
        return NextResponse.json({ error: message, unavailable: true }, { status: 503 })
    }
}
