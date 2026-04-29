'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import styles from './memorial.module.css'

interface WallMember {
    _id: string
    callsign: string
    dischargeYear: number | null
    joinYear: number | null
    dischargeType: 'GD' | 'HD'
    discordId: string | null
}

// ── Layout constants ──────────────────────────────────────────────────────────
const PW            = 80    // plaque width  (px)
const PH            = 46    // plaque height (px)
const GAP           = 10    // gap between plaques (px)
const STEP          = PW + GAP

const CENTRE_COLS   = 4     // centre plaque spans this many columns
const GD_TOP_ROWS   = 4     // rows occupied by (and flanked by) the centre plaque
const GD_BOT_ROWS   = 2     // rows below the centre plaque (rows 5-6)
const GD_ROWS       = GD_TOP_ROWS + GD_BOT_ROWS  // 6 total grid rows

const CONTENT_PAD_X = 80    // px padding left/right of the GD grid
const HD_SECTION_H  = 180   // px reserved for title + HD row
const SECTION_GAP   = 72    // px gap (enlarged to fit carved separator line)
const GD_TOP        = HD_SECTION_H + SECTION_GAP  // px: GD grid top offset

const EDGE_ZONE     = 150   // px from screen edge that activates scroll
const MAX_SPEED     = 7     // px/frame at max proximity (60 fps ≈ 420 px/s)

// ── Year string helper ────────────────────────────────────────────────────────
function yr(m: WallMember): string {
    if (m.joinYear && m.dischargeYear) return `${m.joinYear} – ${m.dischargeYear}`
    if (m.dischargeYear)               return `– ${m.dischargeYear}`
    if (m.joinYear)                    return `${m.joinYear} –`
    return ''
}

// ── Auto-fit font size so long names don't overflow the plaque border ────────
// Usable text width inside the plaque image (px), accounting for border/rivets
const PLAQUE_TEXT_W   = 56
const BASE_NAME_PX    = 8      // standard name font-size
const MIN_NAME_PX     = 5.2    // minimum — below this is unreadable even zoomed
// Empirical width factor for uppercase Cinzel + 0.10em letter-spacing
const CHAR_W_FACTOR   = 0.80   // px per character = fontSize × this

function fitNameSize(name: string): number {
    const estimated = name.length * BASE_NAME_PX * CHAR_W_FACTOR
    if (estimated <= PLAQUE_TEXT_W) return BASE_NAME_PX
    return Math.max(MIN_NAME_PX, BASE_NAME_PX * (PLAQUE_TEXT_W / estimated))
}

// ── Callsign split ────────────────────────────────────────────────────────────
// Rules:
//   • Single-letter bracket annotations like (R) or (D) → strip entirely
//   • Multi-letter bracket content like (Jammer), (Fear Da Cub) → keep as line 2
//   • Slash → second part becomes line 2 (wrapped in brackets if not already)
//
// "Elvera(R)"          → ["Elvera",  null]
// "Jhibby (R)"         → ["Jhibby",  null]
// "Arsenic(R)"         → ["Arsenic", null]
// "Journey/Jammer"     → ["Journey", "(Jammer)"]
// "Fear (Fear Da Cub)" → ["Fear",    "(Fear Da Cub)"]
// "KANGA (RVRSEKANGA)" → ["KANGA",   "(RVRSEKANGA)"]
function splitCallsign(callsign: string): [string, string | null] {
    // ── Slash split ──────────────────────────────────────────────────────────
    const slashIdx = callsign.indexOf('/')
    if (slashIdx !== -1) {
        const first = callsign.slice(0, slashIdx).trim()
        const rest  = callsign.slice(slashIdx + 1).trim()
        const wrapped = rest.startsWith('(') ? rest : `(${rest})`
        const inner   = wrapped.slice(1, -1).trim()  // content without brackets
        // Single-letter suffix → discard (e.g. "/R" meaning "rejoined")
        if (inner.length <= 1) return [first, null]
        return [first, wrapped]
    }

    // ── Bracket split ────────────────────────────────────────────────────────
    const bracketIdx = callsign.indexOf('(')
    if (bracketIdx > 0) {
        const before  = callsign.slice(0, bracketIdx).trim()
        const bracket = callsign.slice(bracketIdx).trim()        // e.g. "(R)" or "(Jammer)"
        const inner   = bracket.replace(/^\(|\)$/g, '').trim()  // content without brackets
        // Single-letter annotation like (R) or (D) → strip, show name only
        if (inner.length <= 1) return [before, null]
        return [before, bracket]
    }

    return [callsign, null]
}

