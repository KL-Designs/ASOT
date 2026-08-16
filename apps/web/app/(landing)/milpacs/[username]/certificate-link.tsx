'use client'

import { useEffect, useState } from 'react'

/**
 * Wraps arbitrary content in a click target that opens that member's
 * certificate full-screen.
 *
 * It takes `children` rather than drawing its own row because the trigger is
 * the award/citation row on the profile — the certificate *is* the record, so
 * clicking the record is the natural way to reach it, rather than a parallel
 * list of "view" buttons duplicating every award.
 *
 * The render service draws certificates on demand and nothing is persisted, so
 * a member with 30 awards would otherwise trigger 30 renders on every profile
 * view for something almost nobody opens. The <img> is only mounted once the
 * viewer clicks.
 */
export function CertificateViewer({
	label,
	href,
	accent,
	inline = false,
	children,
}: {
	label: string
	href: string
	accent: string
	/** Sit in a line of text (the rank row) rather than own a full-width row. */
	inline?: boolean
	children: React.ReactNode
}) {
	const [open, setOpen] = useState(false)
	const [failed, setFailed] = useState(false)
	const [loaded, setLoaded] = useState(false)
	const [hover, setHover] = useState(false)

	useEffect(() => {
		if (!open) return
		const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [open])

	// A render that failed once will fail again — drop back to plain content
	// rather than leaving a click target that does nothing.
	if (failed) return <>{children}</>

	return (
		<>
			<button
				type='button'
				onClick={() => { setOpen(true); setLoaded(false) }}
				onMouseEnter={() => setHover(true)}
				onMouseLeave={() => setHover(false)}
				title={`View ${label} certificate`}
				style={{
					display: inline ? 'inline-block' : 'block',
					width: inline ? 'auto' : '100%',
					textAlign: 'left',
					padding: 0, border: 'none', font: 'inherit', color: 'inherit',
					cursor: 'pointer',
					background: hover ? `${accent}0f` : 'transparent',
					boxShadow: inline
						? 'none'
						: hover ? `inset 2px 0 0 ${accent}aa` : 'inset 2px 0 0 transparent',
					opacity: inline && hover ? 0.75 : 1,
					transition: 'background 120ms, box-shadow 120ms, opacity 120ms',
				}}
			>
				{children}
			</button>

			{open && (
				<div
					onClick={() => setOpen(false)}
					style={{
						position: 'fixed', inset: 0, zIndex: 9999,
						background: 'rgba(0,0,0,0.92)', backdropFilter: 'blur(10px)',
						display: 'flex', alignItems: 'center', justifyContent: 'center',
						cursor: 'zoom-out',
					}}
				>
					{!loaded && (
						<span style={{ position: 'absolute', color: 'rgba(255,255,255,0.5)', fontSize: '0.8rem' }}>
							Rendering…
						</span>
					)}
					<img
						src={href}
						alt={label}
						onLoad={() => setLoaded(true)}
						onError={() => { setFailed(true); setOpen(false) }}
						style={{
							maxWidth: '95vw', maxHeight: '92vh', objectFit: 'contain',
							boxShadow: '0 16px 80px rgba(0,0,0,0.8)',
							opacity: loaded ? 1 : 0, transition: 'opacity 150ms',
						}}
						onClick={e => e.stopPropagation()}
					/>
					<a
						href={href}
						download={`${label}.png`}
						onClick={e => e.stopPropagation()}
						style={{
							position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
							fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.12em',
							textTransform: 'uppercase', textDecoration: 'none',
							color: 'rgba(255,255,255,0.7)', padding: '7px 16px',
							background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
						}}
					>
						Download
					</a>
					<button
						onClick={() => setOpen(false)}
						style={{
							position: 'absolute', top: 16, right: 20,
							background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
							color: 'rgba(255,255,255,0.7)', fontSize: '1.1rem', lineHeight: 1,
							padding: '6px 12px', cursor: 'pointer',
						}}
					>
						✕
					</button>
				</div>
			)}
		</>
	)
}
