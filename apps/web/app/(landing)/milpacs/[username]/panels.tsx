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
 * Twelve flex columns rather than a chart library or an SVG: the accent comes
 * from the same CSS custom property as the rest of the page, and each column
 * carries a title attribute so hovering gives the month and count through the
 * browser's own tooltip without shipping any JavaScript.
 *
 * Deliberately not SVG. An SVG filling a variable-width container must either
 * letterbox or scale non-uniformly, and non-uniform scaling stretches the type
 * along with the bars — which is exactly what it did.
 *
 * The mockup also draws a grey "capacity" track behind each bar — how many
 * operations were available that month. That denominator is not reliably
 * derivable (historical CSV-imported operations only record attendees, not the
 * full roster), so it is omitted rather than estimated.
 */
export function MonthChart({ months }: { months: MonthBucket[] }) {
    const peak = Math.max(1, ...months.map(m => m.attended))
    const total = months.reduce((n, m) => n + m.attended, 0)

    return (
        <div
            className={s.chart}
            role='img'
            aria-label={total === 0
                ? 'No operations attended in the last 12 months.'
                : `Operations attended per month over the last 12 months. ${months.map(m => `${m.full}: ${m.attended}`).join(', ')}.`}
        >
            {months.map(m => (
                <div
                    key={m.full}
                    className={s.chartCol}
                    // The browser's own tooltip — the month and count, with no
                    // JavaScript and no hover state to manage.
                    title={`${m.full} — ${m.attended} operation${m.attended === 1 ? '' : 's'}`}
                >
                    <div className={s.chartPlot}>
                        {m.attended > 0 && <span className={s.chartVal}>{m.attended}</span>}
                        {m.attended > 0 && (
                            <div className={s.chartBar} style={{ height: `${(m.attended / peak) * 100}%` }} />
                        )}
                    </div>
                    <span className={s.chartLbl}>{m.label}</span>
                </div>
            ))}
        </div>
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
