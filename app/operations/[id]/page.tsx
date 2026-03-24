import Db from '@/lib/mongo'
import dayjs from 'dayjs'
import Link from 'next/link'
import { connection } from 'next/server'
import { ObjectId } from 'mongodb'
import DocBody from './doc-body'
import SectionNav from './section-nav'
import LocalDate from './local-date'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'


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
    const isHQ = me ? client.hasRoles(me, PERMISSIONS.pages.operationsEdit) : false

    if (!operation) return (
        <div className='flex items-center justify-center h-full' style={{ color: 'rgba(237,237,237,0.3)', fontSize: '0.85rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Operation not found
        </div>
    )

    const { r, g, b } = hexToRgb(operation.themeColor || '#db001d')
    const c = (a: number) => `rgba(${r},${g},${b},${a})`
    const hasCover = !!operation.coverImage
    const hasHiddenSections = !isLoggedIn && (operation.sections?.some(s => !s.isPublic) ?? false)

    const pageTheme = (operation.pageTheme || 'modern') as 'modern' | 'oldfashioned' | 'scifi'
    const isOF = pageTheme === 'oldfashioned'
    const isSF = pageTheme === 'scifi'
    const isModern = pageTheme === 'modern'

    return (
        <div
            className='flex flex-col min-h-full'
            style={isOF ? { background: '#f5ead8', fontFamily: 'Georgia, "Times New Roman", serif' } : isSF ? { background: '#01050a' } : undefined}
        >

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

                {/* Tactical grid / ruled lines */}
                <div style={isOF ? {
                    position: 'absolute', inset: 0, zIndex: 2,
                    backgroundImage: `repeating-linear-gradient(to bottom, rgba(90,55,20,0.08) 0px, rgba(90,55,20,0.08) 1px, transparent 1px, transparent 28px)`,
                } : isSF ? {
                    position: 'absolute', inset: 0, zIndex: 2,
                    backgroundImage: `linear-gradient(${c(hasCover ? 0.06 : 0.1)} 1px, transparent 1px), linear-gradient(90deg, ${c(hasCover ? 0.06 : 0.1)} 1px, transparent 1px)`,
                    backgroundSize: '28px 28px',
                    boxShadow: `inset 0 0 80px ${c(0.06)}`,
                } : {
                    position: 'absolute', inset: 0, zIndex: 2,
                    backgroundImage: `linear-gradient(${c(hasCover ? 0.03 : 0.045)} 1px, transparent 1px), linear-gradient(90deg, ${c(hasCover ? 0.03 : 0.045)} 1px, transparent 1px)`,
                    backgroundSize: '48px 48px',
                }} />

                {/* Radial glow — modern only when no cover */}
                {!hasCover && isModern && (
                    <div style={{
                        position: 'absolute', top: '-30%', left: '50%', transform: 'translateX(-50%)',
                        width: '80%', height: '200%',
                        background: `radial-gradient(ellipse at 50% 40%, ${c(0.18)} 0%, ${c(0.06)} 35%, transparent 70%)`,
                        zIndex: 2, pointerEvents: 'none',
                    }} />
                )}

                {/* Sci-fi radial glow */}
                {!hasCover && isSF && (
                    <div style={{
                        position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
                        width: '70%', height: '180%',
                        background: `radial-gradient(ellipse at 50% 40%, ${c(0.12)} 0%, ${c(0.04)} 40%, transparent 70%)`,
                        zIndex: 2, pointerEvents: 'none',
                        filter: `blur(2px)`,
                    }} />
                )}

                {/* Corner accents — top left */}
                <div style={{ position: 'absolute', top: 0, left: 0, width: 80, height: 80, zIndex: 3, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', top: 0, left: 0, width: 50, height: isOF ? 3 : 2, background: isOF ? 'rgba(90,55,20,0.7)' : c(1), opacity: isOF ? 1 : 0.7, ...(isSF ? { boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)` } : {}) }} />
                    <div style={{ position: 'absolute', top: 0, left: 0, width: isOF ? 3 : 2, height: 50, background: isOF ? 'rgba(90,55,20,0.7)' : c(1), opacity: isOF ? 1 : 0.7, ...(isSF ? { boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)` } : {}) }} />
                </div>
                {/* Corner accents — top right */}
                <div style={{ position: 'absolute', top: 0, right: 0, width: 80, height: 80, zIndex: 3, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', top: 0, right: 0, width: 50, height: isOF ? 3 : 2, background: isOF ? 'rgba(90,55,20,0.7)' : c(1), opacity: isOF ? 1 : 0.7, ...(isSF ? { boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)` } : {}) }} />
                    <div style={{ position: 'absolute', top: 0, right: 0, width: isOF ? 3 : 2, height: 50, background: isOF ? 'rgba(90,55,20,0.7)' : c(1), opacity: isOF ? 1 : 0.7, ...(isSF ? { boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)` } : {}) }} />
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
                    <div style={isOF ? {
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        border: '2px solid rgba(90,55,20,0.6)',
                        outline: '1px solid rgba(90,55,20,0.25)',
                        outlineOffset: 3,
                        padding: '5px 20px',
                        marginBottom: 28,
                        background: 'rgba(230,210,170,0.5)',
                        letterSpacing: '0.04em',
                    } : isSF ? {
                        display: 'inline-flex', alignItems: 'center', gap: 10,
                        border: `1px solid ${c(0.55)}`,
                        padding: '4px 16px',
                        marginBottom: 28,
                        background: c(0.06),
                        boxShadow: `0 0 12px ${c(0.15)}, inset 0 0 12px ${c(0.04)}`,
                    } : {
                        display: 'inline-flex', alignItems: 'center', gap: 10,
                        border: `1px solid ${c(0.35)}`,
                        padding: '4px 16px',
                        marginBottom: 28,
                        background: c(0.07),
                    }}>
                        <span style={isOF ? {
                            width: 6, height: 6, background: 'rgba(90,55,20,0.7)', borderRadius: 0, display: 'inline-block', flexShrink: 0,
                        } : isSF ? {
                            width: 4, height: 4, background: c(1), borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                            boxShadow: `0 0 4px rgba(${r},${g},${b},1)`,
                        } : {
                            width: 4, height: 4, background: c(1), borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                        }} />
                        <span style={isOF ? {
                            fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#3d2b1a', fontFamily: 'Georgia, serif',
                        } : isSF ? {
                            fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase', color: c(0.9),
                            textShadow: `0 0 6px rgba(${r},${g},${b},0.7)`,
                        } : {
                            fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.26em', textTransform: 'uppercase', color: c(0.9),
                        }}>
                            {operation.department || 'Joint Operation'}
                        </span>
                        <span style={isOF ? {
                            width: 6, height: 6, background: 'rgba(90,55,20,0.7)', borderRadius: 0, display: 'inline-block', flexShrink: 0,
                        } : isSF ? {
                            width: 4, height: 4, background: c(1), borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                            boxShadow: `0 0 4px rgba(${r},${g},${b},1)`,
                        } : {
                            width: 4, height: 4, background: c(1), borderRadius: '50%', display: 'inline-block', flexShrink: 0,
                        }} />
                    </div>

                    {/* Title */}
                    <h1 style={isOF ? {
                        fontSize: 'clamp(1.8rem, 5vw, 3.2rem)',
                        fontWeight: 700,
                        fontFamily: 'Georgia, "Times New Roman", serif',
                        fontStyle: 'italic',
                        letterSpacing: '0.02em',
                        textTransform: 'none',
                        margin: '0 0 8px',
                        lineHeight: 1.15,
                        color: '#2a1a08',
                        textAlign: 'center',
                    } : isSF ? {
                        fontSize: 'clamp(1.8rem, 5vw, 3.4rem)',
                        fontWeight: 900,
                        letterSpacing: '0.2em',
                        textTransform: 'uppercase',
                        fontFamily: '"Courier New", Courier, monospace',
                        margin: '0 0 8px',
                        lineHeight: 1.08,
                        color: c(1),
                        textAlign: 'center',
                        textShadow: `0 0 30px ${c(0.7)}, 0 0 60px ${c(0.4)}, 0 0 100px ${c(0.2)}`,
                    } : {
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
                        filter: `drop-shadow(0 0 50px ${c(0.55)}) drop-shadow(0 0 8px ${c(0.3)})`,
                        textAlign: 'center',
                    }}>
                        {operation.title}
                    </h1>

                    {/* Decorative rule */}
                    {isOF ? (
                        <div style={{ width: '100%', maxWidth: 480, margin: '20px auto 28px', display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <div style={{ height: 2, background: 'rgba(90,55,20,0.4)' }} />
                            <div style={{ height: 1, background: 'rgba(90,55,20,0.2)' }} />
                        </div>
                    ) : isSF ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', maxWidth: 480, margin: '20px auto 28px' }}>
                            <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${c(0.5)})`, boxShadow: `0 0 4px ${c(0.3)}` }} />
                            <div style={{ display: 'flex', gap: 3 }}>
                                {[...Array(3)].map((_, i) => <div key={i} style={{ width: 4, height: 4, background: c(0.7), boxShadow: `0 0 4px ${c(0.8)}` }} />)}
                            </div>
                            <div style={{ flex: 1, height: 1, background: `linear-gradient(to left, transparent, ${c(0.5)})`, boxShadow: `0 0 4px ${c(0.3)}` }} />
                        </div>
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', maxWidth: 480, margin: '20px auto 28px' }}>
                            <div style={{ flex: 1, height: 1, background: `linear-gradient(to right, transparent, ${c(0.4)})` }} />
                            <div style={{ width: 5, height: 5, border: `1px solid ${c(0.6)}`, transform: 'rotate(45deg)', flexShrink: 0 }} />
                            <div style={{ flex: 1, height: 1, background: `linear-gradient(to left, transparent, ${c(0.4)})` }} />
                        </div>
                    )}

                    {/* Meta row */}
                    <div style={isOF ? {
                        display: 'flex', gap: 0, flexWrap: 'wrap', justifyContent: 'center',
                        border: '2px solid rgba(90,55,20,0.5)',
                        background: 'rgba(230,210,170,0.4)',
                    } : isSF ? {
                        display: 'flex', gap: 0, flexWrap: 'wrap', justifyContent: 'center',
                        border: `1px solid ${c(0.35)}`,
                        background: 'rgba(0,8,16,0.7)',
                        boxShadow: `0 0 16px ${c(0.1)}, inset 0 0 20px ${c(0.03)}`,
                    } : {
                        display: 'flex', gap: 0, flexWrap: 'wrap', justifyContent: 'center',
                        border: '1px solid rgba(255,255,255,0.06)',
                        background: 'rgba(0,0,0,0.45)',
                    }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 32px', borderRight: operation.loreDate ? (isOF ? '1px solid rgba(90,55,20,0.25)' : isSF ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(255,255,255,0.06)') : undefined }}>
                            <span style={isOF ? {
                                fontSize: '0.6rem', fontWeight: 400, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(60,35,10,0.45)', fontFamily: 'Georgia, serif',
                            } : isSF ? {
                                fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: c(0.55), fontFamily: '"Courier New", monospace',
                            } : {
                                fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)',
                            }}>Operation Date</span>
                            <span style={isOF ? {
                                fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.02em', color: '#2a1a08', fontFamily: 'Georgia, serif',
                            } : isSF ? {
                                fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: c(1), textShadow: `0 0 6px rgba(${r},${g},${b},0.5)`, fontFamily: '"Courier New", monospace',
                            } : {
                                fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: 'rgba(237,237,237,0.8)',
                            }}>
                                <LocalDate iso={operation.date?.toString() ?? ''} />
                            </span>
                        </div>
                        {operation.loreDate && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '14px 32px' }}>
                                <span style={isOF ? {
                                    fontSize: '0.6rem', fontWeight: 400, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(60,35,10,0.45)', fontFamily: 'Georgia, serif',
                                } : isSF ? {
                                    fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: c(0.55), fontFamily: '"Courier New", monospace',
                                } : {
                                    fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.22)',
                                }}>In-Game Date</span>
                                <span style={isOF ? {
                                    fontSize: '0.85rem', fontWeight: 700, letterSpacing: '0.02em', color: c(1), fontFamily: 'Georgia, serif',
                                } : isSF ? {
                                    fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: c(1), textShadow: `0 0 6px rgba(${r},${g},${b},0.6)`, fontFamily: '"Courier New", monospace',
                                } : {
                                    fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', color: c(0.85),
                                }}>
                                    {dayjs(operation.loreDate).format('DD HHmm MMM YY').toUpperCase()}
                                </span>
                            </div>
                        )}
                    </div>

                </div>

                {/* Bottom fade */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 80, background: isOF ? 'linear-gradient(to bottom, transparent, #f5ead8)' : 'linear-gradient(to bottom, transparent, var(--background))', zIndex: 5, pointerEvents: 'none' }} />
            </div>

            {/* ── Section nav ───────────────────────────────────────────────── */}
            {operation.sections && operation.sections.length > 1 && (
                <SectionNav
                    themeColor={operation.themeColor || '#db001d'}
                    pageTheme={pageTheme}
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
                            <div key={s.id} id={`section-${s.id}`} style={isOF ? {
                                position: 'relative',
                                border: '2px solid rgba(90,55,20,0.4)',
                                borderTop: `3px solid ${c(1)}`,
                                background: 'rgba(240,225,195,0.6)',
                            } : isSF ? {
                                position: 'relative',
                                border: `1px solid ${c(0.3)}`,
                                borderTop: `2px solid ${c(0.8)}`,
                                boxShadow: `0 0 16px ${c(0.08)}, inset 0 0 20px ${c(0.02)}`,
                            } : {
                                position: 'relative',
                                border: `1px solid ${c(0.18)}`,
                                borderTop: `2px solid ${c(0.6)}`,
                            }}>

                                {/* Corner ticks — hidden in oldfashioned */}
                                {!isOF && (
                                    <>
                                        <div style={{ position: 'absolute', bottom: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}>
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 1, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                            <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 12, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                        </div>
                                        <div style={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none', zIndex: 1 }}>
                                            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 1, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                            <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: 12, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                        </div>
                                    </>
                                )}

                                {/* Section header */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                                    padding: '8px 20px',
                                    borderBottom: isOF ? '1px solid rgba(90,55,20,0.2)' : isSF ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.06)',
                                    background: isOF ? 'rgba(205,182,140,0.5)' : isSF ? c(0.06) : 'rgba(0,0,0,0.4)',
                                    ...(isSF ? { boxShadow: `inset 0 0 20px rgba(${r},${g},${b},0.05)` } : {}),
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={isOF ? {
                                            width: 8, height: 8, background: c(1), flexShrink: 0, borderRadius: 0,
                                        } : isSF ? {
                                            width: 6, height: 6, background: c(0.8), flexShrink: 0, boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)`,
                                        } : {
                                            width: 6, height: 6, background: c(0.7), flexShrink: 0,
                                        }} />
                                        <span style={isOF ? {
                                            fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#3d2b1a', fontFamily: 'Georgia, serif',
                                        } : isSF ? {
                                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.9), textShadow: `0 0 6px rgba(${r},${g},${b},0.5)`, fontFamily: '"Courier New", monospace',
                                        } : {
                                            fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.8),
                                        }}>
                                            {s.title}
                                        </span>
                                    </div>
                                    {isLoggedIn && !s.isPublic && (
                                        <span style={isOF ? {
                                            fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(150,60,20,0.85)', border: '1px solid rgba(150,60,20,0.4)', padding: '1px 8px', fontFamily: 'Georgia, serif',
                                        } : {
                                            fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,180,0,0.6)', border: '1px solid rgba(219,180,0,0.25)', padding: '1px 6px',
                                        }}>
                                            Classified
                                        </span>
                                    )}
                                </div>

                                {/* Body */}
                                <div style={{ padding: '0 28px' }}>
                                    <DocBody content={s.content ?? null} themeColor={operation.themeColor || '#db001d'} pageTheme={pageTheme} />
                                </div>

                                {/* Footer stamp */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '7px 20px',
                                    borderTop: isOF ? '1px solid rgba(90,55,20,0.15)' : isSF ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(255,255,255,0.04)',
                                    background: isOF ? 'rgba(205,182,140,0.3)' : isSF ? c(0.025) : 'rgba(0,0,0,0.25)',
                                }}>
                                    <span style={isOF ? {
                                        fontSize: '0.5rem', fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(60,35,10,0.25)', fontFamily: 'Georgia, serif',
                                    } : isSF ? {
                                        fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: c(0.18), fontFamily: '"Courier New", monospace',
                                    } : {
                                        fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)',
                                    }}>
                                        ASOT // {s.title}
                                    </span>
                                    <span style={isOF ? {
                                        fontSize: '0.5rem', fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(60,35,10,0.25)', fontFamily: 'Georgia, serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                                    } : isSF ? {
                                        fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: c(0.18), fontFamily: '"Courier New", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                                    } : {
                                        fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                                    }}>
                                        {operation.title}
                                    </span>
                                </div>

                            </div>
                        ))
                ) : (
                    // Legacy single-body fallback
                    <div style={isOF ? {
                        position: 'relative',
                        border: '2px solid rgba(90,55,20,0.4)',
                        borderTop: `3px solid ${c(1)}`,
                        background: 'rgba(240,225,195,0.6)',
                    } : isSF ? {
                        position: 'relative',
                        border: `1px solid ${c(0.3)}`,
                        borderTop: `2px solid ${c(0.8)}`,
                        boxShadow: `0 0 16px ${c(0.08)}, inset 0 0 20px ${c(0.02)}`,
                    } : {
                        position: 'relative',
                        border: `1px solid ${c(0.18)}`,
                        borderTop: `2px solid ${c(0.6)}`,
                    }}>
                        {/* Corner ticks — hidden in oldfashioned */}
                        {!isOF && (
                            <>
                                <div style={{ position: 'absolute', bottom: 0, left: 0, pointerEvents: 'none', zIndex: 1 }}>
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: 12, height: 1, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 12, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                </div>
                                <div style={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none', zIndex: 1 }}>
                                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 12, height: 1, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: 12, background: c(0.45), ...(isSF ? { boxShadow: `0 0 4px rgba(${r},${g},${b},0.6)` } : {}) }} />
                                </div>
                            </>
                        )}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
                            padding: '8px 20px',
                            borderBottom: isOF ? '1px solid rgba(90,55,20,0.2)' : isSF ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.06)',
                            background: isOF ? 'rgba(205,182,140,0.5)' : isSF ? c(0.06) : 'rgba(0,0,0,0.4)',
                            ...(isSF ? { boxShadow: `inset 0 0 20px rgba(${r},${g},${b},0.05)` } : {}),
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <div style={isOF ? {
                                    width: 8, height: 8, background: c(1), flexShrink: 0, borderRadius: 0,
                                } : isSF ? {
                                    width: 6, height: 6, background: c(0.8), flexShrink: 0, boxShadow: `0 0 6px rgba(${r},${g},${b},0.8)`,
                                } : {
                                    width: 6, height: 6, background: c(0.7), flexShrink: 0,
                                }} />
                                <span style={isOF ? {
                                    fontSize: '0.78rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#3d2b1a', fontFamily: 'Georgia, serif',
                                } : isSF ? {
                                    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.9), textShadow: `0 0 6px rgba(${r},${g},${b},0.5)`, fontFamily: '"Courier New", monospace',
                                } : {
                                    fontSize: '0.6rem', fontWeight: 800, letterSpacing: '0.3em', textTransform: 'uppercase', color: c(0.8),
                                }}>
                                    Operation Orders
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                                {operation.status && (
                                    <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: isOF ? 'rgba(60,35,10,0.4)' : 'rgba(237,237,237,0.3)' }}>
                                        {operation.status}
                                    </span>
                                )}
                                {operation.department && (
                                    <>
                                        <div style={{ width: 1, height: 10, background: isOF ? 'rgba(90,55,20,0.2)' : 'rgba(255,255,255,0.1)' }} />
                                        <span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: isOF ? 'rgba(60,35,10,0.4)' : 'rgba(237,237,237,0.3)' }}>
                                            {operation.department}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                        <div style={{ padding: '0 28px' }}>
                            <DocBody content={operation.content ?? null} themeColor={operation.themeColor || '#db001d'} pageTheme={pageTheme} />
                        </div>
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '7px 20px',
                            borderTop: isOF ? '1px solid rgba(90,55,20,0.15)' : isSF ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(255,255,255,0.04)',
                            background: isOF ? 'rgba(205,182,140,0.3)' : isSF ? c(0.025) : 'rgba(0,0,0,0.25)',
                        }}>
                            <span style={isOF ? {
                                fontSize: '0.5rem', fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(60,35,10,0.25)', fontFamily: 'Georgia, serif',
                            } : isSF ? {
                                fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: c(0.18), fontFamily: '"Courier New", monospace',
                            } : {
                                fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)',
                            }}>
                                ASOT // End of Order
                            </span>
                            <span style={isOF ? {
                                fontSize: '0.5rem', fontWeight: 400, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(60,35,10,0.25)', fontFamily: 'Georgia, serif', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                            } : isSF ? {
                                fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: c(0.18), fontFamily: '"Courier New", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                            } : {
                                fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                            }}>
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
