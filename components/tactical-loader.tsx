"use client"

interface Props {
    label?: string
}

export default function TacticalLoader({ label = "LOADING" }: Props) {
    return (
        <div style={{
            minHeight: '100vh',
            background: 'rgb(10, 10, 10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Montserrat, sans-serif',
            position: 'relative',
            overflow: 'hidden',
        }}>
            {/* Scanline overlay */}
            <div style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
                pointerEvents: 'none',
                zIndex: 0,
            }} />

            {/* Content */}
            <div style={{
                position: 'relative',
                zIndex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 32,
            }}>
                {/* HUD frame */}
                <div style={{
                    position: 'relative',
                    padding: '40px 56px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 28,
                }}>
                    {/* Corner brackets */}
                    <Corner position="tl" />
                    <Corner position="tr" />
                    <Corner position="bl" />
                    <Corner position="br" />

                    {/* Spinner */}
                    <div style={{ position: 'relative', width: 72, height: 72 }}>
                        {/* Static outer ring */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: '50%',
                            border: '1px solid rgba(219,0,29,0.18)',
                        }} />
                        {/* Spinning arc */}
                        <div className="tactical-spin" style={{
                            position: 'absolute',
                            inset: 0,
                            borderRadius: '50%',
                            border: '2px solid transparent',
                            borderTopColor: 'rgb(219, 0, 29)',
                            borderRightColor: 'rgba(219,0,29,0.3)',
                        }} />
                        {/* Crosshair lines */}
                        <div style={{
                            position: 'absolute',
                            top: '50%',
                            left: '12px',
                            right: '12px',
                            height: '1px',
                            background: 'rgba(219,0,29,0.35)',
                            transform: 'translateY(-50%)',
                        }} />
                        <div style={{
                            position: 'absolute',
                            left: '50%',
                            top: '12px',
                            bottom: '12px',
                            width: '1px',
                            background: 'rgba(219,0,29,0.35)',
                            transform: 'translateX(-50%)',
                        }} />
                        {/* Center dot */}
                        <div className="tactical-pulse" style={{
                            position: 'absolute',
                            top: '50%',
                            left: '50%',
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: 'rgb(219,0,29)',
                            transform: 'translate(-50%, -50%)',
                        }} />
                    </div>

                    {/* Text block */}
                    <div style={{ textAlign: 'center' }}>
                        <div style={{
                            fontSize: '0.6rem',
                            letterSpacing: '0.3em',
                            color: 'rgba(219,0,29,0.7)',
                            textTransform: 'uppercase',
                            marginBottom: 10,
                        }}>
                            Australian Special Operations Taskforce
                        </div>
                        <div style={{
                            width: 120,
                            height: '1px',
                            background: 'linear-gradient(90deg, transparent, rgba(219,0,29,0.4), transparent)',
                            margin: '0 auto 12px',
                        }} />
                        <div style={{
                            fontSize: '0.62rem',
                            letterSpacing: '0.2em',
                            color: 'rgba(237,237,237,0.55)',
                            textTransform: 'uppercase',
                            marginBottom: 20,
                        }}>
                            {label}
                        </div>

                        {/* Progress bar */}
                        <div style={{
                            width: 160,
                            height: 2,
                            background: 'rgba(255,255,255,0.06)',
                            borderRadius: 1,
                            overflow: 'hidden',
                            margin: '0 auto 12px',
                        }}>
                            <div className="tactical-progress" style={{
                                height: '100%',
                                background: 'linear-gradient(90deg, rgba(219,0,29,0.6), rgb(219,0,29))',
                                borderRadius: 1,
                            }} />
                        </div>

                        <div className="tactical-blink" style={{
                            fontSize: '0.52rem',
                            letterSpacing: '0.25em',
                            color: 'rgba(237,237,237,0.25)',
                            textTransform: 'uppercase',
                        }}>
                            PLEASE STAND BY
                        </div>
                    </div>
                </div>
            </div>

            <style>{`
                @keyframes tactical-spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes tactical-pulse {
                    0%, 100% { opacity: 0.5; transform: translate(-50%, -50%) scale(1); }
                    50% { opacity: 1; transform: translate(-50%, -50%) scale(1.4); }
                }
                @keyframes tactical-progress {
                    0% { width: 0%; }
                    20% { width: 35%; }
                    50% { width: 55%; }
                    75% { width: 75%; }
                    100% { width: 90%; }
                }
                @keyframes tactical-blink {
                    0%, 100% { opacity: 0.25; }
                    50% { opacity: 0.6; }
                }
                .tactical-spin { animation: tactical-spin 1.2s linear infinite; }
                .tactical-pulse { animation: tactical-pulse 1.8s ease-in-out infinite; }
                .tactical-progress { animation: tactical-progress 4s ease-out forwards; }
                .tactical-blink { animation: tactical-blink 1.4s ease-in-out infinite; }
            `}</style>
        </div>
    )
}

function Corner({ position }: { position: 'tl' | 'tr' | 'bl' | 'br' }) {
    const size = 14
    const thickness = 1.5
    const color = 'rgba(219,0,29,0.45)'
    const offset = 0

    const styles: React.CSSProperties = {
        position: 'absolute',
        width: size,
        height: size,
    }

    if (position === 'tl') {
        styles.top = offset; styles.left = offset
        styles.borderTop = `${thickness}px solid ${color}`
        styles.borderLeft = `${thickness}px solid ${color}`
    } else if (position === 'tr') {
        styles.top = offset; styles.right = offset
        styles.borderTop = `${thickness}px solid ${color}`
        styles.borderRight = `${thickness}px solid ${color}`
    } else if (position === 'bl') {
        styles.bottom = offset; styles.left = offset
        styles.borderBottom = `${thickness}px solid ${color}`
        styles.borderLeft = `${thickness}px solid ${color}`
    } else {
        styles.bottom = offset; styles.right = offset
        styles.borderBottom = `${thickness}px solid ${color}`
        styles.borderRight = `${thickness}px solid ${color}`
    }

    return <div style={styles} />
}
