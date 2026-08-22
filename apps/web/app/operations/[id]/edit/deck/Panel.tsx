import type { ReactNode } from 'react'

interface PanelProps {
    title: string
    tag?: string
    children: ReactNode
}

/** The milpac panel: hairline box, 36px accent tick on the top-left corner. */
export default function Panel({ title, tag, children }: PanelProps) {
    return (
        <div style={{
            position: 'relative',
            border: '1px solid var(--line)',
            borderRadius: 'var(--r)',
            background: 'linear-gradient(180deg, var(--s1) 0%, var(--bg) 100%)',
        }}>
            <div style={{
                position: 'absolute', top: 0, left: 0,
                width: 36, height: 2, background: 'var(--acc)', opacity: 0.75,
            }} />
            <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 18px', borderBottom: '1px solid var(--line)',
            }}>
                <span style={{
                    fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase',
                    fontWeight: 700, color: 'var(--ink)',
                }}>{title}</span>
                {tag && (
                    <span style={{
                        marginLeft: 'auto', fontFamily: 'var(--mono)',
                        fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.12em',
                    }}>{tag}</span>
                )}
            </div>
            <div>{children}</div>
        </div>
    )
}
