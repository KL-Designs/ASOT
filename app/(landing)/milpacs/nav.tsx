'use client'

import { useEffect, useRef, useState } from 'react'

interface NavSub { id: string; label: string }
interface NavSection { id: string; label: string; subs: NavSub[] }

export default function MilpacsNav({ sections }: { sections: NavSection[] }) {
	const [open, setOpen] = useState<string | null>(null)
	const navRef = useRef<HTMLDivElement>(null)

	const scrollTo = (id: string) => {
		document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
		setOpen(null)
	}

	const handleMainClick = (section: NavSection) => {
		if (section.subs.length === 0) {
			scrollTo(section.id)
		} else if (open === section.id) {
			// Already open: scroll to the section itself
			scrollTo(section.id)
		} else {
			setOpen(section.id)
		}
	}

	// Close dropdown when clicking outside the nav
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (navRef.current && !navRef.current.contains(e.target as Node)) {
				setOpen(null)
			}
		}
		document.addEventListener('mousedown', handler)
		return () => document.removeEventListener('mousedown', handler)
	}, [])

	return (
		<div ref={navRef} style={{
			position: 'sticky',
			top: 0,
			zIndex: 100,
			background: 'rgba(10,10,10,0.92)',
			borderBottom: '1px solid rgba(219,0,29,0.18)',
			backdropFilter: 'blur(10px)',
		}}>
			<div style={{
				maxWidth: 1400,
				margin: '0 auto',
				padding: '0 2rem',
				display: 'flex',
				alignItems: 'center',
				justifyContent: 'center',
				gap: 0,
				flexWrap: 'wrap',
			}}>
				{sections.map((section, i) => (
					<div key={section.id} style={{ display: 'flex', alignItems: 'center' }}>
						{i > 0 && (
							<div style={{ width: 1, height: 14, background: 'rgba(219,0,29,0.2)', flexShrink: 0 }} />
						)}
						<div
							style={{ position: 'relative' }}
							onMouseEnter={() => section.subs.length > 0 && setOpen(section.id)}
							onMouseLeave={() => setOpen(null)}
						>
							<button
								onClick={() => handleMainClick(section)}
								style={{
									background: 'none',
									border: 'none',
									color: open === section.id ? 'rgba(219,0,29,0.9)' : 'rgba(237,237,237,0.45)',
									fontSize: '0.6rem',
									fontWeight: 700,
									letterSpacing: '0.18em',
									textTransform: 'uppercase',
									padding: '13px 18px',
									cursor: 'pointer',
									transition: 'color 0.15s ease',
									whiteSpace: 'nowrap',
									display: 'flex',
									alignItems: 'center',
									gap: 5,
								}}
							>
								{section.label}
								{section.subs.length > 0 && (
									<span style={{ opacity: 0.4, fontSize: '0.5rem', lineHeight: 1 }}>▾</span>
								)}
							</button>

							{open === section.id && section.subs.length > 0 && (
								<div style={{
									position: 'absolute',
									top: '100%',
									left: '50%',
									transform: 'translateX(-50%)',
									background: 'rgb(13,13,13)',
									border: '1px solid rgba(219,0,29,0.18)',
									borderTop: '2px solid rgba(219,0,29,0.5)',
									minWidth: 160,
									padding: '6px 0',
									boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
								}}>
									{section.subs.map(sub => (
										<button
											key={sub.id}
											onClick={() => scrollTo(sub.id)}
											style={{
												display: 'block',
												width: '100%',
												background: 'none',
												border: 'none',
												color: 'rgba(237,237,237,0.4)',
												fontSize: '0.58rem',
												fontWeight: 600,
												letterSpacing: '0.14em',
												textTransform: 'uppercase',
												padding: '8px 18px',
												cursor: 'pointer',
												textAlign: 'center',
												transition: 'color 0.12s ease, background 0.12s ease',
												whiteSpace: 'nowrap',
											}}
											onMouseEnter={e => {
												e.currentTarget.style.color = 'rgba(219,0,29,0.9)'
												e.currentTarget.style.background = 'rgba(219,0,29,0.06)'
											}}
											onMouseLeave={e => {
												e.currentTarget.style.color = 'rgba(237,237,237,0.4)'
												e.currentTarget.style.background = 'none'
											}}
										>
											{sub.label}
										</button>
									))}
								</div>
							)}
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
