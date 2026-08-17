import { DOSSIER_SIZE, type DossierData } from './dossier-data'

/**
 * The Discord dossier card.
 *
 * Shares the share card's treatment — cover under three scrims, the accent sun,
 * the corner tick — because those were tuned against real uploads and are not
 * worth re-deriving. It is a separate layout rather than a widening of
 * opengraph-image.tsx, which is the link preview for every milpac URL pasted
 * anywhere (spec §1).
 *
 * Everything is an inline style because this renders through satori, not a
 * browser: no stylesheet, no custom properties, and every multi-child element
 * needs an explicit display:flex.
 */

// Imported rather than restated: the cover is pre-cropped to these exact
// dimensions by buildDossierData, and a card drawn at a different size than the
// image it was cropped for is a bug nothing would report.
const { width: W, height: H } = DOSSIER_SIZE
const PAD = 56

const LABEL = {
    fontSize: 15,
    letterSpacing: '0.22em',
    textTransform: 'uppercase' as const,
    color: '#6b7480',
    fontWeight: 600,
}

const RULE = '1px solid #1e232b'

export function DossierCard({ data }: { data: DossierData }) {
    const { accent } = data
    // The share card's rule: the longer the name, the smaller it is set.
    const nameSize = data.name.length > 20 ? 54 : data.name.length > 15 ? 64 : data.name.length > 10 ? 76 : 86

    return (
        <div style={{
            width: '100%', height: '100%', background: '#08090a',
            display: 'flex', flexDirection: 'column',
            fontFamily: 'sans-serif', position: 'relative',
        }}>
            {data.cover && (
                <>
                    {/* Pre-cropped to exactly WxH, so it needs no objectFit —
                        satori's support for that is thin. */}
                    <img src={data.cover} width={W} height={H} style={{ position: 'absolute', top: 0, left: 0 }} />

                    {/* Three scrims, each with its own job. One flat wash heavy
                        enough for the stat strip would drown the photo. */}
                    <div style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, background: '#08090ab8', display: 'flex' }} />
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex',
                        background: 'linear-gradient(180deg, #08090a4d 0%, #08090a26 34%, #08090ad9 100%)',
                    }} />
                    <div style={{
                        position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex',
                        background: 'linear-gradient(90deg, #08090acc 0%, #08090a4d 45%, #08090a00 74%)',
                    }} />
                </>
            )}

            {/* A single low sun in the accent, echoing the profile's banner. */}
            <div style={{
                position: 'absolute', top: -160, right: -80, width: 760, height: 760, borderRadius: 760,
                background: `radial-gradient(circle, ${accent}2e 0%, ${accent}0d 45%, #08090a00 70%)`,
                display: 'flex',
            }} />

            {/* The dossier's panel tick. */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: 96, height: 5, background: accent, display: 'flex' }} />

            {/* Ridgeline — the stand-in for a cover, so it yields to a real one. */}
            {!data.cover && (
                <svg width={W} height={220} viewBox='0 0 1400 220' style={{ position: 'absolute', left: 0, bottom: 150 }}>
                    <path d='M0 130 L160 96 L320 134 L480 92 L640 138 L810 100 L980 140 L1160 96 L1330 136 L1400 112 V220 H0 Z' fill='#101319' />
                    <path d='M0 168 L215 150 L430 178 L645 154 L860 182 L1075 158 L1290 184 L1400 164 V220 H0 Z' fill='#0b0e12' />
                </svg>
            )}

            {/* Top bar */}
            <div style={{ display: 'flex', alignItems: 'center', height: 72, padding: `0 ${PAD}px`, borderBottom: RULE }}>
                <span style={{ ...LABEL, color: '#a8b0ba' }}>Australian Special Operations Taskforce</span>
                <span style={{ ...LABEL, marginLeft: 'auto', color: data.discharged ? '#c05a48' : '#7fae5c' }}>
                    {data.statusLabel}
                </span>
            </div>

            {/* Body: uniform left, identity and medals right */}
            <div style={{ display: 'flex', flex: 1, padding: `28px ${PAD}px`, alignItems: 'center' }}>
                {data.uniform && (
                    <img src={data.uniform} width={560} height={400} style={{ borderRadius: 3, border: '1px solid #2a3038' }} />
                )}

                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginLeft: data.uniform ? 44 : 0 }}>
                    <span style={{ fontSize: 19, letterSpacing: '0.26em', textTransform: 'uppercase', color: accent }}>
                        {data.fullRank}
                    </span>
                    <span style={{
                        fontSize: nameSize, fontWeight: 800, letterSpacing: '-0.01em', textTransform: 'uppercase',
                        color: '#e8eaed', lineHeight: 1.04, marginTop: 4,
                    }}>
                        {data.name}
                    </span>
                    {data.meta !== '' && (
                        <span style={{ fontSize: 21, color: '#a8b0ba', letterSpacing: '0.04em', marginTop: 10 }}>
                            {data.meta}
                        </span>
                    )}
                    {data.medals && (
                        <img src={data.medals} width={700} height={250} style={{ marginTop: 22, borderRadius: 3 }} />
                    )}
                </div>
            </div>

            {/* Stat strip */}
            <div style={{ display: 'flex', borderTop: RULE }}>
                {data.stats.map((stat, i) => (
                    <div key={stat.label} style={{
                        display: 'flex', flexDirection: 'column', flex: 1,
                        padding: `20px ${PAD}px 22px`,
                        borderRight: i < data.stats.length - 1 ? RULE : 'none',
                    }}>
                        <span style={{ fontSize: 42, fontWeight: 600, lineHeight: 1, color: stat.accent ? accent : '#e8eaed' }}>
                            {stat.value}
                        </span>
                        <span style={{ ...LABEL, fontSize: 14, marginTop: 8 }}>{stat.label}</span>
                    </div>
                ))}
            </div>

            {/* Progress toward the next rank, the same bar the profile page
                leads with. Omitted entirely for a member on no rank track —
                an empty bar reads as "no progress" rather than "not applicable". */}
            {data.progress && (
                <div style={{
                    display: 'flex', flexDirection: 'column', gap: 10,
                    borderTop: RULE, padding: `18px ${PAD}px 20px`,
                }}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span style={{ ...LABEL, color: accent, display: 'flex', flex: 1 }}>
                            {data.progress.from}
                        </span>
                        <span style={{ ...LABEL, color: '#6b7480', display: 'flex', flex: 1, justifyContent: 'center' }}>
                            {data.progress.caption}
                        </span>
                        <span style={{ ...LABEL, color: accent, display: 'flex', flex: 1, justifyContent: 'flex-end' }}>
                            {data.progress.to ?? ''}
                        </span>
                    </div>
                    {data.progress.pct !== null && (
                        <div style={{ display: 'flex', width: '100%', height: 6, background: '#1e232b' }}>
                            <div style={{ display: 'flex', width: `${data.progress.pct}%`, background: accent }} />
                        </div>
                    )}
                </div>
            )}

            {/* Kit line — omitted entirely when there is no public kit, so the
                strip above becomes the card's foot rather than leaving a gap. */}
            {data.kitLine && (
                <div style={{ display: 'flex', alignItems: 'center', borderTop: RULE, padding: `0 ${PAD}px`, height: 76 }}>
                    <span style={{ ...LABEL, color: accent }}>Kit</span>
                    <span style={{ fontSize: 23, color: '#e8eaed', marginLeft: 20 }}>{data.kitLine}</span>
                </div>
            )}

            {/* The member's own accent, closing the card. Full bleed and
                unconditional — it is the card's foot whether or not the kit row
                above it is present, so a member with no public kit still gets a
                finished edge rather than a cut-off stat strip. */}
            <div style={{ display: 'flex', height: 6, background: accent }} />
        </div>
    )
}
