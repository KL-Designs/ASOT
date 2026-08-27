import type { ReactNode } from 'react'

interface TabPanelProps {
    title: string
    /** Right-aligned mono caption: the panel's time horizon ("16w → 4w out")
     * or a count ("3 of 5 complete"). */
    horizon?: string
    /** Inline header content between title and horizon — status badges,
     * "Saving…" indicators. */
    badge?: ReactNode
    children: ReactNode
}

/**
 * The editor's tab-panel chrome: hairline box, 36px accent tick on the
 * top-left corner, header rule. Same shape as the deck's `Panel` (which stays
 * for DetailsCard), but with a `badge` slot the deck never needed and no
 * padding on the body — tab panels lay out their own interiors.
 */
export default function TabPanel({ title, horizon, badge, children }: TabPanelProps) {
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
                {badge}
                {horizon && (
                    <span style={{
                        marginLeft: 'auto', fontFamily: 'var(--mono)',
                        fontSize: 9.5, color: 'var(--ink-3)', letterSpacing: '0.12em',
                    }}>{horizon}</span>
                )}
            </div>
            <div>{children}</div>
        </div>
    )
}
