'use client'

export default function PrintButton({ bgColor }: { bgColor: string }) {
    function handlePrint() {
        const nav = document.getElementById('site-navbar')
        const footer = document.getElementById('site-footer')
        const navH = nav?.offsetHeight ?? 0
        const footH = footer?.offsetHeight ?? 0
        const contentH = document.documentElement.scrollHeight - navH - footH
        const contentW = document.documentElement.clientWidth

        const el = document.createElement('style')
        el.textContent = `@media print { @page { size: ${contentW}px ${Math.ceil(contentH * 1.05)}px; margin: 0.3in; } }`
        document.head.appendChild(el)
        window.addEventListener('afterprint', () => el.remove(), { once: true })
        window.print()
    }

    return (
        <>
            <style>{`
                @media print {
                    .print-hide { display: none !important; }
                    #site-navbar, #site-footer, #custom-cursor { display: none !important; }
                    html, body { background: ${bgColor} !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                    * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
                    [data-print-section] { break-inside: avoid; page-break-inside: avoid; }
                }
            `}</style>
            <button
                className='print-hide'
                onClick={handlePrint}
                style={{
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.15)',
                    color: 'rgba(237,237,237,0.45)',
                    fontSize: '0.6rem',
                    fontWeight: 600,
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    padding: '4px 10px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    transition: 'color 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                    e.currentTarget.style.color = 'rgba(237,237,237,0.8)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)'
                }}
                onMouseLeave={e => {
                    e.currentTarget.style.color = 'rgba(237,237,237,0.45)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
                }}
            >
                <svg width='10' height='10' viewBox='0 0 10 10' fill='currentColor'>
                    <path d='M2 0h6v3H2zM1 4h8v4H1zM3 5.5h4v.8H3zM3 7h4v.8H3z' opacity='.7' />
                    <rect x='2' y='4.5' width='1' height='1' />
                </svg>
                Export PDF
            </button>
        </>
    )
}
