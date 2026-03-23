import Db from '@/lib/mongo'
import dayjs from 'dayjs'
import Link from 'next/link'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import DocBody from './doc-body'
import SectionNav from './section-nav'
import LocalDate from './local-date'
import client from '@/lib/discord'


function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    await connection()

    const [operation, me] = await Promise.all([
        Db.operations.findOne({ _id: new ObjectId(id) }),
        client.fetchMe().catch(() => null),
    ])
    const isLoggedIn = !!me
    const isHQ = me ? client.hasRoles(me, ['HQ Staff']) : false

    if (!operation) return (
        <div className='flex items-center justify-center h-full' style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Operation not found
        </div>
    )

    const { r, g, b } = hexToRgb(operation.themeColor || '#db001d')
    const c = (a: number) => `rgba(${r},${g},${b},${a})`
    const hasCover = !!operation.coverImage
    const hasHiddenSections = !isLoggedIn && (operation.sections?.some(s => !s.isPublic) ?? false)

    return (
        <div className='flex flex-col min-h-full'>

            {/* ── Hero ─────────────────────────────────────────────────────── */}
            <div style={{ position: 'relative', overflow: 'hidden', paddingBottom: 1 }}>

                {/* Cover photo */}
                {hasCover && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={operation.coverImage}
                        alt=''
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', zIndex: 0 }}
                    />
                )}

                {/* Dark overlay when cover is present */}
                {hasCover && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 1,
                        background: `linear-gradient(to bottom, rgba(10,10,10,0.65) 0%, rgba(10,10,10,0.45) 55%, rgba(10,10,10,1) 100%)`,
                    }} />
                )}

                {/* Tactical grid */}
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 2,
                    backgroundImage: `linear-gradient(${c(hasCover ? 0.03 : 0.045)} 1px, transparent 1px), linear-gradient(90deg, ${c(hasCover ? 0.03 : 0.045)} 1px, transparent 1px)`,
                    backgroundSize: '48px 48px',
                }} />

                {/* Radial glow — skip when cover photo is present */}
                {!hasCover && (
                    <div style={{
                        position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
                        width: '80%', height: '200%',
                        background: `radial-gradient(ellipse at 50% 40%, ${c(0.18)} 0%, ${c(0.06)} 35%, transparent 70%)`,
                        zIndex: 2, pointerEvents: 'none',
                    }} />
                )}

                {/* Corner accents */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: 80, height: 80, zIndex: 3, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 40, height: 2, background: c(1), opacity: 0.7 }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 2, height: 40, background: c(1), opacity: 0.7 }} />
                </div>
                <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, zIndex: 3, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 40, height: 2, background: c(1), opacity: 0.7 }} />
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 2, height: 40, background: c(1), opacity: 0.7 }} />
                </div>

                <div
                    className='flex flex-col items-center px-8 text-center'
                    style={{ position: 'relative', zIndex: 4, maxWidth: 960, margin: '0 auto', width: '100%', paddingTop: hasCover ? '7rem' : '4rem', paddingBottom: hasCover ? '8rem' : '5rem' }}
                >
                    {/* Back nav + edit */}
                    <div style={{ position: 'absolute', top: 20, left: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Link
                            href='/operations'
                            style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.28)', textDecoration: 'none' }}
                        >
                            ← Operations
                        </Link>
                        {isHQ && (
                            <>
                                <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)' }} />
                                <Link
                                    href={`/operations/edit?op=${id}`}
                                    style={{ fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: c(0.55), textDecoration: 'none' }}
                                >
                                    Edit
                                </Link>
                            </>
                        )}
                    </div>

                    {/* Department badge */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, border: `1px solid ${c(0.35)}`, padding: '4px 16px', marginBottom: 28, background: c(0.07) }}>
                        <span style={{ width: 4, height: 4, background: c(1), borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase', color: c(0.9) }}>
                            {operation.department || 'Joint Operation'}
                        </span>
                        <span style={{ width: 4, height: 4, background: c(1), borderRadius: '50%', display: 'inline-block', flexShrink: 0 }} />
                    </div>

                    {/* Title */}
                    <h1 style={{
                        fontSize: 'clamp(2rem, 6vw, 3.8rem)',
                        fontWeight: 900,
                        letterSpacing: '0.15em',
                        textTransform: 'uppercase',
                        margin: '0 0 8px',
                        lineHeight: 1.08,
                        background: 'linear-gradient(175deg, #ffffff 20%, rgba(237,237,237,0.55) 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        backgroundClip: 'text',
                        filter: `drop-shadow(0 0 28px ${c(0.55)}) drop-shadow(0 0 8px ${c(0.3)})`,
                        textAlign: 'center',
                    }}>
                        {operation.title}
                    </h1>

                    {/* Decorative rule */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 480, margin: '20px auto 28px' }}>
                        <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${c(0.4)})` }} />
                        <div style={{ width: 5, height: 5, border: `1px solid ${c(0.6)}`, transform: 'rotate(45deg)', flexShrink: 0 }} />
                        <div style={{ flex: 1, height: 1, background: `linear-gradient(to left, transparent, ${c(0.4)})` }} />
                    </div>

                    {/* Meta row */}
                    <div style={{ display: 'flex', gap: 0, flexWrap: 'wrap', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.45)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 32px', borderRight: operation.loreDate ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
                            <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)' }}>Operation Date</span>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.8)' }}>
                                <LocalDate iso={operation.date?.toString() ?? ''} />
                            </span>
                        </div>
                        {operation.loreDate && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 32px' }}>
                                <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)' }}>In-Game Date</span>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: c(0.85) }}>
                                    {dayjs(operation.loreDate).format('DD HHmm MMM YY').toUpperCase()}
                                </span>
                            </div>
                        )}
                    </div>

                </div>

                {/* Bottom fade */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: 'linear-gradient(to bottom, transparent, var(--background))', zIndex: 5, pointerEvents: 'none' }} />
            </div>

            {/* ── Section nav ───────────────────────────────────────────────── */}
            {operation.sections && operation.sections.length > 1 && (
                <SectionNav
                    themeColor={operation.themeColor || '#db001d'}
                    sections={operation.sections
                        .filter(s => isLoggedIn || s.isPublic)
                        .map(s => ({ id: s.id, title: s.title }))}
                />
            )}

            {/* ── Document sections ─────────────────────────────────────────── */}
            <div className='w-full max-w-[900px] mx-auto px-4 md:px-8 pb-16' style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
                {operation.sections && operation.sections.length > 0 ? (
                    operation.sections
                        .filter(s => isLoggedIn || s.isPublic)
                        .map(s => (
                            <div key={s.id} id={`section-${s.id}`} style={{ position: 'relative', border: `1px solid ${c(0.18)}`, borderTop: `2px solid ${c(0.6)}` }}>

                                {/* Corner ticks */}
                                <div style={{ position: 'absolute', bottom: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}>
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 1, background: c(0.45) }} />
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 12, background: c(0.45) }} />
                                </div>
                                <div style={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none', zIndex: 1 }}>
                                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 1, background: c(0.45) }} />
                                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: 12, background: c(0.45) }} />
                                </div>

                                {/* Section header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                                    padding: '8px 20px',
                                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                                    background: 'rgba(0,0,0,0.4)',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{ width: 6, height: 6, background: c(0.7), flexShrink: 0 }} />
                                        <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.8) }}>
                                            {s.title}
                                        </span>
                                    </div>
                                    {isLoggedIn && !s.isPublic && (
                                        <span style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,180,0,0.6)', border: '1px solid rgba(219,180,0,0.25)', padding: '1px 6px' }}>
                                            Classified
                                        </span>
                                    )}
                                </div>

                                {/* Body */}
                                <div style={{ padding: '0 28px' }}>
                                    <DocBody content={s.content ?? null} themeColor={operation.themeColor || '#db001d'} />
                                </div>

                                {/* Footer stamp */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '7px 20px',
                                    borderTop: '1px solid rgba(255,255,255,0.04)',
                                    background: 'rgba(0,0,0,0.25)',
                                }}>
                                    <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)' }}>
                                        ASOT // {s.title}
                                    </span>
                                    <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%' }}>
                                        {operation.title}
                                    </span>
                                </div>

                            </div>
                        ))
                ) : (
                    // Legacy single-body fallback
                    <div style={{ position: 'relative', border: `1px solid ${c(0.18)}`, borderTop: `2px solid ${c(0.6)}` }}>
                        <div style={{ position: 'absolute', bottom: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}>
                            <div style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 1, background: c(0.45) }} />
                            <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 12, background: c(0.45) }} />
                        </div>
                        <div style={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none', zIndex: 1 }}>
                            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 1, background: c(0.45) }} />
                            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: 12, background: c(0.45) }} />
                        </div>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                            padding: '8px 20px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(0,0,0,0.4)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={{ width: 6, height: 6, background: c(0.7), flexShrink: 0 }} />
                                <span style={{ fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.8) }}>
                                    Operation Orders
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                                {operation.status && (
                                    <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                                        {operation.status}
                                    </span>
                                )}
                                {operation.department && (
                                    <>
                                        <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.1)' }} />
                                        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                                            {operation.department}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div style={{ padding: '0 28px' }}>
                            <DocBody content={operation.content ?? null} themeColor={operation.themeColor || '#db001d'} />
                        </div>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '7px 20px',
                            borderTop: '1px solid rgba(255,255,255,0.04)',
                            background: 'rgba(0,0,0,0.25)',
                        }}>
                            <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)' }}>
                                ASOT // End of Order
                            </span>
                            <span style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%' }}>
                                {operation.title}
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Classified banner — shown to logged-out users when sections are hidden */}
            {hasHiddenSections && (
                <a href={`/login?returnTo=/operations/${id}`} style={{ textDecoration: 'none', display: 'block', marginBottom: 64 }}>
                    <div style={{
                        position: 'relative',
                        overflow: 'hidden',
                        padding: '28px 32px',
                        background: 'rgba(180, 80, 0, 0.08)',
                        borderTop: '2px solid rgba(220, 120, 0, 0.5)',
                        borderBottom: '2px solid rgba(220, 120, 0, 0.5)',
                        cursor: 'pointer',
                    }}>
                        {/* Diagonal stripe background */}
                        <div style={{
                            position: 'absolute', inset: 0, pointerEvents: 'none',
                            backgroundImage: 'repeating-linear-gradient(45deg, rgba(220,120,0,0.04) 0px, rgba(220,120,0,0.04) 10px, transparent 10px, transparent 20px)',
                        }} />

                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24 }}>
                            <div style={{ flex: 1, height: 1, background: 'linear-gradient(to right, transparent, rgba(220,120,0,0.4))' }} />
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, letterSpacing: '0.42em', textTransform: 'uppercase', color: 'rgba(220, 140, 0, 0.95)' }}>
                                    ██ Information Classified ██
                                </span>
                                <span style={{ fontSize: '0.6rem', fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.5)' }}>
                                    Login to Access →
                                </span>
                            </div>
                            <div style={{ flex: 1, height: 1, background: 'linear-gradient(to left, transparent, rgba(220,120,0,0.4))' }} />
                        </div>
                    </div>
                </a>
            )}

        </div>
    )
}
