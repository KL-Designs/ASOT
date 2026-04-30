import { ImageResponse } from 'next/og'
import { ObjectId } from 'mongodb'
import Db from '@/lib/mongo'
import fs from 'fs'

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

function fmt(date: Date) {
    const tz = 'Australia/Sydney'
    const parts = new Intl.DateTimeFormat('en-AU', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true,
        timeZone: tz, timeZoneName: 'short',
    }).formatToParts(date)
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
    return `${get('day')} ${get('month')} ${get('year')} — ${get('hour')}:${get('minute')} ${get('dayPeriod')} ${get('timeZoneName')}`.toUpperCase()
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    let operation: Operation | null = null
    try {
        operation = await Db.operations.findOne({ _id: new ObjectId(id) })
    } catch { /* invalid id */ }

    const accent = operation?.themeColor || '#db001d'
    const { r, g, b } = hexToRgb(accent)
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    if (!operation) {
        return new ImageResponse(
            <div style={{ width: '100%', height: '100%', background: 'rgb(10,10,10)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: 'rgba(237,237,237,0.25)', fontSize: 28, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    Operation Not Found
                </span>
            </div>,
            { ...size }
        )
    }

    // Read cover image directly from disk (URL is /api/operations/image?id=X&ext=Y)
    let coverDataUrl: string | null = null
    if (operation.coverImage) {
        try {
            const url = new URL(operation.coverImage, 'http://localhost')
            const imgId = url.searchParams.get('id')
            const ext = url.searchParams.get('ext') || 'jpg'
            if (imgId) {
                const buf = fs.readFileSync(`./uploads/operations/${imgId}.${ext}`)
                const mimeMap: Record<string, string> = { png: 'image/png', gif: 'image/gif', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg' }
                coverDataUrl = `data:${mimeMap[ext] ?? 'image/jpeg'};base64,${buf.toString('base64')}`
            }
        } catch { /* skip if file missing */ }
    }

    const title = operation.title || 'Untitled Operation'
    const department = operation.department || 'Joint Operation'
    const date = operation.date ? fmt(new Date(operation.date)) : null

    // Scale title font based on length
    const titleSize = title.length > 28 ? 52 : title.length > 20 ? 64 : title.length > 14 ? 80 : 96

    return new ImageResponse(
        <div
            style={{
                width: '100%',
                height: '100%',
                background: 'rgb(10,10,10)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                fontFamily: 'sans-serif',
                position: 'relative',
            }}
        >
            {/* Cover photo */}
            {coverDataUrl && (
                <img
                    src={coverDataUrl}
                    alt=''
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }}
                />
            )}

            {/* Dark overlay — heavier when no cover */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
                background: coverDataUrl
                    ? 'linear-gradient(to bottom, rgba(10,10,10,0.72) 0%, rgba(10,10,10,0.60) 40%, rgba(10,10,10,0.97) 100%)'
                    : `linear-gradient(150deg, rgba(10,10,10,1) 0%, rgba(10,10,10,0.92) 100%)`,
            }} />

            {/* Ambient theme glow — top-left */}
            <div style={{
                position: 'absolute', top: -120, left: -80, width: 600, height: 500, display: 'flex',
                background: `radial-gradient(ellipse at 30% 40%, ${c(coverDataUrl ? 0.14 : 0.22)} 0%, ${c(0.06)} 45%, transparent 70%)`,
            }} />

            {/* Tactical grid */}
            <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex',
                backgroundImage: `linear-gradient(${c(0.06)} 1px, transparent 1px), linear-gradient(90deg, ${c(0.06)} 1px, transparent 1px)`,
                backgroundSize: '60px 60px',
            }} />

            {/* Top-left corner bracket */}
            <div style={{ position: 'absolute', top: 36, left: 48, display: 'flex' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, width: 40, height: 3, background: c(0.9) }} />
                <div style={{ position: 'absolute', top: 0, left: 0, width: 3, height: 40, background: c(0.9) }} />
            </div>
            {/* Top-right corner bracket */}
            <div style={{ position: 'absolute', top: 36, right: 48, display: 'flex' }}>
                <div style={{ position: 'absolute', top: 0, right: 0, width: 40, height: 3, background: c(0.9) }} />
                <div style={{ position: 'absolute', top: 0, right: 0, width: 3, height: 40, background: c(0.9) }} />
            </div>
            {/* Bottom-left corner bracket */}
            <div style={{ position: 'absolute', bottom: 36, left: 48, display: 'flex' }}>
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 40, height: 3, background: c(0.9) }} />
                <div style={{ position: 'absolute', bottom: 0, left: 0, width: 3, height: 40, background: c(0.9) }} />
            </div>
            {/* Bottom-right corner bracket */}
            <div style={{ position: 'absolute', bottom: 36, right: 48, display: 'flex' }}>
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 40, height: 3, background: c(0.9) }} />
                <div style={{ position: 'absolute', bottom: 0, right: 0, width: 3, height: 40, background: c(0.9) }} />
            </div>

            {/* Left accent bar */}
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 5, background: `linear-gradient(to bottom, ${c(0)}, ${c(0.9)} 30%, ${c(0.9)} 70%, ${c(0)})`, display: 'flex' }} />

            {/* Main content */}
            <div style={{
                position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'center',
                flex: 1, padding: '60px 80px 60px 85px',
            }}>

                {/* Department badge */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28,
                    border: `1px solid ${c(0.4)}`,
                    background: c(0.1),
                    padding: '8px 20px',
                    alignSelf: 'flex-start',
                }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: c(1), display: 'flex' }} />
                    <span style={{
                        fontSize: 18, fontWeight: 800, letterSpacing: '0.28em',
                        textTransform: 'uppercase', color: c(0.95),
                    }}>
                        {department}
                    </span>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: c(1), display: 'flex' }} />
                </div>

                {/* Operation title */}
                <div style={{
                    fontSize: titleSize,
                    fontWeight: 900,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'rgba(237,237,237,0.96)',
                    lineHeight: 1.06,
                    maxWidth: 980,
                    display: 'flex',
                    flexWrap: 'wrap',
                    textShadow: `0 0 60px ${c(0.6)}, 0 0 20px ${c(0.35)}`,
                }}>
                    {title}
                </div>

                {/* Decorative rule */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '28px 0', maxWidth: 500 }}>
                    <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, ${c(0.5)}, ${c(0.1)})`, display: 'flex' }} />
                    <div style={{ width: 7, height: 7, border: `1.5px solid ${c(0.7)}`, transform: 'rotate(45deg)', display: 'flex' }} />
                    <div style={{ width: 40, height: 1, background: c(0.2), display: 'flex' }} />
                </div>

                {/* Meta row */}
                <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
                    {date && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)' }}>
                                Operation Date
                            </span>
                            <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.82)' }}>
                                {date}
                            </span>
                        </div>
                    )}
                    <div style={{ width: 1, height: 36, background: 'rgba(255,255,255,0.1)', display: 'flex' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)' }}>
                            Orders From
                        </span>
                        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '0.1em', color: c(0.9) }}>
                            {department}
                        </span>
                    </div>
                </div>
            </div>

            {/* Footer bar */}
            <div style={{
                position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 85px', borderTop: `1px solid rgba(255,255,255,0.06)`,
                background: 'rgba(0,0,0,0.45)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 4, height: 4, borderRadius: '50%', background: c(0.5), display: 'flex' }} />
                    <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)' }}>
                        Australian Special Operations Task Force
                    </span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: c(0.4) }}>
                    CLASSIFIED BRIEFING
                </span>
            </div>
        </div>,
        { ...size }
    )
}