// ── GD grid layout ────────────────────────────────────────────────────────────
interface Layout {
    totalCols:      number
    centreStartCol: number  // 1-indexed
    placements:     { member: WallMember; col: number; row: number }[]
    gridW:          number
    gridH:          number
    centrePlaqueW:  number
    centrePlaqueH:  number
    // px from grid left edge to the horizontal centre of the centre plaque
    centreRelX:     number
}

function computeLayout(gd: WallMember[]): Layout | null {
    if (gd.length === 0) return null

    // Side columns fill GD_ROWS (6) rows; centre columns only GD_BOT_ROWS (2, rows 5-6)
    // Solve for L (left/right cols): 2L·GD_ROWS + CENTRE_COLS·GD_BOT_ROWS ≥ N
    const slotsPerSideCol   = GD_ROWS                         // 6
    const slotsPerCentreCol = GD_BOT_ROWS                     // 2
    const L    = Math.max(2, Math.ceil(
        (gd.length - CENTRE_COLS * slotsPerCentreCol) / (2 * slotsPerSideCol)
    ))
    const totalCols      = L + CENTRE_COLS + L
    const centreStartCol = L + 1   // 1-indexed

    // Assign members column-major (top→bottom, then next column)
    const placements: Layout['placements'] = []
    let idx = 0
    for (let col = 1; col <= totalCols && idx < gd.length; col++) {
        const isCentre = col >= centreStartCol && col < centreStartCol + CENTRE_COLS
        // Centre columns: only rows 5-6 available (rows 1-4 occupied by centre plaque)
        // Side columns: rows 1-6
        const rows = isCentre
            ? Array.from({ length: GD_BOT_ROWS }, (_, i) => GD_TOP_ROWS + 1 + i)  // [5, 6]
            : Array.from({ length: GD_ROWS },     (_, i) => i + 1)                 // [1..6]
        for (const row of rows) {
            if (idx >= gd.length) break
            placements.push({ member: gd[idx++], col, row })
        }
    }

    const gridW         = totalCols * PW + (totalCols - 1) * GAP
    const gridH         = GD_ROWS   * PH + (GD_ROWS - 1)   * GAP
    const centrePlaqueW = CENTRE_COLS * PW + (CENTRE_COLS - 1) * GAP
    const centrePlaqueH = GD_TOP_ROWS * PH + (GD_TOP_ROWS - 1) * GAP
    const centreRelX    = (centreStartCol - 1) * STEP + centrePlaqueW / 2

    return { totalCols, centreStartCol, placements, gridW, gridH, centrePlaqueW, centrePlaqueH, centreRelX }
}

