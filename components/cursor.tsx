'use client'

import { useEffect, useRef, useState } from 'react'

export default function CustomCursor() {
	const dotRef = useRef<HTMLDivElement>(null)
	const ringRef = useRef<HTMLDivElement>(null)
	const cornersRef = useRef<HTMLDivElement>(null)
	const hoveringRef = useRef(false)
	const visibleRef = useRef(false)
	const prevTargetRef = useRef<Element | null>(null)
	const [isTouch, setIsTouch] = useState(false)

	useEffect(() => {
		if (window.matchMedia('(pointer: coarse)').matches) { setIsTouch(true); return }

		const dot = dotRef.current
		const ring = ringRef.current
		const corners = cornersRef.current
		if (!dot || !ring || !corners) return

		const updateVisibility = () => {
			const suppressed = document.body.classList.contains('suppress-custom-cursor')
			const v = visibleRef.current && !suppressed
			dot.style.opacity = v ? '1' : '0'
			ring.style.opacity = v ? '1' : '0'
		}

		const setHovering = (on: boolean) => {
			hoveringRef.current = on
			ring.style.borderRadius = on ? '0' : '50%'
			ring.style.borderColor = on ? 'transparent' : '#fff'
			corners.style.opacity = on ? '1' : '0'
			// Remove transform trail on hover so ring snaps; restore it on leave
			// Order matches: transform, border-radius, border-color, opacity
			ring.style.transitionDuration = on ? '0s, 0.15s, 0.15s, 0.3s' : '60ms, 0.15s, 0.15s, 0.3s'
		}

		// MutationObserver handles suppress-class changes without polling in rAF
		const observer = new MutationObserver(updateVisibility)
		observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })

		const onMove = (e: MouseEvent) => {
			const t = `translate(calc(${e.clientX}px - 50%), calc(${e.clientY}px - 50%))`
			dot.style.transform = t
			ring.style.transform = t

			if (!visibleRef.current) {
				visibleRef.current = true
				updateVisibility()
			}

			const target = e.target as Element
			if (target !== prevTargetRef.current) {
				prevTargetRef.current = target
				const clickable = !!target.closest('a, button, [role="button"], input, textarea, select, label')
				if (clickable !== hoveringRef.current) setHovering(clickable)
			}
		}

		const onLeave = () => { visibleRef.current = false; updateVisibility() }
		const onEnter = () => { visibleRef.current = true; updateVisibility() }

		document.addEventListener('mousemove', onMove, { passive: true })
		document.addEventListener('mouseleave', onLeave)
		document.addEventListener('mouseenter', onEnter)

		return () => {
			document.removeEventListener('mousemove', onMove)
			document.removeEventListener('mouseleave', onLeave)
			document.removeEventListener('mouseenter', onEnter)
			observer.disconnect()
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
					opacity: 0, willChange: 'transform',
					boxShadow: '0 0 0 1.5px rgba(0,0,0,0.5)',
					transition: 'opacity 0.2s ease',
				}}
			/>
			<div
				ref={ringRef}
				style={{
					position: 'fixed', top: 0, left: 0,
					width: 32, height: 32, borderRadius: '50%',
					border: '1.5px solid #fff',
					pointerEvents: 'none', zIndex: 99999,
					opacity: 0, willChange: 'transform',
					// transform trails 60ms on the compositor thread (main-thread-independent)
					// hover snaps it to 0s via transitionDuration override in setHovering()
					transition: 'transform 30ms linear, border-radius 0.15s ease, border-color 0.15s ease, opacity 0.3s ease',
				}}
			>
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
