'use client'

export default function WipPage() {
    const handleBypass = () => {
        const url = new URL(window.location.href)
        url.searchParams.set('bypass_wip', '1')
        window.location.href = url.toString()
    }

    return (
        <div style={{
            minHeight: '80vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '4rem 2rem',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Classified watermark */}
            <div aria-hidden style={{
                position: 'absolute',
                fontSize: 'clamp(5rem, 16vw, 11rem)',
                fontWeight: 900,
                letterSpacing: '0.08em',
                color: 'rgba(219,0,29,0.045)',
                textTransform: 'uppercase',
                transform: 'rotate(-22deg)',
                userSelect: 'none',
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
            }}>RESTRICTED</div>

            <div style={{
                position: 'relative',
                maxWidth: 540,
                width: '100%',
                borderTop: '2px solid var(--red)',
                border: '1px solid rgba(219,0,29,0.18)',
                borderTopWidth: 2,
                borderTopColor: 'var(--red)',
                background: 'rgba(6,6,6,0.96)',
                padding: 'clamp(1.75rem, 5vw, 2.75rem)',
            }}>
                {/* Top label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '2rem' }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.18)' }} />
                    <div style={{
                        fontSize: '0.52rem',
                        fontWeight: 800,
                        letterSpacing: '0.35em',
                        color: 'var(--red)',
                        textTransform: 'uppercase',
                        border: '1px solid rgba(219,0,29,0.45)',
                        padding: '0.2rem 0.8rem',
                        fontFamily: 'monospace',
                    }}>Page Unavailable</div>
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.18)' }} />
                </div>

                <h1 style={{
                    fontSize: 'clamp(1.5rem, 4vw, 2.2rem)',
                    fontWeight: 900,
                    letterSpacing: '0.13em',
                    textTransform: 'uppercase',
                    color: 'rgba(237,237,237,0.95)',
                    margin: '0 0 0.2rem',
                    lineHeight: 1.1,
                }}>Under Development</h1>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '1.25rem 0 1.5rem' }}>
                    <div style={{ width: 28, height: 2, background: 'var(--red)', flexShrink: 0 }} />
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.12)' }} />
                </div>

                <p style={{
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    letterSpacing: '0.07em',
                    color: 'rgba(237,237,237,0.4)',
                    textTransform: 'uppercase',
                    lineHeight: 1.9,
                    margin: '0 0 2rem',
                }}>
                    This section is currently offline for scheduled development. It will be available once cleared for deployment.
                </p>

                {/* Override button */}
                <button
                    onClick={handleBypass}
                    style={{
                        width: '100%',
                        padding: '0.8rem 1.5rem',
                        background: 'transparent',
                        border: '1px solid rgba(219,0,29,0.3)',
                        color: 'rgba(237,237,237,0.45)',
                        fontSize: '0.58rem',
                        fontWeight: 700,
                        letterSpacing: '0.25em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        fontFamily: 'inherit',
                        transition: 'border-color 0.15s, color 0.15s',
                    }}
                    onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(219,0,29,0.6)'
                        ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.75)'
                    }}
                    onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(219,0,29,0.3)'
                        ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(237,237,237,0.45)'
                    }}
                >
                    <span style={{ color: 'rgba(219,0,29,0.6)', fontSize: '0.7rem' }}>⚠</span>
                    Access Page Anyway
                </button>
            </div>
        </div>
    )
}
