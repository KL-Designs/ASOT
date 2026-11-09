import { NextRequest, NextResponse } from 'next/server'
import { documentToText, storePhoto } from '@/lib/doctrine/import-files'
import { doctrineGate } from '../../gate'

export const dynamic = 'force-dynamic'

/**
 * Row 334: files for Import Enemy Doctrine. `document` is a Word file, read
 * to text for the importer (nothing is saved to the doctrine here); `photos`
 * are stored and added to the image library. Returns the text and the
 * photos' addresses.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const gate = await doctrineGate(id)
    if ('error' in gate) return gate.error
    if (!gate.standing.canEdit) return NextResponse.json({ error: 'Access Denied' }, { status: 403 })

    const form = await req.formData().catch(() => null)
    if (!form) return NextResponse.json({ error: 'Send the files as a form.' }, { status: 400 })

    const photos: string[] = []
    for (const f of form.getAll('photos').slice(0, 40)) {
        if (!(f instanceof File)) continue
        const url = await storePhoto(Buffer.from(await f.arrayBuffer()), gate.by)
        if (url) photos.push(url)
    }

    let text = ''
    let documentImages = 0
    const doc = form.get('document')
    if (doc instanceof File) {
        if (!/\.docx$/i.test(doc.name)) return NextResponse.json({ error: 'Import a Word document (.docx). For a PDF or anything else, copy the text in instead.' }, { status: 400 })
        if (doc.size > 40 * 1024 * 1024) return NextResponse.json({ error: 'That document is too large.' }, { status: 400 })
        try {
            const r = await documentToText(Buffer.from(await doc.arrayBuffer()), gate.by)
            text = r.text
            documentImages = r.images
        } catch {
            return NextResponse.json({ error: 'That document could not be read.' }, { status: 400 })
        }
    }
    return NextResponse.json({ text, photos, documentImages })
}
