import s from './profile.module.css'

/** A dossier panel. `tag` is the right-aligned count/qualifier in the header. */
export function Panel({ title, tag, delay, flush, children }: {
    title: string
    tag?: string
    /** Staggers the entrance, as the mockup does. */
    delay?: string
    /** Removes body padding, for panels whose content draws its own edges. */
    flush?: boolean
    children: React.ReactNode
}) {
    return (
        <section className={`${s.panel} ${s.rise}`} style={delay ? { animationDelay: delay } : undefined}>
            <header className={s.panelHeader}>
                <h2>{title}</h2>
                {tag && <span className={s.tag}>{tag}</span>}
            </header>
            <div className={flush ? s.bodyFlush : s.body}>{children}</div>
        </section>
    )
}

export function Rows({ children }: { children: React.ReactNode }) {
    return <div className={s.rows}>{children}</div>
}

/** One label/value row. Renders nothing when the value is empty, so a panel of
 *  rows never shows a key with an em-dash beside it. */
export function Row({ label, value, children }: {
    label: string
    value?: string | number | null
    children?: React.ReactNode
}) {
    if (!children && (value === null || value === undefined || value === '')) return null
    return (
        <div className={s.rw}>
            <span className={s.rwK}>{label}</span>
            <span className={s.rwV}>{children ?? value}</span>
        </div>
    )
}

/** Every panel needs one — an empty panel with no explanation reads as broken. */
export function Empty({ text }: { text: string }) {
    return <p className={s.empty}>{text}</p>
}

// ── Soldiers Medallions ──────────────────────────────────────────────────────

/**
 * The three Soldiers Medallions are chest medallions rather than ribbons, so
 * they have no `AWARD_TO_CITATION` entry and the awards list drew an empty box
 * for them.
 *
 * Their only artwork is a full-canvas 1398x1000 uniform layer with the medallion
 * in one of three chest slots — there is no standalone icon anywhere in the asset
 * tree. Rather than add one (a generated asset to keep in step with the layer it
 * was cut from), the layer is cropped to the medallion in CSS. The `2` variant is
 * the centre slot; the suffix only shifts X, so which is used is arbitrary as
 * long as the offset matches.
 */
export const MEDALLION_ART: Record<string, string> = {
    'Bronze Soldiers Medallion': 'Bronze2',
    'Silver Soldiers Medallion': 'Silver2',
    'Gold Soldiers Medallion': 'Gold2',
}

/** Where the medallion sits in the 1398x1000 layer, measured off its alpha channel. */
const MEDALLION_CROP = { x: 510, y: 356, w: 36, h: 35, canvasW: 1398, canvasH: 1000 }

export function MedallionIcon({ art, alt, size }: { art: string; alt: string; size: number }) {
    const scale = size / MEDALLION_CROP.h
    return (
        <span style={{ display: 'block', width: size, height: size, flexShrink: 0, position: 'relative', overflow: 'hidden' }}>
            <img
                src={`/milpac-assets/imge/Medallions/${art}.png`}
                alt={alt}
                title={alt}
                style={{
                    position: 'absolute',
                    width: MEDALLION_CROP.canvasW * scale,
                    height: MEDALLION_CROP.canvasH * scale,
                    left: -(MEDALLION_CROP.x + (MEDALLION_CROP.w - MEDALLION_CROP.h) / 2) * scale,
                    top: -MEDALLION_CROP.y * scale,
                    maxWidth: 'none',
                }}
            />
        </span>
    )
}

// ── Combat record chart ──────────────────────────────────────────────────────

export type MonthBucket = { label: string; full: string; attended: number }

/**
 * Operations attended per month over the last twelve.
 *
 * Server-rendered SVG rather than a charting library: it is twelve rectangles and
 * a baseline, and the accent comes from the same CSS custom property as the rest
 * of the page. Each bar carries a <title>, so hovering gives the month and count
 * through the browser's own tooltip without shipping any JavaScript.
 *
 * The mockup also draws a grey "capacity" track behind each bar — how many
 * operations were available that month. That denominator is not reliably
 * derivable (historical CSV-imported operations only record attendees, not the
 * full roster), so it is omitted rather than estimated.
 */
export function MonthChart({ months }: { months: MonthBucket[] }) {
    const W = 720, H = 190, padT = 14, padB = 26, padL = 8, padR = 8
    const plotH = H - padT - padB
    const slot = (W - padL - padR) / months.length
    const barW = Math.min(34, slot * 0.55)
    const peak = Math.max(1, ...months.map(m => m.attended))

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio='none'
            role='img'
            aria-label={`Operations attended per month over the last 12 months. ${months.map(m => `${m.full}: ${m.attended}`).join(', ')}`}
            style={{ width: '100%', height: 190, display: 'block' }}
        >
            <line x1={padL} y1={padT + plotH} x2={W - padR} y2={padT + plotH} stroke='var(--line-2)' strokeWidth={1} />
            {months.map((m, i) => {
                const h = m.attended === 0 ? 0 : Math.max(3, (m.attended / peak) * plotH)
                const x = padL + slot * i + (slot - barW) / 2
                const y = padT + plotH - h
                return (
                    <g key={m.full}>
                        {h > 0 && (
                            <rect x={x} y={y} width={barW} height={h} fill='var(--acc)' opacity={0.85}>
                                <title>{`${m.full} — ${m.attended} operation${m.attended === 1 ? '' : 's'}`}</title>
                            </rect>
                        )}
                        {m.attended > 0 && (
                            <text x={x + barW / 2} y={y - 5} textAnchor='middle' fill='var(--ink)' fontSize={10} fontFamily='var(--mono)'>
                                {m.attended}
                            </text>
                        )}
                        <text x={x + barW / 2} y={H - 8} textAnchor='middle' fill='var(--ink-3)' fontSize={9} fontFamily='var(--mono)' letterSpacing='0.08em'>
                            {m.label}
                        </text>
                    </g>
                )
            })}
        </svg>
    )
}

/** The last 12 calendar months ending with the current one, bucketed by date. */
export function bucketByMonth(dates: (Date | null)[], now = new Date()): MonthBucket[] {
    const buckets: MonthBucket[] = []
    const index = new Map<string, number>()
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const key = `${d.getFullYear()}-${d.getMonth()}`
        index.set(key, buckets.length)
        buckets.push({
            label: d.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase(),
            full: d.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' }),
            attended: 0,
        })
    }
    for (const date of dates) {
        if (!date) continue
        const at = index.get(`${date.getFullYear()}-${date.getMonth()}`)
        if (at !== undefined) buckets[at].attended++
    }
    return buckets
}
