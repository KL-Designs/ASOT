import { NextRequest, NextResponse } from 'next/server'
import { callText } from '@/lib/ai/service'
import { DOCTRINE_IMPORT_SYSTEM_PROMPT, doctrineSchemaForPrompt, extractJson, mergeAiDoctrine } from '@/lib/doctrine/ai-import'
import { sanitiseValues } from '@/lib/doctrine/values'
import { doctrineGate } from '../../gate'

export const dynamic = 'force-dynamic'

/**
 * Row 334: Import Enemy Doctrine's Check. The AI places a free-form write-up
 * into the builder's questions; the result is merged onto the values the
 * builder sent and handed back for the member to look over. Nothing is saved.
 * When AI is off or fails, 503, and the builder falls back to the
 * "Question: answer" reader.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const gate = await doctrineGate(id)
    if ('error' in gate) return gate.error
    if (!gate.standing.canEdit) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const body = await req.json().catch(() => ({})) as { text?: unknown; values?: unknown }
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    if (!text) return NextResponse.json({ error: 'Nothing to import.' }, { status: 400 })
    if (text.length > 120_000) return NextResponse.json({ error: 'That is too long to read in one go. Import it in parts.' }, { status: 400 })

    let reply: string
    try {
        const res = await callText({
            systemPrompt: DOCTRINE_IMPORT_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: `${doctrineSchemaForPrompt()}\n\nDOCUMENT:\n${text}` }],
            maxTokens: 8000,
        }, { userId: gate.by.id, userName: gate.by.name, feature: 'doctrine.import', relatedId: id })
        reply = res.content
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : 'The AI could not read it.' }, { status: 503 })
    }
    const parsed = extractJson(reply)
    if (!parsed) return NextResponse.json({ error: 'The AI reply could not be read.' }, { status: 503 })
    return NextResponse.json(mergeAiDoctrine(parsed, sanitiseValues(body.values)))
}
