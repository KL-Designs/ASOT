import { NextRequest, NextResponse } from 'next/server'
import { callText } from '@/lib/ai/service'
import { resolveHelpViewer } from '@/lib/help/viewer'
import { loadVisibleArticles } from '@/lib/help/store'
import { ASK_MAX_QUESTION, buildAskSystemPrompt, citedSlugs, pickArticles, sanitiseHistory } from '@/lib/help/ai'
import { answerScope, parseAskReply } from '@/lib/help/questions'
import { recordQuestion } from '@/lib/help/questions-db'
import { cleanPath } from '@/lib/help/validate'

/**
 * POST `/api/help/ask` `{ question, pathname?, pageTitle?, history? }` — the
 * help wiki's live question box. Answers from the articles the asker may read
 * (`lib/help/ai.ts` picks them), through `callText`, so AI budgets, the J4
 * master switch and usage logging (`help.ask`) all apply. Gated on
 * `PERMISSIONS.ai.use`, like every other AI feature.
 *
 * The conversation itself lives in the reader's browser and comes back as
 * `history`. Each question (not who asked it, beyond a de-duplicating id) is
 * folded into `help_questions` (`lib/help/questions-db.ts`): that feeds the
 * living FAQ, and raises unanswered questions, likely site faults and
 * often-asked questions with J7. `raised` says which, if any, this time.
 */
export async function POST(req: NextRequest) {
    const viewer = await resolveHelpViewer()
    if (!viewer.signedIn || !viewer.id) return NextResponse.json({ error: 'Sign in to ask a question.' }, { status: 401 })
    if (!viewer.canAsk) return NextResponse.json({ error: "Your account can't use the AI assistant." }, { status: 403 })

    const body = await req.json().catch(() => null)
    const question = typeof body?.question === 'string' ? body.question.trim().slice(0, ASK_MAX_QUESTION) : ''
    if (!question) return NextResponse.json({ error: 'Write a question first.' }, { status: 400 })
    const pathname = (typeof body?.pathname === 'string' && cleanPath(body.pathname)) || '/'
    const pageTitle = typeof body?.pageTitle === 'string' ? body.pageTitle.trim().slice(0, 80) : undefined
    const history = sanitiseHistory(body?.history)

    const articles = await loadVisibleArticles(viewer)
    const picked = pickArticles(articles, question, pathname, history)

    let reply: string
    try {
        const result = await callText(
            {
                systemPrompt: buildAskSystemPrompt(picked, pathname, pageTitle),
                messages: [...history, { role: 'user', content: question }],
                maxTokens: 700,
            },
            { userId: viewer.id, userName: viewer.name ?? viewer.id, roles: viewer.user?.guild?.roles ?? [], feature: 'help.ask', relatedId: pathname },
        )
        reply = result.content
    } catch (e) {
        const message = e instanceof Error ? e.message : 'The assistant is unavailable.'
        return NextResponse.json({ error: message, unavailable: true }, { status: 503 })
    }

    const { answer, outcome, issue } = parseAskReply(reply)
    const known = new Set(articles.map(a => a.slug))
    const cited = citedSlugs(answer, known)
    const sources = cited.map(slug => articles.find(a => a.slug === slug)!).map(a => ({ slug: a.slug, title: a.title }))

    // A follow-up ("and how do I undo that?") means little on its own, so only
    // first questions of a conversation go into the FAQ. Never fails the answer.
    let raised: HelpSuggestionKind | null = null
    if (!history.length) {
        raised = await recordQuestion({
            question, pathname, askerId: viewer.id, answer, sources: cited, outcome, issue,
            scope: answerScope(picked, cited),
        }).then(r => r.raised).catch(() => null)
    }
    return NextResponse.json({ answer, sources, outcome, raised })
}
