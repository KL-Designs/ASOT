import { NextRequest, NextResponse } from 'next/server'
import { ObjectId } from 'mongodb'
import { resolveModWikiViewer } from '@/lib/mod-wiki/viewer'
import { loadModWikiArticle, saveModWikiArticle } from '@/lib/mod-wiki/store'
import { toModWikiSuggestionView } from '@/lib/mod-wiki/suggestions'
import { SLUG_RE } from '@/lib/mod-wiki/validate'
import Db from '@/lib/mongo'
import { logAction } from '@/lib/logAction'

/** PATCH /api/mod-wiki/suggestions/[id] — approve or reject a suggestion. J7/J4 only. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const viewer = await resolveModWikiViewer()
    if (!viewer.canReview) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: 'Invalid suggestion id.' }, { status: 400 })

    const suggestion = await Db.modWikiSuggestions.findOne({ _id: new ObjectId(id) })
    if (!suggestion) return NextResponse.json({ error: 'Suggestion not found.' }, { status: 404 })
    if (suggestion.status !== 'pending') return NextResponse.json({ error: 'Suggestion already reviewed.' }, { status: 409 })

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = body.action as string
    if (action !== 'approve' && action !== 'reject') return NextResponse.json({ error: 'action must be approve or reject.' }, { status: 400 })

    const now = new Date()
    const reviewNote = typeof body.note === 'string' ? body.note.slice(0, 500) : undefined

    if (action === 'reject') {
        await Db.modWikiSuggestions.updateOne({ _id: new ObjectId(id) }, {
            $set: { status: 'rejected', reviewedById: viewer.id, reviewedByName: viewer.name, reviewedAt: now, reviewNote },
        })
        const updated = await Db.modWikiSuggestions.findOne({ _id: new ObjectId(id) })!
        await logAction({ action: 'mod-wiki.suggestion.rejected', category: 'system', performedBy: viewer.id!, performedByName: viewer.name!, department: 'j7', entityType: 'mod-wiki-suggestion', entityId: id })
        return NextResponse.json({ suggestion: toModWikiSuggestionView(updated! as ModWikiSuggestion & { _id: ObjectId }) })
    }

    // Approve
    if (suggestion.kind === 'edit' || suggestion.kind === 'new') {
        const slug = suggestion.kind === 'edit' ? suggestion.articleSlug! : (body.slug as string)
        if (!slug || !SLUG_RE.test(slug)) return NextResponse.json({ error: 'A valid slug is required to publish.' }, { status: 400 })

        const fields = body.fields as Record<string, unknown> | undefined
        const publishBody: Record<string, unknown> = {
            title: fields?.title ?? suggestion.title,
            summary: fields?.summary ?? suggestion.summary ?? '',
            body: fields?.body ?? suggestion.body,
            category: fields?.category ?? suggestion.category,
            pbos: fields?.pbos ?? [],
            requiredMods: fields?.requiredMods ?? [],
            keywords: fields?.keywords ?? [],
        }

        const current = await loadModWikiArticle(slug)
        if (suggestion.kind === 'new' && current && !(body.force as boolean)) {
            return NextResponse.json({ error: 'An article with this slug already exists. Use force:true to overwrite.' }, { status: 409 })
        }

        const article = await saveModWikiArticle(
            slug,
            { title: String(publishBody.title), summary: String(publishBody.summary), body: String(publishBody.body), category: (publishBody.category ?? 'misc') as ModWikiCategory, pbos: Array.isArray(publishBody.pbos) ? publishBody.pbos : [], requiredMods: Array.isArray(publishBody.requiredMods) ? publishBody.requiredMods : [], keywords: Array.isArray(publishBody.keywords) ? publishBody.keywords : [] },
            { id: viewer.id!, name: viewer.name! },
            'suggestion',
            id,
        )

        await Db.modWikiSuggestions.updateOne({ _id: new ObjectId(id) }, {
            $set: { status: 'approved', reviewedById: viewer.id, reviewedByName: viewer.name, reviewedAt: now, reviewNote },
        })
        const updated = await Db.modWikiSuggestions.findOne({ _id: new ObjectId(id) })!
        await logAction({ action: 'mod-wiki.suggestion.approved', category: 'system', performedBy: viewer.id!, performedByName: viewer.name!, department: 'j7', entityType: 'mod-wiki-suggestion', entityId: id })
        return NextResponse.json({ suggestion: toModWikiSuggestionView(updated! as ModWikiSuggestion & { _id: ObjectId }), publishedSlug: slug })
    }

    // Bug: just mark approved (no article change)
    await Db.modWikiSuggestions.updateOne({ _id: new ObjectId(id) }, {
        $set: { status: 'approved', reviewedById: viewer.id, reviewedByName: viewer.name, reviewedAt: now, reviewNote },
    })
    const updated = await Db.modWikiSuggestions.findOne({ _id: new ObjectId(id) })!
    await logAction({ action: 'mod-wiki.suggestion.approved', category: 'system', performedBy: viewer.id!, performedByName: viewer.name!, department: 'j7', entityType: 'mod-wiki-suggestion', entityId: id })
    return NextResponse.json({ suggestion: toModWikiSuggestionView(updated! as ModWikiSuggestion & { _id: ObjectId }) })
}
