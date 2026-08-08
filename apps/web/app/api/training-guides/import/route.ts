import { NextRequest, NextResponse } from 'next/server'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'
import mammoth from 'mammoth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

function htmlText(fragment: string): string {
    return fragment
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&nbsp;/g, ' ')
        .trim()
}

function parseDocxHtml(html: string): {
    title: string
    duration: string
    trainingAreaDescription: string
    overview: string
    equipment: TrainingGuideEquipmentItem[]
    teachingPoints: TrainingGuideTeachingPoint[]
    notes: string
    warnings: string[]
} {
    // Tokenize block-level elements
    const tokens: Array<{ tag: string; text: string }> = []
    const re = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
        const t = htmlText(m[2])
        if (t) tokens.push({ tag: m[1].toLowerCase(), text: t })
    }

    const warnings: string[] = []
    let title = 'Untitled Training Guide'
    let duration = ''
    let trainingAreaDescription = ''
    let overview = ''
    const equipment: TrainingGuideEquipmentItem[] = []
    const teachingPoints: TrainingGuideTeachingPoint[] = []
    let notes = ''

    const h1 = tokens.find(t => t.tag === 'h1')
    if (h1) {
        title = h1.text
    } else {
        warnings.push('No Heading 1 title found — guide saved as "Untitled Training Guide"')
    }

    type Section = 'none' | 'metadata' | 'overview' | 'equipment' | 'teaching_points' | 'notes'
    let section: Section = 'none'
    let currentTP: TrainingGuideTeachingPoint | null = null
    let tpSub: 'dot' | 'vital' | 'fault' | null = null

    for (const tok of tokens) {
        if (tok.tag === 'h1') continue

        if (tok.tag === 'h2') {
            const upper = tok.text.toUpperCase()
            if (upper.includes('METADATA')) { section = 'metadata'; currentTP = null; continue }
            if (upper.includes('OVERVIEW')) { section = 'overview'; currentTP = null; continue }
            if (upper.includes('EQUIPMENT')) { section = 'equipment'; currentTP = null; continue }
            if (upper.includes('TEACHING POINT')) { section = 'teaching_points'; continue }
            if (upper === 'NOTES') { section = 'notes'; currentTP = null; continue }
            warnings.push(`Unrecognised H2 section skipped: "${tok.text}"`)
            section = 'none'
            continue
        }

        switch (section) {
            case 'metadata':
                if (tok.tag === 'p') {
                    const lc = tok.text.toLowerCase()
                    const colonIdx = tok.text.indexOf(':')
                    const value = colonIdx !== -1 ? tok.text.slice(colonIdx + 1).trim() : ''
                    if (lc.startsWith('duration:')) duration = value
                    else if (lc.startsWith('training area:')) trainingAreaDescription = value
                }
                break

            case 'overview':
                if (tok.tag === 'p') overview = overview ? `${overview}\n\n${tok.text}` : tok.text
                break

            case 'equipment':
                if (tok.tag === 'li') equipment.push({ id: randomUUID(), text: tok.text })
                break

            case 'teaching_points':
                if (tok.tag === 'h3') {
                    currentTP = {
                        id: randomUUID(),
                        title: tok.text,
                        dotPoints: [],
                        vitalPoints: [],
                        commonFaults: [],
                        images: [],
                    }
                    teachingPoints.push(currentTP)
                    tpSub = null
                } else if (tok.tag === 'h4' && currentTP) {
                    const upper = tok.text.toUpperCase()
                    if (upper.includes('DOT')) tpSub = 'dot'
                    else if (upper.includes('VITAL')) tpSub = 'vital'
                    else if (upper.includes('FAULT')) tpSub = 'fault'
                    else tpSub = null
                } else if (tok.tag === 'li' && currentTP) {
                    if (tpSub === 'dot' || tpSub === null) {
                        currentTP.dotPoints.push({ id: randomUUID(), text: tok.text })
                    } else if (tpSub === 'vital') {
                        currentTP.vitalPoints.push({ id: randomUUID(), text: tok.text })
                    } else if (tpSub === 'fault') {
                        const pipeIdx = tok.text.indexOf('|')
                        const fault = (pipeIdx !== -1 ? tok.text.slice(0, pipeIdx) : tok.text)
                            .replace(/^FAULT:\s*/i, '').trim()
                        const correction = (pipeIdx !== -1 ? tok.text.slice(pipeIdx + 1) : '')
                            .replace(/^CORRECTION:\s*/i, '').trim()
                        currentTP.commonFaults.push({ id: randomUUID(), fault, correction })
                    }
                }
                break

            case 'notes':
                if (tok.tag === 'p') notes = notes ? `${notes}\n\n${tok.text}` : tok.text
                break
        }
    }

    if (teachingPoints.length === 0) warnings.push('No teaching points found in document')

    return { title, duration, trainingAreaDescription, overview, equipment, teachingPoints, notes, warnings }
}

export async function POST(req: NextRequest) {
    const me = await client.fetchMe().catch(() => null)
    if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!client.hasRoles(me, PERMISSIONS.trainingGuides.write)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const formData = await req.formData().catch(() => null)
    if (!formData) return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })

    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    if (!file.name.toLowerCase().endsWith('.docx')) {
        return NextResponse.json({ error: 'File must be a .docx document' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())

    let htmlResult: Awaited<ReturnType<typeof mammoth.convertToHtml>>
    try {
        htmlResult = await mammoth.convertToHtml({ buffer })
    } catch {
        return NextResponse.json({ error: 'Failed to parse DOCX — ensure the file is a valid .docx document' }, { status: 422 })
    }

    const parsed = parseDocxHtml(htmlResult.value)
    const mammothWarnings = htmlResult.messages
        .filter(m => m.type === 'warning')
        .map(m => m.message)
    const allWarnings = [...mammothWarnings, ...parsed.warnings]

    const name = me.guild?.nickname || me.guild?.displayName || me.globalName || me.username || ''
    const count = await Db.trainingGuides.countDocuments({})
    const docRef = `TRG-${String(count + 1).padStart(3, '0')}`
    const now = new Date()

    const guide: Omit<TrainingGuide, '_id'> = {
        docRef,
        title: parsed.title,
        accentColor: '#db001d',
        guideType: 'trainers_guide',
        status: 'draft',
        version: '1.0',
        lastRevisedAt: now,
        duration: parsed.duration,
        overview: parsed.overview,
        equipment: parsed.equipment,
        trainingAreaDescription: parsed.trainingAreaDescription,
        teachingPoints: parsed.teachingPoints,
        notes: parsed.notes,
        createdAt: now,
        createdById: me.id,
        createdByName: name,
        updatedAt: now,
        updatedById: me.id,
        updatedByName: name,
        editHistory: [{ at: now, byId: me.id, byName: name, type: 'created' }],
        contentBaseline: '{}',
    }

    const result = await Db.trainingGuides.insertOne(guide as TrainingGuide)

    return NextResponse.json({
        guideId: result.insertedId.toString(),
        docRef,
        title: parsed.title,
        teachingPointCount: parsed.teachingPoints.length,
        warnings: allWarnings,
    })
}
