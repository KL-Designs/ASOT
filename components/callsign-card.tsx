'use client'

import { useRef, useState } from 'react'
import Image, { StaticImageData } from 'next/image'

export function CallsignCard({ title, images, children }: { title: string, images: StaticImageData[], children: React.ReactNode }) {
	const cardRef = useRef<HTMLDivElement>(null)
	const [tilt, setTilt] = useState({ x: 0, y: 0, active: false })

	function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
		const card = cardRef.current
		if (!card) return
		const rect = card.getBoundingClientRect()
		const dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)
		const dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)
		setTilt({ x: dy * -6, y: dx * 6, active: true })
	}

	function handleMouseLeave() {
		setTilt({ x: 0, y: 0, active: false })
	}

	return (
		<div
			ref={cardRef}
			onMouseMove={handleMouseMove}
			onMouseLeave={handleMouseLeave}
			className='flex flex-col h-full'
			style={{
				border: '1px solid rgba(255,255,255,0.07)',
				borderTop: '2px solid var(--red)',
				background: 'rgba(255,255,255,0.02)',
				transform: `perspective(900px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(${tilt.active ? 1.04 : 1})`,
				transition: tilt.active ? 'transform 0.08s ease-out' : 'transform 0.45s ease',
				willChange: 'transform',
				zIndex: tilt.active ? 10 : 'auto',
				position: 'relative',
			}}
		>
			<div className='relative w-full h-[220px] overflow-hidden flex'>
				{images.map((img, i) => (
					<div key={i} className='relative flex-1 h-full'>
						<Image src={img} alt={title} fill className='object-cover' />
					</div>
				))}
				<div className='absolute inset-0' style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.95) 0%, rgba(10,10,10,0.3) 50%, transparent 100%)' }} />
				<div className='absolute bottom-0 left-0 p-4'>
					<span style={{ fontWeight: 700, letterSpacing: '0.12em', fontSize: '1rem', textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}>
						{title.toUpperCase()}
					</span>
					<div style={{ height: 2, width: 32, background: 'var(--red)', marginTop: 4 }} />
				</div>
			</div>

			<div className='flex flex-col gap-2 p-5'>
				{children}
			</div>
		</div>
	)
}
