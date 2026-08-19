interface StripProps {
    daysUntil: number | null
    checksDone: number
    checksTotal: number
}

function Cell({ value, unit, label, tone }: {
    value: string; unit?: string; label: string; tone: string
}) {
    return (
        <div style={{ padding: '16px 18px', borderRight: '1px solid var(--line)' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 600, lineHeight: 1.1, color: tone }}>
                {value}
                {unit && <small style={{ fontSize: '0.5em', color: 'var(--ink-3)', marginLeft: 3, letterSpacing: '0.1em' }}>{unit}</small>}
            </div>
            <div style={{ marginTop: 5, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'var(--ink-3)', fontWeight: 600 }}>
                {label}
            </div>
        </div>
    )
}

export default function CountdownStrip({ daysUntil, checksDone, checksTotal }: StripProps) {
    const allDone = checksTotal > 0 && checksDone === checksTotal
    return (
        <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
            borderBottom: '1px solid var(--line)',
            background: 'linear-gradient(180deg, var(--s1), var(--bg))',
            flexShrink: 0,
        }}>
            <Cell
                value={daysUntil === null ? '—' : String(daysUntil)}
                unit={daysUntil === null ? undefined : 'DAYS'}
                label="Until Op"
                tone="var(--acc)"
            />
            <Cell
                value={String(checksDone)}
                unit={`/${checksTotal}`}
                label="Dev Checks"
                tone={allDone ? 'var(--good)' : 'var(--warn)'}
            />
        </div>
    )
}
