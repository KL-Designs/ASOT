'use client'

const RED = '#db001d'

interface Props {
    title: string
    instructions: string[]
    timeLimitMinutes: number
    onStart: () => void
    starting: boolean
}

export default function QuizInstructionModal({ title, instructions, timeLimitMinutes, onStart, starting }: Props) {
    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.88)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
        }}>
            <div style={{
                maxWidth: 560, width: '100%',
                border: `1px solid rgba(219,0,29,0.35)`,
                borderTop: `2px solid ${RED}`,
                background: 'rgba(10,10,10,0.97)',
                position: 'relative',
            }}>
                {/* Corner ticks */}
                <div style={{ position: 'absolute', bottom: 0, left: 0, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: 16, height: 1, background: 'rgba(219,0,29,0.4)' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, width: 1, height: 16, background: 'rgba(219,0,29,0.4)' }} />
                </div>
                <div style={{ position: 'absolute', bottom: 0, right: 0, pointerEvents: 'none' }}>
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 16, height: 1, background: 'rgba(219,0,29,0.4)' }} />
                    <div style={{ position: 'absolute', bottom: 0, right: 0, width: 1, height: 16, background: 'rgba(219,0,29,0.4)' }} />
                </div>

                {/* Header */}
                <div style={{
                    padding: '16px 24px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    background: 'rgba(0,0,0,0.4)',
                }}>
                    <div style={{
                        fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.25em',
                        textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)',
                        fontFamily: 'monospace', marginBottom: 6,
                    }}>
                        // ASSESSMENT
                    </div>
                    <h1 style={{
                        margin: 0, fontSize: '1rem', fontWeight: 800,
                        letterSpacing: '0.08em', textTransform: 'uppercase',
                        color: 'rgba(237,237,237,0.92)',
                    }}>
                        {title}
                    </h1>
                </div>

                {/* Timer badge — centred, blue */}
                <div style={{ padding: '14px 24px 0', textAlign: 'center' }}>
                    <div style={{
                        display: 'inline-flex', alignItems: 'center', gap: 8,
                        padding: '6px 18px',
                        border: '1px solid rgba(59,130,246,0.4)',
                        background: 'rgba(59,130,246,0.08)',
                    }}>
                        <span style={{
                            fontSize: '0.85rem', fontWeight: 800, color: '#60a5fa',
                            fontFamily: 'monospace', letterSpacing: '0.04em',
                        }}>
                            {timeLimitMinutes} minutes
                        </span>
                        <span style={{
                            fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em',
                            textTransform: 'uppercase', color: 'rgba(96,165,250,0.75)',
                        }}>
                            Time Limit
                        </span>
                    </div>
                </div>

                {/* Instructions */}
                <div style={{ padding: '16px 24px' }}>
                    <div style={{
                        fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.22em',
                        textTransform: 'uppercase', color: 'rgba(237,237,237,0.28)',
                        fontFamily: 'monospace', marginBottom: 10,
                    }}>
                        Instructions
                    </div>
                    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {instructions.map((instruction, i) => (
                            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                                <span style={{
                                    flexShrink: 0, width: 18, height: 18,
                                    border: '1px solid rgba(219,0,29,0.35)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.55rem', fontWeight: 700, color: 'rgba(219,0,29,0.65)',
                                    fontFamily: 'monospace',
                                }}>
                                    {String(i + 1).padStart(2, '0')}
                                </span>
                                <span style={{ fontSize: '0.75rem', color: 'rgba(237,237,237,0.75)', lineHeight: 1.5 }}>
                                    {instruction}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                {/* Warning */}
                <div style={{
                    margin: '0 24px',
                    padding: '10px 14px',
                    background: 'rgba(219,0,29,0.06)',
                    border: '1px solid rgba(219,0,29,0.2)',
                    borderLeft: '3px solid rgba(219,0,29,0.6)',
                    fontSize: '0.68rem', color: 'rgba(237,237,237,0.65)', lineHeight: 1.5,
                }}>
                    The timer starts the moment you click <strong style={{ color: 'rgba(237,237,237,0.85)' }}>Start Quiz</strong>. Ensure you are ready before proceeding.
                </div>

                {/* Start button — green */}
                <div style={{ padding: '20px 24px 24px' }}>
                    <button
                        onClick={onStart}
                        disabled={starting}
                        style={{
                            all: 'unset', cursor: starting ? 'default' : 'pointer',
                            display: 'block', width: '100%', boxSizing: 'border-box',
                            textAlign: 'center', padding: '12px 0',
                            background: starting ? 'rgba(22,163,74,0.4)' : '#16a34a',
                            border: '1px solid #16a34a',
                            fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.15em',
                            textTransform: 'uppercase', color: '#fff',
                            opacity: starting ? 0.7 : 1,
                            transition: 'opacity 0.15s',
                        }}
                    >
                        {starting ? 'Starting…' : 'Start Quiz'}
                    </button>
                </div>
            </div>
        </div>
    )
}
