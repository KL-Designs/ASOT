'use client'

import { useRef, useState } from 'react'
import Image, { StaticImageData } from 'next/image'

import s from '@/styles/shell.module.css'

export function CallsignCard({ title, images, children }: { title: string, images: StaticImageData[], children: React.ReactNode }) {
	const cardRef = useRef<HTMLDivElement>(null)
	const [mouse, setMouse] = useState({ x: 50, y: 50, active: false })

	function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
		const card = cardRef.current
		if (!card) return
		const rect = card.getBoundingClientRect()
		setMouse({
			x: ((e.clientX - rect.left) / rect.width) * 100,
			y: ((e.clientY - rect.top) / rect.height) * 100,
			active: true,
		})
	}

	function handleMouseLeave() {
		setMouse(m => ({ ...m, active: false }))
	}

	// Project mouse position onto the 135° diagonal so the shine band
	// naturally tracks the cursor in the top-left → bottom-right direction
	const shinePos = (mouse.x + mouse.y) / 2

	return (
		<div
			ref={cardRef}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}
			className={s.cs}
			style={{ position: 'relative' }}
		>
			<div
				aria-hidden
				style={{
					position: 'absolute',
					inset: 0,
					pointerEvents: 'none',
					zIndex: 4,
					opacity: mouse.active ? 1 : 0,
					transition: 'opacity 0.4s ease',
					background: `linear-gradient(
						135deg,
						transparent ${shinePos - 30}%,
						rgba(255,255,255,0.04) ${shinePos - 10}%,
						rgba(255,255,255,0.09) ${shinePos}%,
						rgba(255,255,255,0.04) ${shinePos + 10}%,
						transparent ${shinePos + 30}%
					)`,
				}}
			/>

			<div className={s.csImg}>
				{images.map((img, i) => (
					<div key={i} className='relative flex-1 h-full'>
						<Image src={img} alt={title} fill className='object-cover' />
					</div>
				))}
				<span className={s.csTag}>{title.toUpperCase()}</span>
			</div>

			<div className={s.csBody}>
				{children}
			</div>
		</div>
	)
}
