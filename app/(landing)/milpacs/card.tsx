'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import Avatar from '@/components/member/avatar'
import { ensureVisible } from '@/lib/discord/color'


export default function Card({ member, role }: { member: User; role?: string }) {

	const accent = ensureVisible(member.hexAccentColor || '#db001d')
	const name = member.guild.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() || member.globalName || 'Unknown'
	const cardRef = useRef<HTMLDivElement>(null)
	const [tilt, setTilt] = useState({ x: 0, y: 0 })
	const [hovered, setHovered] = useState(false)

	const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
		const card = cardRef.current
		if (!card) return
		const rect = card.getBoundingClientRect()
		const cx = rect.left + rect.width / 2
		const cy = rect.top + rect.height / 2
		const dx = (e.clientX - cx) / (rect.width / 2)
		const dy = (e.clientY - cy) / (rect.height / 2)
		setTilt({ x: dy * -12, y: dx * 12 })
	}

	const handleMouseLeave = () => {
		setHovered(false)
		setTilt({ x: 0, y: 0 })
	}

	return (
		<Link
			href={`/milpacs/${member.username}`}
			style={{ textDecoration: 'none', color: 'inherit', display: 'flex', alignSelf: 'stretch', flexShrink: 0 }}
		>
			<div
				ref={cardRef}
				onMouseMove={handleMouseMove}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={handleMouseLeave}
				style={{
					width: 180,
					flex: 1,
					display: 'flex',
					flexDirection: 'column',
					overflow: 'hidden',
					background: `linear-gradient(160deg, ${accent}12 0%, rgb(13,13,13) 65%)`,
					border: `1px solid ${accent}30`,
					borderTop: `2px solid ${accent}`,
					transformStyle: 'preserve-3d',
					transform: hovered
						? `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.06)`
						: 'perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)',
					transition: hovered
						? 'transform 0.08s ease, box-shadow 0.2s ease'
						: 'transform 0.35s ease, box-shadow 0.35s ease',
					boxShadow: hovered
						? `0 8px 32px ${accent}40, 0 0 48px ${accent}28, 0 2px 8px rgba(0,0,0,0.6)`
						: `0 2px 8px rgba(0,0,0,0.4)`,
					willChange: 'transform',
					cursor: 'pointer',
				}}>

				{/* Avatar block — flex:1 absorbs extra height, keeping role pinned to bottom */}
				<div style={{
					flex: 1,
					padding: '22px 16px 16px',
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					gap: 14,
					background: `${accent}08`,
				}}>
					<div style={{
						position: 'relative',
						width: 76,
						height: 76,
						borderRadius: '50%',
						padding: 2,
						background: `linear-gradient(135deg, ${accent}99, rgba(237,237,237,0.08))`,
						flexShrink: 0,
					}}>
						<div style={{
							position: 'relative',
							width: '100%',
							height: '100%',
							borderRadius: '50%',
							overflow: 'hidden',
							background: 'rgb(13,13,13)',
						}}>
							<Avatar user={member} />
						</div>
					</div>

					<p style={{
						margin: 0,
						fontSize: '0.8rem',
						fontWeight: 700,
						letterSpacing: '0.1em',
						textTransform: 'uppercase',
						textAlign: 'center',
						color: 'rgba(237,237,237,0.92)',
						lineHeight: 1.3,
					}}>
						{name}
					</p>
				</div>

				{/* Divider + role pinned to bottom */}
				{role && <div style={{ height: 1, background: `${accent}20`, flexShrink: 0 }} />}
				{role && (
					<div style={{ padding: '10px 16px', flexShrink: 0 }}>
						<p style={{
							margin: 0,
							fontSize: '0.6rem',
							fontWeight: 600,
							letterSpacing: '0.18em',
							textTransform: 'uppercase',
							textAlign: 'center',
							color: 'rgba(237,237,237,0.38)',
						}}>
							{role}
						</p>
					</div>
				)}
			</div>
		</Link>
	)
}
