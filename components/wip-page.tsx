export default function WipPage() {
    return (
        <div className='flex flex-col items-center justify-center' style={{ minHeight: '60vh', padding: '4rem 2rem' }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '1.5rem',
                maxWidth: 480,
                width: '100%',
                border: '1px solid rgba(219,0,29,0.2)',
                borderTop: '3px solid var(--red)',
                background: 'rgba(219,0,29,0.03)',
                padding: '3rem 2.5rem',
                textAlign: 'center',
            }}>
                <div style={{
                    fontSize: '0.6rem',
                    fontWeight: 700,
                    letterSpacing: '0.3em',
                    color: 'var(--red)',
                    textTransform: 'uppercase',
                    border: '1px solid rgba(219,0,29,0.4)',
                    padding: '0.25rem 0.75rem',
                }}>
                    Work in Progress
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', width: '100%' }}>
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.15)' }} />
                    <div style={{ height: 2, width: 32, background: 'var(--red)' }} />
                    <div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.15)' }} />
                </div>

                <h2 style={{
                    fontSize: '1.8rem',
                    fontWeight: 800,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: 'rgba(237,237,237,0.9)',
                    margin: 0,
                }}>
                    Work in Progress
                </h2>

                <p style={{
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    letterSpacing: '0.06em',
                    color: 'rgba(237,237,237,0.4)',
                    margin: 0,
                    lineHeight: 1.8,
                    textTransform: 'uppercase',
                }}>
                    This page is currently under development<br />and is not yet available to the public.
                </p>
            </div>
        </div>
    )
}
