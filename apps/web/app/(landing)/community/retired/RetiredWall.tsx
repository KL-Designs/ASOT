'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import styles from './memorial.module.css'
import { AWARD_TO_CITATION, QUAL_TO_BADGE } from '@/lib/milpac-gen/maps'

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
const PLAQUE_TEXT_W   = 56
const BASE_NAME_PX    = 8
const MIN_NAME_PX     = 5.2
const CHAR_W_FACTOR   = 0.80

function fitNameSize(name: string): number {
    const estimated = name.length * BASE_NAME_PX * CHAR_W_FACTOR
    if (estimated <= PLAQUE_TEXT_W) return BASE_NAME_PX
    return Math.max(MIN_NAME_PX, BASE_NAME_PX * (PLAQUE_TEXT_W / estimated))
}

// ── Callsign split ────────────────────────────────────────────────────────────
function splitCallsign(callsign: string): [string, string | null] {
    const slashIdx = callsign.indexOf('/')
    if (slashIdx !== -1) {
        const first = callsign.slice(0, slashIdx).trim()
        const rest  = callsign.slice(slashIdx + 1).trim()
        const wrapped = rest.startsWith('(') ? rest : `(${rest})`
        const inner   = wrapped.slice(1, -1).trim()
        if (inner.length <= 1) return [first, null]
        return [first, wrapped]
    }

    const bracketIdx = callsign.indexOf('(')
    if (bracketIdx > 0) {
        const before  = callsign.slice(0, bracketIdx).trim()
        const bracket = callsign.slice(bracketIdx).trim()
        const inner   = bracket.replace(/^\(|\)$/g, '').trim()
        if (inner.length <= 1) return [before, null]
        return [before, bracket]
    }

    return [callsign, null]
}

// ── GD grid layout ────────────────────────────────────────────────────────────
interface Layout {
    totalCols:      number
    centreStartCol: number
    placements:     { member: WallMember; col: number; row: number }[]
    gridW:          number
    gridH:          number
    centrePlaqueW:  number
    centrePlaqueH:  number
    centreRelX:     number
}