// ── Page component ────────────────────────────────────────────────────────────
export default function RetiredMembersPage() {
    const [members,  setMembers]  = useState<WallMember[]>([])
    const [loading,  setLoading]  = useState(true)
    const [selected, setSelected] = useState<WallMember | null>(null)

    const [zoom,    setZoom]    = useState(1)
    const [origin,  setOrigin]  = useState({ x: 0, y: 300 })
    const [scrollX, setScrollX] = useState(0)
    const [edgeDir, setEdgeDir] = useState<'left' | 'right' | null>(null)

    const wallRef  = useRef<HTMLDivElement>(null)
    const scrollR  = useRef(0)   // scrollX ref (avoids stale closures in RAF)
    const maxScrollR = useRef(0)
    const zoomR    = useRef(1)
    const initDone = useRef(false)

    // Keep refs in sync
    useEffect(() => { scrollR.current = scrollX }, [scrollX])
    useEffect(() => { zoomR.current   = zoom    }, [zoom])

    // Fetch members
    useEffect(() => {
        fetch('/api/community/retired')
            .then(r => r.json())
            .then(d => setMembers(d.members ?? []))
            .finally(() => setLoading(false))
    }, [])

    // Prevent page from scrolling vertically while on this page
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [])

    const hdMembers = useMemo(() => members.filter(m => m.dischargeType === 'HD'), [members])
    const gdMembers = useMemo(() => members.filter(m => m.dischargeType === 'GD'), [members])
    const layout    = useMemo(() => computeLayout(gdMembers), [gdMembers])

    // Total scrollable content width, and the pixel X of the visual centre
    const contentW = layout ? layout.gridW + CONTENT_PAD_X * 2 : 2000
    const centreX  = layout ? CONTENT_PAD_X + layout.centreRelX : contentW / 2

    // Scroll the view so the centre plaque is centred on first load
    useEffect(() => {
        if (!layout || !wallRef.current || initDone.current) return
        const viewW = wallRef.current.clientWidth
        maxScrollR.current = Math.max(0, contentW - viewW)
        const initX = Math.max(0, Math.min(maxScrollR.current, centreX - viewW / 2))
        scrollR.current = initX
        setScrollX(initX)
        initDone.current = true
    }, [layout, contentW, centreX])

    // ── Scroll-wheel zoom ─────────────────────────────────────────────────────
    // Attached to the entire wall div. Prevents browser page scroll.
    useEffect(() => {
        const el = wallRef.current
        if (!el) return
        const handler = (e: WheelEvent) => {
            e.preventDefault()
            const r = el.getBoundingClientRect()
            // Store cursor in viewport-relative coords (used for transformOrigin)
            setOrigin({ x: e.clientX - r.left, y: e.clientY - r.top })
            setZoom(p => Math.min(4, Math.max(1, p + (e.deltaY < 0 ? 0.15 : -0.15))))
        }
        el.addEventListener('wheel', handler, { passive: false })
        return () => el.removeEventListener('wheel', handler)
    }, [])

    // ── Edge-scroll RAF loop ──────────────────────────────────────────────────
    useEffect(() => {
        let speed = 0
        let rafId: number

        const onMove = (e: MouseEvent) => {
            const W    = window.innerWidth
            const base = MAX_SPEED / Math.max(1, zoomR.current)
            if (e.clientX < EDGE_ZONE) {
                speed = -base * Math.pow(1 - e.clientX / EDGE_ZONE, 1.5)
                setEdgeDir('left')
            } else if (e.clientX > W - EDGE_ZONE) {
                speed = base * Math.pow(1 - (W - e.clientX) / EDGE_ZONE, 1.5)
                setEdgeDir('right')
            } else {
                speed = 0
                setEdgeDir(null)
            }
        }

        const tick = () => {
            if (speed !== 0) {
                const next = Math.max(0, Math.min(maxScrollR.current, scrollR.current + speed))
                if (Math.abs(next - scrollR.current) > 0.1) {
                    scrollR.current = next
                    setScrollX(next)
                }
            }
            rafId = requestAnimationFrame(tick)
        }

        window.addEventListener('mousemove', onMove, { passive: true })
        rafId = requestAnimationFrame(tick)
        return () => {
            window.removeEventListener('mousemove', onMove)
            cancelAnimationFrame(rafId)
        }
    }, [])   // runs once — uses refs, no stale-closure risk

    const isLoaded = !loading && members.length > 0

    // The zoom transform-origin is the cursor's position in content coordinates:
    //   content_x = viewport_cursor_x + scrollX
    //   content_y = viewport_cursor_y  (no vertical scroll)
    const originX = origin.x + scrollX
    const originY = origin.y

    return (
        /* ── Viewport ── */
        <div
            ref={wallRef}
            style={{
                width: '100vw',
                height: '100vh',
                overflow: 'hidden',
                position: 'relative',
                backgroundColor: '#e0dbd0',  // fallback while wall image loads
            }}
        >
            {/* ── Scroll wrapper: moves content left/right ── */}
            <div style={{
                position: 'absolute',
                top: 0, left: 0,
                width: contentW,
                height: '100%',
                transform: `translateX(-${scrollX}px)`,
            }}>
                {/* ── Zoom + content: scales around cursor ── */}
                <div style={{
                    width: contentW,
                    height: '100%',
                    position: 'relative',
                    transform: `scale(${zoom})`,
                    transformOrigin: `${originX}px ${originY}px`,
                    transition: 'transform 0.2s ease-out',
                    willChange: 'transform',
                    // Wall image tiles horizontally, scrolls with content
                    backgroundImage:  `url('/memorial/wall.png')`,
                    backgroundRepeat: 'repeat-x',
                    backgroundSize:   'auto 100%',
                    backgroundColor:  '#e6e1d6',
                }}>

                    {/* ── Loading ── */}
                    {loading && (
                        <div style={{
                            position: 'absolute', top: '45%', left: centreX,
                            transform: 'translate(-50%, -50%)',
                            fontFamily: "'Cinzel', Georgia, serif",
                            fontSize: 13, letterSpacing: '0.2em',
                            textTransform: 'uppercase', color: '#2b2621', opacity: 0.45,
                            whiteSpace: 'nowrap',
                        }}>
                            Loading service records…
                        </div>
                    )}

                    {isLoaded && (
                        <>
                            {/* ═══ HD SECTION ══════════════════════════════════════
                                Centred horizontally at centreX (same as GD centre plaque)
                            ═══════════════════════════════════════════════════════ */}
                            <div style={{
                                position: 'absolute',
                                top: 36,
                                left: centreX,
                                transform: 'translateX(-50%)',
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                            }}>
                                {/* Carved stone title */}
                                <div style={{
                                    fontFamily: "'Cinzel', 'Times New Roman', serif",
                                    textTransform: 'uppercase',
                                    color: '#2b2621',
                                    marginBottom: 20,
                                }}>
                                    <div style={{
                                        fontSize: 42,
                                        letterSpacing: '0.30em',
                                        lineHeight: 1,
                                        fontWeight: 500,
                                        /* Carved-into-marble effect: highlight on bottom, shadow above */
                                        textShadow: [
                                            '0 1px 0 rgba(255,255,255,0.72)',
                                            '0 -1px 0 rgba(0,0,0,0.14)',
                                            '1px 2px 4px rgba(0,0,0,0.22)',
                                            '-1px -1px 0 rgba(255,255,255,0.30)',
                                        ].join(', '),
                                    }}>
                                        ASOT
                                    </div>
                                    <div style={{
                                        fontSize: 22,
                                        letterSpacing: '0.24em',
                                        lineHeight: 1.4,
                                        marginTop: 8,
                                        fontWeight: 500,
                                        textShadow: [
                                            '0 1px 0 rgba(255,255,255,0.72)',
                                            '0 -1px 0 rgba(0,0,0,0.14)',
                                            '1px 2px 4px rgba(0,0,0,0.22)',
                                            '-1px -1px 0 rgba(255,255,255,0.30)',
                                        ].join(', '),
                                    }}>
                                        Honourably Discharged Members
                                    </div>
                                </div>

                                {/* HD plaques — horizontal row */}
                                {hdMembers.length > 0 && (
                                    <div style={{ display: 'inline-flex', gap: GAP, flexWrap: 'wrap', justifyContent: 'center' }}>
                                        {hdMembers.map(m => {
                                            const [n1, n2] = splitCallsign(m.callsign)
                                            return (
                                                <div
                                                    key={m._id}
                                                    className={styles.plaque}
                                                    style={{ width: PW, height: PH }}
                                                    onClick={() => setSelected(m)}
                                                    role='button'
                                                >
                                                    <span className={styles.plaqueText}>
                                                        <span className={styles.plaqueName} style={{ fontSize: fitNameSize(n1) }}>{n1}</span>
                                                        {n2 && <span className={styles.plaqueName} style={{ fontSize: fitNameSize(n2) }}>{n2}</span>}
                                                        {yr(m) && <span className={styles.plaqueYears}>{yr(m)}</span>}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* ── Carved separator line between HD and GD ── */}
                            {layout && (
                                <div style={{
                                    position: 'absolute',
                                    top: HD_SECTION_H + 26,
                                    // Span the full content width
                                    left: 0,
                                    width: contentW,
                                    height: 2,
                                    background: '#1a1006',
                                    // Highlight below the dark line = engraved-into-marble look
                                    boxShadow: '0 1px 0 rgba(255,255,255,0.42), 0 -1px 0 rgba(0,0,0,0.10)',
                                }} />
                            )}

                            {/* ═══ GD SECTION ══════════════════════════════════════
                                CSS Grid: totalCols wide, GD_ROWS (6) rows tall.
                                Side columns fill all 6 rows (rows 1-6).
                                Centre plaque: rows 1-4, CENTRE_COLS wide.
                                Centre column area: rows 5-6 (2 plaques below plaque).
                                Members fill column-major A→Z left→right.
                            ═══════════════════════════════════════════════════════ */}
                            {layout && (
                                <div style={{
                                    position: 'absolute',
                                    top: GD_TOP,
                                    left: CONTENT_PAD_X,
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(${layout.totalCols}, ${PW}px)`,
                                    gridTemplateRows:    `repeat(${GD_ROWS}, ${PH}px)`,
                                    gap: GAP,
                                }}>
                                    {/* Centre plaque — rows 1–4, CENTRE_COLS wide */}
                                    <div
                                        className={styles.centrePlaque}
                                        style={{
                                            gridColumn:  `${layout.centreStartCol} / span ${CENTRE_COLS}`,
                                            gridRow:     `1 / span ${GD_TOP_ROWS}`,
                                            width:        layout.centrePlaqueW,
                                            height:       layout.centrePlaqueH,
                                            alignSelf:   'center',
                                            justifySelf: 'center',
                                        }}
                                    >
                                        <span className={styles.centrePlaqueText}>
                                            <span className={styles.centrePlaqueTitle}>ASOT</span>
                                            <span className={styles.centrePlaqueBody}>Honouring Our Members</span>
                                            <span className={styles.centrePlaqueBody}>Who Have Discharged</span>
                                        </span>
                                    </div>

                                    {/* Member plaques — placed at computed col/row, slash names split to 2 lines */}
                                    {layout.placements.map(({ member, col, row }) => {
                                        const [n1, n2] = splitCallsign(member.callsign)
                                        const dateStr  = yr(member)
                                        return (
                                            <div
                                                key={member._id}
                                                className={styles.plaque}
                                                style={{
                                                    gridColumn: col,
                                                    gridRow:    row,
                                                    width: PW,
                                                    height: PH,
                                                }}
                                                onClick={() => setSelected(member)}
                                                role='button'
                                            >
                                                <span className={styles.plaqueText}>
                                                    <span className={styles.plaqueName} style={{ fontSize: fitNameSize(n1) }}>{n1}</span>
                                                    {n2 && <span className={styles.plaqueName} style={{ fontSize: fitNameSize(n2) }}>{n2}</span>}
                                                    {dateStr && <span className={styles.plaqueYears}>{dateStr}</span>}
                                                </span>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </>
                    )}
                </div>{/* end zoom wrapper */}
            </div>{/* end scroll wrapper */}

            {/* ── Edge scroll arrow indicators (fixed to viewport) ── */}
            <div className={`${styles.edgeHint} ${styles.edgeLeft}  ${edgeDir === 'left'  ? styles.edgeHintActive : ''}`}>◀</div>
            <div className={`${styles.edgeHint} ${styles.edgeRight} ${edgeDir === 'right' ? styles.edgeHintActive : ''}`}>▶</div>

            {/* ── Hint bar (fixed, fades on zoom) ── */}
            <div
                className={styles.hintBar}
                style={{
                    position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
                    background: 'rgba(20,12,4,.70)', backdropFilter: 'blur(6px)',
                    border: '1px solid rgba(180,140,60,.22)',
                    padding: '6px 22px',
                    color: 'rgba(228,210,168,.55)',
                    pointerEvents: 'none', zIndex: 50,
                    opacity: zoom > 1.05 ? 0 : 1,
                    transition: 'opacity .3s',
                    whiteSpace: 'nowrap',
                }}
            >
                Move mouse to screen edge to scroll &nbsp;·&nbsp; Scroll wheel to zoom &nbsp;·&nbsp; Click a plaque for service record
            </div>

            {/* ── Modal ── */}
            {selected && (
                <div className={styles.modalBackdrop} onClick={() => setSelected(null)}>
                    <div className={styles.modalBox} onClick={e => e.stopPropagation()}>
                        <h2 className={styles.modalName}>{selected.callsign}</h2>
                        {yr(selected) && <div className={styles.modalYears}>{yr(selected)}</div>}
                        <div className={styles.noMilpac}>
                            MilPAC snapshot integration coming next.
                        </div>
                        <button
                            onClick={() => setSelected(null)}
                            style={{ marginTop: 18, padding: '8px 18px', cursor: 'pointer', fontFamily: "'Cinzel', serif", fontSize: '0.78rem', letterSpacing: '0.08em' }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
