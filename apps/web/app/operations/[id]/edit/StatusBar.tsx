'use client'

import styles from './shell.module.css'

interface Props {
    /**
     * `null` means "not measured" — no provider is reachable yet to say either
     * way — and must render as a neutral state, never as `true`. Rendering a
     * green "Live" pill for a socket state nothing has observed would be a
     * fabricated value, not a placeholder.
     */
    connected: boolean | null
    activeDocTitle: string
    words: number
    sections: number
    savedAt: Date | null
    editorCount: number
    department: string
}

export default function StatusBar({
    connected, activeDocTitle, words, sections, savedAt, editorCount, department,
}: Props) {
    const cell: React.CSSProperties = {
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '0 16px', height: '100%',
        borderRight: '1px solid var(--line)',
        color: 'var(--ink-2)',
    }
    const connectedColor = connected === true ? 'var(--good)' : connected === false ? 'var(--crit)' : 'var(--ink-3)'
    const connectedLabel = connected === true ? 'Live' : connected === false ? 'Offline' : 'Link —'
    return (
        <div style={{
            display: 'flex', alignItems: 'center', height: 32, flexShrink: 0,
            borderTop: '1px solid var(--line)',
            background: 'linear-gradient(180deg, var(--s1), var(--bg))',
            fontFamily: 'var(--mono)', fontSize: 10,
            letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>
            <div style={{ ...cell, color: connectedColor }}>
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor' }} />
                {connectedLabel}
            </div>
            <div className={styles.sbDoc} style={cell}><span style={{ color: 'var(--ink-3)' }}>Doc</span> {activeDocTitle}</div>
            <div className={styles.sbWords} style={cell}>{words.toLocaleString()} words</div>
            <div className={styles.sbSections} style={cell}>{sections} sections</div>
            <div style={{ ...cell, color: 'var(--ink-3)' }}>
                {savedAt ? `Saved ${savedAt.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })}` : 'Not saved'}
            </div>
            <div style={{ flexGrow: 1 }} />
            <div className={styles.sbEditors} style={{ ...cell, borderRight: 'none', borderLeft: '1px solid var(--line)' }}>
                {editorCount} editing
            </div>
            <div className={styles.sbDept} style={{ ...cell, borderRight: 'none', borderLeft: '1px solid var(--line)', color: 'var(--ink-3)' }}>
                {department}
            </div>
        </div>
    )
}