function computeLayout(gd: WallMember[]): Layout | null {
    if (gd.length === 0) return null

    const slotsPerSideCol   = GD_ROWS
    const slotsPerCentreCol = GD_BOT_ROWS
    const L    = Math.max(2, Math.ceil(
        (gd.length - CENTRE_COLS * slotsPerCentreCol) / (2 * slotsPerSideCol)
    ))
    const totalCols      = L + CENTRE_COLS + L
    const centreStartCol = L + 1

    const placements: Layout['placements'] = []
    let idx = 0
    for (let col = 1; col <= totalCols && idx < gd.length; col++) {
        const isCentre = col >= centreStartCol && col < centreStartCol + CENTRE_COLS
        const rows = isCentre
            ? Array.from({ length: GD_BOT_ROWS }, (_, i) => GD_TOP_ROWS + 1 + i)
            : Array.from({ length: GD_ROWS },     (_, i) => i + 1)
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

// ── Snapshot modal helpers ────────────────────────────────────────────────────
const BADGE_SUBFOLDER: Record<string, string> = {
    'BCQB': 'CQB', 'ACQB': 'CQB', 'ECQB': 'CQB',
    'BM': 'Medical', 'AdvM': 'Medical', 'ExpM': 'Medical',
    'BIDF': 'IDF', 'AIDF': 'IDF', 'BCIDF': 'IDF',
    'BR': 'Rotary', 'AdvR': 'Rotary', 'ExpR': 'Rotary',
    'BF': 'Fixed%20Wing', 'AF': 'Fixed%20Wing', 'EF': 'Fixed%20Wing',
    'NCO': 'NCO', 'Platoon': 'NCO', 'Company': 'NCO',
    'PT': 'Parradrop-HALO', 'HALO': 'Parradrop-HALO', 'JM': 'Parradrop-HALO', 'PR': 'Parradrop-HALO',
    'BAT': 'Weapons', 'BGLA': 'Weapons', 'BMG': 'Weapons', 'BPistol': 'Weapons',
    'BRifle': 'Weapons', 'BSniper': 'Weapons',
    'ExpAT': 'Weapons', 'ExpGLA': 'Weapons', 'ExpMG': 'Weapons',
    'ExpPistol': 'Weapons', 'ExpRifle': 'Weapons', 'ExpSniper': 'Weapons',
    'Driver': 'Armoured%20Crewman', 'Gunner': 'Armoured%20Crewman', 'Commander': 'Armoured%20Crewman',
    'FO': 'FO%20and%20JTAC', 'JTAC': 'FO%20and%20JTAC',
    'Commando': 'Special%20Forces', 'Ranger': 'Special%20Forces', 'SASR': 'Special%20Forces',
}

function trainingBadgeUrl(code: string): string | null {
    if (code === 'RE') return '/milpac-assets/imge/Training%20Badges/RE.png'
    const sub = BADGE_SUBFOLDER[code]
    return sub ? `/milpac-assets/imge/Training%20Badges/${sub}/${code}.png` : null
}

// Thin parchment-styled section header
function SnapSection({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div style={{ marginTop: 18 }}>
            <div style={{
                fontFamily: "'Cinzel', serif", fontSize: '0.58rem', fontWeight: 700,
                letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(26,20,12,0.45)',
                borderBottom: '1px solid rgba(26,20,12,0.15)', paddingBottom: 5, marginBottom: 8,
            }}>
                {title}
            </div>
            {children}
        </div>
    )
}

// ── Wall component ────────────────────────────────────────────────────────────
export default function RetiredWall() {
    const [members,  setMembers]  = useState<WallMember[]>([])
    const [loading,  setLoading]  = useState(true)
    const [selected, setSelected] = useState<WallMember | null>(null)
    const [snapshot, setSnapshot] = useState<DischargeSnapshot | null | 'loading'>(null)

    const [zoom,    setZoom]    = useState(1)
    const [origin,  setOrigin]  = useState({ x: 0, y: 300 })
    const [scrollX, setScrollX] = useState(0)
    const [edgeDir, setEdgeDir] = useState<'left' | 'right' | null>(null)

    const wallRef    = useRef<HTMLDivElement>(null)
    const scrollR    = useRef(0)
    const maxScrollR = useRef(0)
    const zoomR      = useRef(1)
    const initDone   = useRef(false)

    useEffect(() => { scrollR.current = scrollX }, [scrollX])
    useEffect(() => { zoomR.current   = zoom    }, [zoom])

    // Fetch members
    useEffect(() => {
        fetch('/api/community/retired')
            .then(r => r.json())
            .then(d => setMembers(d.members ?? []))
            .finally(() => setLoading(false))
    }, [])

    // Fetch snapshot when a plaque is selected
    useEffect(() => {
        if (!selected) { setSnapshot(null); return }
        if (!selected.discordId) { setSnapshot(null); return }
        setSnapshot('loading')
        fetch(`/api/community/retired/snapshot?discordId=${encodeURIComponent(selected.discordId)}`)
            .then(r => r.json())
            .then(d => setSnapshot(d.snapshot ?? null))
            .catch(() => setSnapshot(null))
    }, [selected])

    // Auto-open via ?member={discordId} URL param
    useEffect(() => {
        if (members.length === 0) return
        const memberId = new URLSearchParams(window.location.search).get('member')
        if (!memberId) return
        const found = members.find(m => m.discordId === memberId || m._id === memberId)
        if (found) setSelected(found)
    }, [members])

    // Prevent page from scrolling vertically while on this page
    useEffect(() => {
        const prev = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => { document.body.style.overflow = prev }
    }, [])

    const hdMembers = useMemo(() => members.filter(m => m.dischargeType === 'HD'), [members])
    const gdMembers = useMemo(() => members.filter(m => m.dischargeType === 'GD'), [members])
    const layout    = useMemo(() => computeLayout(gdMembers), [gdMembers])

    const contentW = layout ? layout.gridW + CONTENT_PAD_X * 2 : 2000
    const centreX  = layout ? CONTENT_PAD_X + layout.centreRelX : contentW / 2

    useEffect(() => {
        if (!layout || !wallRef.current || initDone.current) return
        const viewW = wallRef.current.clientWidth
        maxScrollR.current = Math.max(0, contentW - viewW)
        const initX = Math.max(0, Math.min(maxScrollR.current, centreX - viewW / 2))
        scrollR.current = initX
        setScrollX(initX)
        initDone.current = true
    }, [layout, contentW, centreX])

    // Scroll-wheel zoom
    useEffect(() => {
        const el = wallRef.current
        if (!el) return
        const handler = (e: WheelEvent) => {
            e.preventDefault()
            const r = el.getBoundingClientRect()
            setOrigin({ x: e.clientX - r.left, y: e.clientY - r.top })
            setZoom(p => Math.min(4, Math.max(1, p + (e.deltaY < 0 ? 0.15 : -0.15))))
        }
        el.addEventListener('wheel', handler, { passive: false })
        return () => el.removeEventListener('wheel', handler)
    }, [])

    // Edge-scroll RAF loop
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
    }, [])

    const isLoaded = !loading && members.length > 0

    const originX = origin.x + scrollX
    const originY = origin.y

    // ── Snapshot modal body ───────────────────────────────────────────────────
    function renderModalBody() {
        if (snapshot === 'loading') {
            return (
                <div style={{ padding: '32px 0', textAlign: 'center', fontFamily: "'Cinzel', serif", fontSize: '0.72rem', letterSpacing: '0.12em', color: 'rgba(26,20,12,0.40)', textTransform: 'uppercase' }}>
                    Loading service record…
                </div>
            )
        }

        if (!snapshot) {
            return (
                <div className={styles.noMilpac}>
                    No archived service record on file for this member.
                </div>
            )
        }

        const m = snapshot.milpac
        const userId = snapshot.userId
        const dischargeLabel = snapshot.dischargeType === 'honorable' ? 'Honourable Discharge' : 'Dishonourable Discharge'

        return (
            <>
                {/* Rank + discharge type badge */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    {snapshot.rankAtDischarge && (
                        <span style={{
                            fontFamily: "'Cinzel', serif", fontSize: '0.62rem', fontWeight: 700,
                            letterSpacing: '0.18em', textTransform: 'uppercase',
                            color: 'rgba(26,20,12,0.55)',
                        }}>
                            {snapshot.rankAtDischarge}
                        </span>
                    )}
                    <span style={{
                        fontFamily: "'Cinzel', serif", fontSize: '0.55rem', fontWeight: 700,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        color: snapshot.dischargeType === 'honorable' ? '#3b6e3b' : '#8b2020',
                        border: `1px solid ${snapshot.dischargeType === 'honorable' ? 'rgba(59,110,59,0.4)' : 'rgba(139,32,32,0.4)'}`,
                        padding: '2px 8px',
                    }}>
                        {dischargeLabel}
                    </span>
                </div>

                {/* Archived MilPac images */}
                {userId && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 14, marginBottom: 4, flexWrap: 'wrap' }}>
                        <img
                            src={`/api/milpacs/${userId}-discharge`}
                            alt='Uniform'
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            style={{ flex: '1 1 200px', maxWidth: 280, height: 'auto', border: '1px solid rgba(26,20,12,0.12)', display: 'block' }}
                        />
                        <img
                            src={`/api/milpacs/${userId}-discharge?type=medals`}
                            alt='Medals'
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            style={{ flex: '1 1 200px', maxWidth: 280, height: 'auto', border: '1px solid rgba(26,20,12,0.12)', display: 'block' }}
                        />
                    </div>
                )}

                {/* Service Record */}
                <SnapSection title='Service Record'>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', fontFamily: 'system-ui, sans-serif' }}>
                        <tbody>
                            {([
                                ['Status',         'Discharged'],
                                ['Enlisted',        snapshot.enlistedDate || '—'],
                                ['Discharge Date',  snapshot.dischargeDate || '—'],
                                ['Rank',            snapshot.rankAtDischarge || '—'],
                                ['Points',          snapshot.pointsAtDischarge > 0 ? String(snapshot.pointsAtDischarge) : '—'],
                            ] as [string, string][]).map(([label, value]) => (
                                <tr key={label} style={{ borderBottom: '1px solid rgba(26,20,12,0.08)' }}>
                                    <td style={{ padding: '6px 0', color: 'rgba(26,20,12,0.45)', width: 140, fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                                        {label}
                                    </td>
                                    <td style={{ padding: '6px 0', color: 'rgba(26,20,12,0.85)' }}>
                                        {label === 'Status' ? (
                                            <span style={{ fontWeight: 700, color: snapshot.dischargeType === 'honorable' ? '#3b6e3b' : '#8b2020' }}>
                                                {value}
                                            </span>
                                        ) : value}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </SnapSection>

                {/* Promotion History */}
                {m.promotions && m.promotions.length > 0 && (
                    <SnapSection title='Promotion History'>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'system-ui, sans-serif' }}>
                            <thead>
                                <tr>
                                    {['Date', 'Rank', 'Role'].map(h => (
                                        <th key={h} style={{ padding: '5px 0', textAlign: 'left', color: 'rgba(26,20,12,0.35)', fontWeight: 600, fontSize: '0.62rem', letterSpacing: '0.08em', textTransform: 'uppercase', borderBottom: '1px solid rgba(26,20,12,0.12)' }}>
                                            {h}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {m.promotions.map((p, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid rgba(26,20,12,0.06)' }}>
                                        <td style={{ padding: '6px 0', color: 'rgba(26,20,12,0.4)', width: 110, fontSize: '0.72rem' }}>{p.date}</td>
                                        <td style={{ padding: '6px 0', color: 'rgba(26,20,12,0.8)', fontWeight: 600 }}>{p.rank}</td>
                                        <td style={{ padding: '6px 0', color: 'rgba(26,20,12,0.55)' }}>{p.role}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </SnapSection>
                )}

                {/* Qualifications */}
                {m.qualifications && m.qualifications.length > 0 && (
                    <SnapSection title='Qualifications'>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'system-ui, sans-serif' }}>
                            <tbody>
                                {m.qualifications.map((q, i) => {
                                    const code     = QUAL_TO_BADGE[q.qualification]
                                    const badgeUrl = code ? trainingBadgeUrl(code) : null
                                    return (
                                        <tr key={i} style={{ borderBottom: '1px solid rgba(26,20,12,0.06)' }}>
                                            <td style={{ padding: '5px 8px 5px 0', width: 32 }}>
                                                {badgeUrl && (
                                                    <img src={badgeUrl} alt={code} style={{ width: 26, height: 26, objectFit: 'contain', display: 'block' }} />
                                                )}
                                            </td>
                                            <td style={{ padding: '6px 8px 6px 0', color: 'rgba(26,20,12,0.4)', width: 110, fontSize: '0.72rem' }}>{q.date}</td>
                                            <td style={{ padding: '6px 0', color: 'rgba(26,20,12,0.8)', fontWeight: 600 }}>{q.qualification}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </SnapSection>
                )}

                {/* Awards */}
                {m.awards && m.awards.length > 0 && (
                    <SnapSection title='Awards & Citations'>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {m.awards.map((a, i) => {
                                const citation = AWARD_TO_CITATION[a.name]
                                return (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(26,20,12,0.06)', fontFamily: 'system-ui, sans-serif' }}>
                                        {citation ? (
                                            <img
                                                src={`/milpac-assets/imge/Ribbons/${citation}.png`}
                                                alt={a.name}
                                                style={{ width: 60, height: 20, objectFit: 'contain', flexShrink: 0, imageRendering: 'pixelated' }}
                                            />
                                        ) : (
                                            <div style={{ width: 60, height: 20, flexShrink: 0, background: 'rgba(26,20,12,0.06)', border: '1px solid rgba(26,20,12,0.12)' }} />
                                        )}
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(26,20,12,0.8)' }}>{a.name}</span>
                                            {a.type && (
                                                <span style={{ marginLeft: 8, fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(26,20,12,0.35)', border: '1px solid rgba(26,20,12,0.18)', padding: '1px 6px' }}>
                                                    {a.type}
                                                </span>
                                            )}
                                        </div>
                                        {a.date && (
                                            <span style={{ fontSize: '0.68rem', color: 'rgba(26,20,12,0.35)', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.date}</span>
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    </SnapSection>
                )}

                {/* View Retired Record link */}
                {selected?.discordId && (
                    <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid rgba(26,20,12,0.12)', textAlign: 'center' }}>
                        <a
                            href={`/community/retired?member=${selected.discordId}`}
                            style={{ fontFamily: "'Cinzel', serif", fontSize: '0.62rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(26,20,12,0.45)', textDecoration: 'none' }}
                            onClick={e => e.preventDefault()}
                        >
                            Permanent link copied on share
                        </a>
                    </div>
                )}
            </>
        )
    }

    return (
        /* ── Viewport ── */
        <div
            ref={wallRef}
            style={{
                width: '100vw',
                height: '100vh',
                overflow: 'hidden',
                position: 'relative',
                backgroundColor: '#e0dbd0',
            }}
        >
            {/* ── Scroll wrapper ── */}
            <div style={{
                position: 'absolute',
                top: 0, left: 0,
                width: contentW,
                height: '100%',
                transform: `translateX(-${scrollX}px)`,
            }}>
                {/* ── Zoom + content ── */}
                <div style={{
                    width: contentW,
                    height: '100%',
                    position: 'relative',
                    transform: `scale(${zoom})`,
                    transformOrigin: `${originX}px ${originY}px`,
                    transition: 'transform 0.2s ease-out',
                    willChange: 'transform',
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
                            {/* ═══ HD SECTION ══════════════════════════════════════ */}
                            <div style={{
                                position: 'absolute',
                                top: 36,
                                left: centreX,
                                transform: 'translateX(-50%)',
                                textAlign: 'center',
                                whiteSpace: 'nowrap',
                            }}>
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

                            {/* ── Carved separator ── */}
                            {layout && (
                                <div style={{
                                    position: 'absolute',
                                    top: HD_SECTION_H + 26,
                                    left: 0,
                                    width: contentW,
                                    height: 2,
                                    background: '#1a1006',
                                    boxShadow: '0 1px 0 rgba(255,255,255,0.42), 0 -1px 0 rgba(0,0,0,0.10)',
                                }} />
                            )}

                            {/* ═══ GD SECTION ══════════════════════════════════════ */}
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
                </div>
            </div>

            {/* ── Edge scroll hints ── */}
            <div className={`${styles.edgeHint} ${styles.edgeLeft}  ${edgeDir === 'left'  ? styles.edgeHintActive : ''}`}>◀</div>
            <div className={`${styles.edgeHint} ${styles.edgeRight} ${edgeDir === 'right' ? styles.edgeHintActive : ''}`}>▶</div>

            {/* ── Hint bar ── */}
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
                    <div
                        className={styles.modalBox}
                        onClick={e => e.stopPropagation()}
                        style={{ width: snapshot && snapshot !== 'loading' ? 'min(820px, 100%)' : undefined }}
                    >
                        <h2 className={styles.modalName}>{selected.callsign}</h2>
                        {yr(selected) && <div className={styles.modalYears}>{yr(selected)}</div>}

                        {renderModalBody()}

                        <button
                            onClick={() => setSelected(null)}
                            style={{
                                marginTop: 22, padding: '8px 18px', cursor: 'pointer',
                                fontFamily: "'Cinzel', serif", fontSize: '0.78rem', letterSpacing: '0.08em',
                                background: 'transparent', border: '1px solid rgba(26,20,12,0.25)',
                                color: 'rgba(26,20,12,0.65)',
                            }}
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    )
}
