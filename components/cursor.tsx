'use client'

import { useEffect, useRef, useState } from 'react'

export default function CustomCursor() {
	const dotRef = useRef<HTMLDivElement>(null)
	const ringRef = useRef<HTMLDivElement>(null)
	const cornersRef = useRef<HTMLDivElement>(null)
	const mouse = useRef({ x: -200, y: -200 })
	const ringPos = useRef({ x: -200, y: -200 })
	const hoveringRef = useRef(false)
	const visibleRef = useRef(false)
	const [isTouch, setIsTouch] = useState(false)

	useEffect(() => {
		if (window.matchMedia('(pointer: coarse)').matches) { setIsTouch(true); return }

		const dot = dotRef.current
		const ring = ringRef.current
		const corners = cornersRef.current
		if (!dot || !ring || !corners) return


		const setHovering = (on: boolean) => {
			ring.style.width = on ? '32px' : '24px'
			ring.style.height = on ? '32px' : '24px'
			ring.style.borderRadius = on ? '0' : '50%'
			ring.style.border = on ? 'none' : '1.5px solid #fff'
			corners.style.opacity = on ? '1' : '0'
		}

		const setVisible = (on: boolean) => {
			dot.style.opacity = on ? '1' : '0'
			ring.style.opacity = on ? '1' : '0'
		}

		let suppressed = false

		const onMove = (e: MouseEvent) => {
			mouse.current = { x: e.clientX, y: e.clientY }

			// Update dot position immediately on every input event rather than
			// waiting for the next rAF tick — keeps the dot tracking even when
			// the frame rate drops (e.g. during a heavy JS parse on page load).
			if (!suppressed) {
				dot.style.transform = `translate(calc(${e.clientX}px - 50%), calc(${e.clientY}px - 50%))`
			}

			if (!visibleRef.current) {
				visibleRef.current = true
				setVisible(true)
			}

			const target = e.target as Element
			const clickable = !!target.closest('a, button, [role="button"], input, textarea, select, label')
			if (clickable !== hoveringRef.current) {
				hoveringRef.current = clickable
				setHovering(clickable)
			}
		}

		const onLeave = () => { visibleRef.current = false; setVisible(false) }
		const onEnter = () => { visibleRef.current = true; setVisible(true) }

		document.addEventListener('mousemove', onMove, { passive: true })
		document.addEventListener('mouseleave', onLeave)
		document.addEventListener('mouseenter', onEnter)

		let animId: number
		const animate = () => {
			const shouldSuppress = document.body.classList.contains('suppress-custom-cursor')
			if (shouldSuppress !== suppressed) {
				suppressed = shouldSuppress
				dot.style.opacity = suppressed ? '0' : (visibleRef.current ? '1' : '0')
				ring.style.opacity = suppressed ? '0' : (visibleRef.current ? '1' : '0')
			}
			if (!suppressed) {
				// Dot position is handled in onMove — rAF only drives the ring lerp
				if (hoveringRef.current) {
					ringPos.current.x = mouse.current.x
					ringPos.current.y = mouse.current.y
				} else {
					ringPos.current.x += (mouse.current.x - ringPos.current.x) * 0.38
					ringPos.current.y += (mouse.current.y - ringPos.current.y) * 0.38
				}
				ring.style.transform = `translate(calc(${ringPos.current.x}px - 50%), calc(${ringPos.current.y}px - 50%))`
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
	}, [])

	if (isTouch) return null

	const c = '#fff'
	const b = `1.5px solid ${c}`
	const corner = 7

	return (
		<div id='custom-cursor'>
			<div
				ref={dotRef}
				style={{
					position: 'fixed', top: 0, left: 0,
					width: 4, height: 4, borderRadius: '50%',
					background: '#fff', pointerEvents: 'none', zIndex: 99999,
					opacity: 0, transition: 'opacity 0.2s ease', willChange: 'transform',
					mixBlendMode: 'difference',
				}}
			/>
			<div
				ref={ringRef}
				style={{
					position: 'fixed', top: 0, left: 0,
					width: 24, height: 24, borderRadius: '50%',
					border: '1.5px solid #fff',
					pointerEvents: 'none', zIndex: 99999,
					opacity: 0,
					transition: 'width 0.15s ease, height 0.15s ease, opacity 0.3s ease',
					willChange: 'transform',
					mixBlendMode: 'difference',
				}}
			>
				{/* Corner brackets — always in DOM, shown/hidden via opacity on cornersRef */}
				<div ref={cornersRef} style={{ opacity: 0, transition: 'opacity 0.1s ease' }}>
					<span style={{ position: 'absolute', top: 0, left: 0, width: corner, height: corner, borderTop: b, borderLeft: b }} />
					<span style={{ position: 'absolute', top: 0, right: 0, width: corner, height: corner, borderTop: b, borderRight: b }} />
					<span style={{ position: 'absolute', bottom: 0, left: 0, width: corner, height: corner, borderBottom: b, borderLeft: b }} />
					<span style={{ position: 'absolute', bottom: 0, right: 0, width: corner, height: corner, borderBottom: b, borderRight: b }} />
					<span style={{ position: 'absolute', top: '50%', left: '50%', width: 1.5, height: 6, background: c, transform: 'translate(-50%, calc(-100% - 2px))' }} />
					<span style={{ position: 'absolute', top: '50%', left: '50%', width: 1.5, height: 6, background: c, transform: 'translate(-50%, 2px)' }} />
					<span style={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 1.5, background: c, transform: 'translate(calc(-100% - 2px), -50%)' }} />
					<span style={{ position: 'absolute', top: '50%', left: '50%', width: 6, height: 1.5, background: c, transform: 'translate(2px, -50%)' }} />
				</div>
			</div>
		</div>
	)
}
