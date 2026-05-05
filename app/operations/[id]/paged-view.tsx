'use client'

import React, { useEffect, useState } from 'react'
import DocBody from './doc-body'
import SectionNav from './section-nav'
import ZeusNotesPanel from './ZeusNotesPanel'
import OcapStatsPanel from './OcapStatsPanel'
import OcapLinkPanel from './OcapLinkPanel'

const ZEUS_TAB = '__zeus__'
const OCAP_TAB = '__ocap__'

interface Props {
    pages: OperationPage[]
    sectionsByPage: Record<string, OperationSection[]>
    operationTitle: string
    themeColor: string
    pageTheme: 'modern' | 'oldfashioned' | 'scifi'
    isLoggedIn: boolean
    isJ6?: boolean
    isHQ?: boolean
    operationId?: string
    zeusNotes?: string
    ocap?: OcapData | null
    initialOcap?: OcapData | null
    r?: number
    g?: number
    b?: number
}

function hexToRgb(hex: string) {
    const h = hex.replace('#', '')
    return {
        r: parseInt(h.substring(0, 2), 16),
        g: parseInt(h.substring(2, 4), 16),
        b: parseInt(h.substring(4, 6), 16),
    }
}

export default function PagedView({ pages, sectionsByPage, operationTitle, themeColor, pageTheme, isLoggedIn, isJ6, isHQ, operationId, zeusNotes, ocap, initialOcap, r: rProp, g: gProp, b: bProp }: Props) {
    const [activePageId, setActivePageId] = useState<string>(pages[0]?.id ?? 'main')
    const [isMobile, setIsMobile] = useState(false)

    useEffect(() => {
        const check = () => setIsMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])

    const { r: rHex, g: gHex, b: bHex } = hexToRgb(themeColor)
    const r = rProp ?? rHex
    const g = gProp ?? gHex
    const b = bProp ?? bHex
    const c = (a: number) => `rgba(${r},${g},${b},${a})`

    const isOF = pageTheme === 'oldfashioned'
    const isSF = pageTheme === 'scifi'

    const activeSections = (sectionsByPage[activePageId] ?? []).filter(s => isLoggedIn || s.isPublic)

    // ── Mobile: horizontal tab strip ─────────────────────────────────────────
    if (isMobile) {
        return (
            <div style={{ width: '100%' }}>

                {/* Horizontal scrollable tab strip */}
                <div style={{
                    display: 'flex',
                    overflowX: 'auto',
                    gap: 4,
                    padding: '0 16px 12px',
                    borderBottom: isOF ? '1px solid rgba(160,120,50,0.2)' : isSF ? `1px solid ${c(0.2)}` : '1px solid rgba(255,255,255,0.07)',
                    // hide scrollbar visually but keep it functional
                    msOverflowStyle: 'none',
                    scrollbarWidth: 'none',
                }}>
                    <style>{`.paged-tabs::-webkit-scrollbar { display: none; }`}</style>
                    {pages.map(page => {
                        const isActive = page.id === activePageId
                        return (
                            <button
                                key={page.id}
                                type='button'
                                onClick={() => setActivePageId(page.id)}
                                style={{
                                    flexShrink: 0,
                                    padding: '7px 14px',
                                    background: isActive
                                        ? isOF ? 'rgba(160,120,50,0.1)' : c(0.12)
                                        : 'transparent',
                                    border: isActive
                                        ? isOF ? '1px solid rgba(160,120,50,0.35)' : isSF ? `1px solid ${c(0.35)}` : `1px solid ${c(0.25)}`
                                        : isOF ? '1px solid rgba(160,120,50,0.12)' : `1px solid rgba(255,255,255,0.06)`,
                                    borderBottom: isActive
                                        ? isOF ? `2px solid rgba(160,120,50,0.8)` : `2px solid ${c(0.85)}`
                                        : isOF ? '2px solid transparent' : '2px solid transparent',
                                    cursor: 'pointer',
                                    transition: 'all 0.12s',
                                    borderRadius: 3,
                                    ...(isSF && isActive ? { boxShadow: `0 0 8px ${c(0.15)}` } : {}),
                                }}
                            >
                                <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: isActive ? 700 : 500,
                                    letterSpacing: '0.06em',
                                    textTransform: 'uppercase',
                                    whiteSpace: 'nowrap',
                                    color: isActive
                                        ? isOF ? '#c8a850' : isSF ? c(0.95) : 'rgba(237,237,237,0.9)'
                                        : isOF ? 'rgba(160,120,50,0.45)' : isSF ? c(0.4) : 'rgba(237,237,237,0.4)',
                                    fontFamily: isOF || isSF ? '"Courier New", monospace' : undefined,
                                    ...(isSF && isActive ? { textShadow: `0 0 6px ${c(0.6)}` } : {}),
                                }}>
                                    {page.title}
                                </span>
                            </button>
                        )
                    })}
                    {isJ6 && (
                        <button
                            type='button'
                            onClick={() => setActivePageId(ZEUS_TAB)}
                            style={{
                                flexShrink: 0,
                                padding: '7px 14px',
                                background: activePageId === ZEUS_TAB ? 'rgba(0,195,255,0.1)' : 'transparent',
                                border: activePageId === ZEUS_TAB
                                    ? '1px solid rgba(0,195,255,0.35)'
                                    : '1px solid rgba(255,255,255,0.06)',
                                borderBottom: activePageId === ZEUS_TAB ? '2px solid rgba(0,195,255,0.7)' : '2px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.12s',
                                borderRadius: 3,
                            }}
                        >
                            <span style={{
                                fontSize: '0.65rem',
                                fontWeight: activePageId === ZEUS_TAB ? 700 : 500,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                whiteSpace: 'nowrap',
                                color: activePageId === ZEUS_TAB ? 'rgba(0,195,255,0.9)' : 'rgba(237,237,237,0.4)',
                            }}>
                                Zeus Notes
                            </span>
                        </button>
                    )}
                    {(isHQ || ocap) && (
                        <button
                            type='button'
                            onClick={() => setActivePageId(OCAP_TAB)}
                            style={{
                                flexShrink: 0,
                                padding: '7px 14px',
                                background: activePageId === OCAP_TAB ? 'rgba(0,195,120,0.1)' : 'transparent',
                                border: activePageId === OCAP_TAB
                                    ? '1px solid rgba(0,195,120,0.35)'
                                    : '1px solid rgba(255,255,255,0.06)',
                                borderBottom: activePageId === OCAP_TAB ? '2px solid rgba(0,195,120,0.7)' : '2px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.12s',
                                borderRadius: 3,
                            }}
                        >
                            <span style={{
                                fontSize: '0.65rem',
                                fontWeight: activePageId === OCAP_TAB ? 700 : 500,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                whiteSpace: 'nowrap',
                                color: activePageId === OCAP_TAB ? 'rgba(0,195,120,0.9)' : 'rgba(237,237,237,0.4)',
                            }}>
                                OCAP
                            </span>
                        </button>
                    )}
                </div>

                {activePageId === OCAP_TAB && (isHQ || ocap) ? (
                    <div className='w-full px-4 pb-16' style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {isHQ && operationId && (
                            <OcapLinkPanel operationId={operationId} initialOcap={initialOcap ?? undefined} />
                        )}
                        {ocap && (
                            <OcapStatsPanel ocap={ocap} themeColor={themeColor} r={r} g={g} b={b} pageTheme={pageTheme} operationId={operationId} />
                        )}
                    </div>
                ) : (
                    <>
                        {activeSections.length > 1 && (
                            <SectionNav
                                className='print-hide'
                                themeColor={themeColor}
                                pageTheme={pageTheme}
                                sections={activeSections.map(s => ({ id: s.id, title: s.title }))}
                            />
                        )}
                        <div className='w-full max-w-[900px] mx-auto px-4 pb-16' style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {activeSections.map(s => (
                                <SectionCard
                                    key={s.id}
                                    s={s}
                                    isOF={isOF}
                                    isSF={isSF}
                                    c={c}
                                    r={r} g={g} b={b}
                                    isLoggedIn={isLoggedIn}
                                    themeColor={themeColor}
                                    pageTheme={pageTheme}
                                    operationTitle={operationTitle}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        )
    }

    // ── Desktop: left sidebar + content ──────────────────────────────────────
    return (
        <div style={{ display: 'flex', alignItems: 'flex-start', width: '100%' }}>

            {/* Left page tabs */}
            <div style={{
                width: 180,
                flexShrink: 0,
                position: 'sticky',
                top: 80,
                alignSelf: 'flex-start',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                padding: '24px 12px 24px 16px',
                borderRight: isOF ? '1px solid rgba(160,120,50,0.2)' : isSF ? `1px solid ${c(0.2)}` : '1px solid rgba(255,255,255,0.07)',
                maxHeight: 'calc(100vh - 100px)',
                overflowY: 'auto',
            }}>
                <div style={{
                    fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
                    color: isOF ? 'rgba(160,120,50,0.35)' : isSF ? c(0.3) : 'rgba(237,237,237,0.2)',
                    marginBottom: 8, paddingLeft: 8,
                    fontFamily: isOF || isSF ? '"Courier New", monospace' : undefined,
                }}>
                    Documents
                </div>

                {pages.map(page => {
                    const isActive = page.id === activePageId
                    return (
                        <button
                            key={page.id}
                            type='button'
                            onClick={() => setActivePageId(page.id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 10px',
                                textAlign: 'left',
                                background: isActive
                                    ? isOF ? 'rgba(160,120,50,0.1)' : c(0.1)
                                    : 'transparent',
                                borderTop: isActive
                                    ? isOF ? '1px solid rgba(160,120,50,0.35)' : isSF ? `1px solid ${c(0.35)}` : `1px solid ${c(0.25)}`
                                    : '1px solid transparent',
                                borderRight: isActive
                                    ? isOF ? '1px solid rgba(160,120,50,0.35)' : isSF ? `1px solid ${c(0.35)}` : `1px solid ${c(0.25)}`
                                    : '1px solid transparent',
                                borderBottom: isActive
                                    ? isOF ? '1px solid rgba(160,120,50,0.35)' : isSF ? `1px solid ${c(0.35)}` : `1px solid ${c(0.25)}`
                                    : '1px solid transparent',
                                borderLeft: isActive
                                    ? isOF ? `3px solid rgba(160,120,50,0.8)` : `3px solid ${c(0.85)}`
                                    : '3px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.12s',
                                width: '100%',
                                ...(isSF && isActive ? { boxShadow: `0 0 8px ${c(0.15)}, inset 0 0 8px ${c(0.04)}` } : {}),
                            }}
                            onMouseEnter={e => {
                                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = isOF ? 'rgba(160,120,50,0.05)' : 'rgba(255,255,255,0.04)'
                            }}
                            onMouseLeave={e => {
                                if (!isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                            }}
                        >
                            <span style={{
                                fontSize: '0.65rem',
                                fontWeight: isActive ? 700 : 500,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                color: isActive
                                    ? isOF ? '#c8a850' : isSF ? c(0.95) : 'rgba(237,237,237,0.9)'
                                    : isOF ? 'rgba(160,120,50,0.45)' : isSF ? c(0.4) : 'rgba(237,237,237,0.4)',
                                fontFamily: isOF || isSF ? '"Courier New", monospace' : undefined,
                                ...(isSF && isActive ? { textShadow: `0 0 6px ${c(0.6)}` } : {}),
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {page.title}
                            </span>
                        </button>
                    )
                })}

                {/* Zeus Notes tab — J6 only */}
                {isJ6 && (
                    <>
                        <div style={{ height: 1, background: 'rgba(0,195,255,0.12)', margin: '6px 0' }} />
                        <button
                            type='button'
                            onClick={() => setActivePageId(ZEUS_TAB)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 10px',
                                textAlign: 'left',
                                background: activePageId === ZEUS_TAB ? 'rgba(0,195,255,0.08)' : 'transparent',
                                borderTop: activePageId === ZEUS_TAB ? '1px solid rgba(0,195,255,0.25)' : '1px solid transparent',
                                borderRight: activePageId === ZEUS_TAB ? '1px solid rgba(0,195,255,0.25)' : '1px solid transparent',
                                borderBottom: activePageId === ZEUS_TAB ? '1px solid rgba(0,195,255,0.25)' : '1px solid transparent',
                                borderLeft: activePageId === ZEUS_TAB ? '3px solid rgba(0,195,255,0.7)' : '3px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.12s',
                                width: '100%',
                            }}
                            onMouseEnter={e => {
                                if (activePageId !== ZEUS_TAB) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,195,255,0.04)'
                            }}
                            onMouseLeave={e => {
                                if (activePageId !== ZEUS_TAB) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                            }}
                        >
                            <span style={{
                                fontSize: '0.65rem',
                                fontWeight: activePageId === ZEUS_TAB ? 700 : 500,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                color: activePageId === ZEUS_TAB ? 'rgba(0,195,255,0.9)' : 'rgba(0,195,255,0.4)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                Zeus Notes
                            </span>
                        </button>
                    </>
                )}

                {/* OCAP tab — shown to HQ always, others when stats are synced */}
                {(isHQ || ocap) && (
                    <>
                        <div style={{ height: 1, background: 'rgba(0,195,120,0.12)', margin: '6px 0' }} />
                        <button
                            type='button'
                            onClick={() => setActivePageId(OCAP_TAB)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 10px',
                                textAlign: 'left',
                                background: activePageId === OCAP_TAB ? 'rgba(0,195,120,0.08)' : 'transparent',
                                borderTop: activePageId === OCAP_TAB ? '1px solid rgba(0,195,120,0.25)' : '1px solid transparent',
                                borderRight: activePageId === OCAP_TAB ? '1px solid rgba(0,195,120,0.25)' : '1px solid transparent',
                                borderBottom: activePageId === OCAP_TAB ? '1px solid rgba(0,195,120,0.25)' : '1px solid transparent',
                                borderLeft: activePageId === OCAP_TAB ? '3px solid rgba(0,195,120,0.7)' : '3px solid transparent',
                                cursor: 'pointer',
                                transition: 'all 0.12s',
                                width: '100%',
                            }}
                            onMouseEnter={e => {
                                if (activePageId !== OCAP_TAB) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,195,120,0.04)'
                            }}
                            onMouseLeave={e => {
                                if (activePageId !== OCAP_TAB) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                            }}
                        >
                            <span style={{
                                fontSize: '0.65rem',
                                fontWeight: activePageId === OCAP_TAB ? 700 : 500,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                color: activePageId === OCAP_TAB ? 'rgba(0,195,120,0.9)' : 'rgba(0,195,120,0.4)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                OCAP
                            </span>
                        </button>
                    </>
                )}
            </div>

            {/* Right content area */}
            <div style={{ flex: 1, minWidth: 0 }}>

                {activePageId === ZEUS_TAB ? (
                    <div className='w-full px-4 md:px-8 pb-16' style={{ marginTop: 32 }}>
                        <ZeusNotesPanel operationId={operationId ?? ''} initialNotes={zeusNotes ?? ''} />
                    </div>
                ) : activePageId === OCAP_TAB && (isHQ || ocap) ? (
                    <div className='w-full px-4 md:px-8 pb-16' style={{ marginTop: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {isHQ && operationId && (
                            <OcapLinkPanel operationId={operationId} initialOcap={initialOcap ?? undefined} />
                        )}
                        {ocap && (
                            <OcapStatsPanel ocap={ocap} themeColor={themeColor} r={r} g={g} b={b} pageTheme={pageTheme} operationId={operationId} />
                        )}
                    </div>
                ) : (
                    <>
                        {activeSections.length > 1 && (
                            <SectionNav
                                className='print-hide'
                                themeColor={themeColor}
                                pageTheme={pageTheme}
                                sections={activeSections.map(s => ({ id: s.id, title: s.title }))}
                            />
                        )}

                        <div className='w-full px-4 md:px-8 pb-16' style={{ marginTop: activeSections.length > 1 ? 32 : 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
                            {activeSections.map(s => (
                                <SectionCard
                                    key={s.id}
                                    s={s}
                                    isOF={isOF}
                                    isSF={isSF}
                                    c={c}
                                    r={r} g={g} b={b}
                                    isLoggedIn={isLoggedIn}
                                    themeColor={themeColor}
                                    pageTheme={pageTheme}
                                    operationTitle={operationTitle}
                                />
                            ))}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

// ── Shared section card (avoids duplicating JSX between layouts) ─────────────
function SectionCard({ s, isOF, isSF, c, r, g, b, isLoggedIn, themeColor, pageTheme, operationTitle }: {
    s: OperationSection
    isOF: boolean
    isSF: boolean
    c: (a: number) => string
    r: number; g: number; b: number
    isLoggedIn: boolean
    themeColor: string
    pageTheme: string
    operationTitle: string
}) {
    return (
        <div id={`section-${s.id}`} data-print-section style={isOF ? {
            position: 'relative',
            border: '1px solid rgba(160,120,50,0.25)',
            borderTop: `2px solid ${c(0.8)}`,
            background: '#1d1408',
        } : isSF ? {
            position: 'relative',
            border: `1px solid ${c(0.3)}`,
            borderTop: `2px solid ${c(0.8)}`,
            background: 'rgba(0,4,14,0.82)',
            boxShadow: `0 0 20px ${c(0.1)}, inset 0 0 30px ${c(0.03)}`,
        } : {
            position: 'relative',
            border: `1px solid ${c(0.18)}`,
            borderTop: `2px solid ${c(0.6)}`,
        }}>

            {/* Sci-fi scan lines */}
            {isSF && (
                <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', backgroundImage: `repeating-linear-gradient(to bottom, ${c(0.02)} 0px, ${c(0.02)} 1px, transparent 1px, transparent 4px)` }} />
            )}

            {/* Corner ticks */}
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
                borderBottom: isOF ? '1px solid rgba(160,120,50,0.15)' : isSF ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(255,255,255,0.06)',
                background: isOF ? 'rgba(0,0,0,0.55)' : isSF ? c(0.06) : 'rgba(0,0,0,0.4)',
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
                        fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#c8a850', fontFamily: '"Courier New", monospace',
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
                        fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(200,160,50,0.75)', border: '1px solid rgba(160,120,50,0.35)', padding: '1px 8px', fontFamily: '"Courier New", monospace',
                    } : {
                        fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,180,0,0.6)', border: '1px solid rgba(219,180,0,0.25)', padding: '1px 6px',
                    }}>
                        Classified
                    </span>
                )}
            </div>

            {/* Body */}
            <div style={{ padding: '0 28px' }}>
                <DocBody content={s.content ?? null} themeColor={themeColor} pageTheme={pageTheme as 'modern' | 'oldfashioned' | 'scifi'} />
            </div>

            {/* Footer stamp */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '7px 20px',
                borderTop: isOF ? '1px solid rgba(160,120,50,0.12)' : isSF ? '1px solid rgba(255,255,255,0.03)' : '1px solid rgba(255,255,255,0.04)',
                background: isOF ? 'rgba(0,0,0,0.4)' : isSF ? c(0.025) : 'rgba(0,0,0,0.25)',
            }}>
                <span style={isOF ? {
                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(160,120,50,0.2)', fontFamily: '"Courier New", monospace',
                } : isSF ? {
                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: c(0.18), fontFamily: '"Courier New", monospace',
                } : {
                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)',
                }}>
                    ASOT // {s.title}
                </span>
                <span style={isOF ? {
                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(160,120,50,0.2)', fontFamily: '"Courier New", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                } : isSF ? {
                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: c(0.18), fontFamily: '"Courier New", monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                } : {
                    fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '50%',
                }}>
                    {operationTitle}
                </span>
            </div>

        </div>
    )
}
