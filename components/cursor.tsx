'use client'

import { useEffect, useRef, useState } from 'react'

export default function CustomCursor() {
	const dotRef = useRef<HTMLDivElement>(null)
	const ringRef = useRef<HTMLDivElement>(null)
	const mouse = useRef({ x: -200, y: -200 })
	const ringPos = useRef({ x: -200, y: -200 })
	const rotation = useRef(0)
	const [hovering, setHovering] = useState(false)
	const [visible, setVisible] = useState(false)
	const [isTouch, setIsTouch] = useState(false)
	const hoveringRef = useRef(false)

	useEffect(() => {
		if (window.matchMedia('(pointer: coarse)').matches) { setIsTouch(true); return }

		const onMove = (e: MouseEvent) => {
			mouse.current = { x: e.clientX, y: e.clientY }
			if (!visible) setVisible(true)

			const target = e.target as Element
			const clickable = !!target.closest('a, button, [role="button"], input, textarea, select, label')
			if (clickable !== hoveringRef.current) {
				hoveringRef.current = clickable
				setHovering(clickable)
			}
		}

		const onLeave = () => setVisible(false)
		const onEnter = () => setVisible(true)

		document.addEventListener('mousemove', onMove)
		document.addEventListener('mouseleave', onLeave)
		document.addEventListener('mouseenter', onEnter)

		let animId: number
		const animate = () => {
			// Dot tracks exactly
			if (dotRef.current) {
				dotRef.current.style.transform = `translate(calc(${mouse.current.x}px - 50%), calc(${mouse.current.y}px - 50%))`
			}

			// Ring lerps behind when idle, snaps to mouse on hover
			if (hoveringRef.current) {
				ringPos.current.x = mouse.current.x
				ringPos.current.y = mouse.current.y
			} else {
				ringPos.current.x += (mouse.current.x - ringPos.current.x) * 0.38
				ringPos.current.y += (mouse.current.y - ringPos.current.y) * 0.38
			}

			// No rotation — reticle stays square
			rotation.current = 0

			if (ringRef.current) {
				ringRef.current.style.transform = `translate(calc(${ringPos.current.x}px - 50%), calc(${ringPos.current.y}px - 50%)) rotate(${rotation.current}deg)`
			}

			animId = requestAnimationFrame(animate)
		}
		animate()

		return () => {
			document.removeEventListener('mousemove', onMove)
			document.removeEventListener('mouseleave', onLeave)
			document.removeEventListener('mouseenter', onEnter)
			cancelAnimationFrame(animId)
		}
	}, []) // eslint-disable-line react-hooks/exhaustive-deps

	if (isTouch) return null

	return (
		<>
			{/* Dot — always visible when cursor is on screen */}
			<div
				ref={dotRef}
				style={{
					position: 'fixed',
					top: 0,
					left: 0,
					width: 4,
					height: 4,
					borderRadius: '50%',
					background: '#fff',
					pointerEvents: 'none',
					zIndex: 99999,
					opacity: visible ? 1 : 0,
					transition: 'opacity 0.2s ease',
					willChange: 'transform',
				}}
			/>
			{/* Ring — circle default, tactical reticle on hover */}
			<div
				ref={ringRef}
				style={{
					position: 'fixed',
					top: 0,
					left: 0,
					width: hovering ? 32 : 24,
					height: hovering ? 32 : 24,
					borderRadius: hovering ? 0 : '50%',
					border: hovering ? 'none' : '1.5px solid rgba(237,237,237,0.65)',
					pointerEvents: 'none',
					zIndex: 99999,
					opacity: visible ? 1 : 0,
					transition: 'width 0.15s ease, height 0.15s ease, opacity 0.3s ease',
					willChange: 'transform',
				}}
			>
				{hovering && (() => {
					const c = 'rgba(237,237,237,0.9)'
					const b = `1.5px solid ${c}`
					const corner = 7
					return (
						<>
							{/* Corner brackets */}
							<span style={{ position: 'absolute', top: 0, left: 0, width: corner, height: corner, borderTop: b, borderLeft: b }} />
							<span style={{ position: 'absolute', top: 0, right: 0, width: corner, height: corner, borderTop: b, borderRight: b }} />
							<span style={{ position: 'absolute', bottom: 0, left: 0, width: corner, height: corner, borderBottom: b, borderLeft: b }} />
							<span style={{ position: 'absolute', bottom: 0, right: 0, width: corner, height: corner, borderBottom: b, borderRight: b }} />
							{/* Cardinal ticks with center gap */}
							<span style={{ position: 'absolute', top: '50%', left: '50%', width: 1.5, height: 6, background: c, transform: 'translate(-50%, calc(-100% - 2px))' }} />
							<span style={{ position: 'absolute', top: '50%', left: '50%', width: 1.5, height: 6, background: c, transform: 'translate(-50%, 2px)' }} />
							<span style={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 1.5, background: c, transform: 'translate(calc(-100% - 2px), -50%)' }} />
							<span style={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 1.5, background: c, transform: 'translate(2px, -50%)' }} />
						</>
					)
				})()}
			</div>
		</>
	)
}
