import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import { resolveHelpViewer } from '@/lib/help/viewer'
import { loadArticle } from '@/lib/help/store'
import { questionTokens, toQuestionView } from '@/lib/help/questions'
import { LIMITS, SLUG_RE } from '@/lib/help/validate'
import { logAction } from '@/lib/logAction'

/**
 * PATCH `/api/help/questions/[id]` `{ pinned?, hidden?, question?, answer?, articleSlug?, outcome? }`
 * — J7 tidies one entry of the living FAQ: pin it to the top, hide it, reword
 * the question, replace the assistant's answer with their own (`answer: ''`
 * goes back to the assistant's), link the guide that answers it, or mark it
 * answered after writing one.
 *
 * DELETE removes the entry outright (its askings are forgotten).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const viewer = await resolveHelpViewer()
    if (!viewer.signedIn || !viewer.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!viewer.canReview) return NextResponse.json({ error: 'Only J7 can edit asked questions.' }, { status: 403 })
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const _id = new ObjectId(id)
    const current = await Db.helpQuestions.findOne({ _id })
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const b = (await req.json().catch(() => null)) ?? {}
    const set: Partial<HelpQuestion> = {}
    const unset: Record<string, ''> = {}
    if (typeof b.pinned === 'boolean') { if (b.pinned) set.pinned = true; else unset.pinned = '' }
    if (typeof b.hidden === 'boolean') { if (b.hidden) set.hidden = true; else unset.hidden = '' }
    if (typeof b.question === 'string') {
        const q = b.question.trim().replace(/\s+/g, ' ').slice(0, 300)
        if (!q) return NextResponse.json({ error: 'The question cannot be empty.' }, { status: 400 })
        set.question = q
        // Keep matching on the words people actually used as well as J7's wording.
        set.tokens = [...new Set([...current.tokens, ...questionTokens(q)])].sort()
    }
    if (typeof b.answer === 'string') {
        const a = b.answer.replace(/\r\n?/g, '\n').trim().slice(0, LIMITS.body)
        if (a) set.editedAnswer = a; else unset.editedAnswer = ''
    }
    if (typeof b.articleSlug === 'string') {
        if (!b.articleSlug) unset.articleSlug = ''
        else if (!SLUG_RE.test(b.articleSlug) || !(await loadArticle(b.articleSlug))) return NextResponse.json({ error: 'No guide with that slug.' }, { status: 400 })
        else set.articleSlug = b.articleSlug
    }
    if (b.outcome === 'answered' || b.outcome === 'unanswered' || b.outcome === 'site-issue') set.outcome = b.outcome
    // J7 writing the answer themselves settles it.
    else if (set.editedAnswer) set.outcome = 'answered'

    await Db.helpQuestions.updateOne({ _id }, { $set: set, ...(Object.keys(unset).length ? { $unset: unset } : {}) })
    await logAction({
        action: 'help.question.update', category: 'system', department: 'j7',
        performedBy: viewer.id, performedByName: viewer.name ?? viewer.id,
        entityType: 'helpQuestion', entityId: id, target: current.question,
        details: { changed: [...Object.keys(set), ...Object.keys(unset)] },
    })
    const updated = await Db.helpQuestions.findOne({ _id })
    return NextResponse.json({ question: updated ? toQuestionView(updated) : null })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const viewer = await resolveHelpViewer()
    if (!viewer.signedIn || !viewer.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!viewer.canReview) return NextResponse.json({ error: 'Only J7 can delete asked questions.' }, { status: 403 })
    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const current = await Db.helpQuestions.findOneAndDelete({ _id: new ObjectId(id) })
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await logAction({
        action: 'help.question.delete', category: 'system', department: 'j7',
        performedBy: viewer.id, performedByName: viewer.name ?? viewer.id,
        entityType: 'helpQuestion', entityId: id, target: current.question,
    })
    return NextResponse.json({ ok: true })
}
