'use client'

import { useRef, useEffect } from 'react'

/**
 * Embers drifting up from the bottom edge.
 *
 * `style` is merged over the defaults so a caller can place the canvas in its
 * own stacking context. The `zIndex: 0` default only works when the embers sit
 * directly on a section background — put a veil or a scrim above them and they
 * disappear under it, which is not obvious from the fact that they are drawn
 * with `lighter` compositing.
 */
export default function FireEmbers({ style }: { style?: React.CSSProperties }) {
	const canvasRef = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		interface Ember {
			x: number; y: number
			vx: number; vy: number
			size: number; opacity: number
			life: number; decay: number
		}

		const embers: Ember[] = []
		let animId: number

		const resize = () => {
			canvas.width = canvas.offsetWidth
			canvas.height = canvas.offsetHeight
		}
		resize()
		window.addEventListener('resize', resize)

		const spawnEmber = () => {
			embers.push({
				x: Math.random() * canvas.width,
				y: canvas.height + 2,
				vx: (Math.random() - 0.5) * 0.4,
				vy: -(Math.random() * 0.55 + 0.2),
				size: Math.random() * 1.3 + 0.6,
				opacity: Math.random() * 0.45 + 0.55,
				life: 1,
				decay: Math.random() * 0.003 + 0.0015,
			})
		}

		let frame = 0
		const animate = () => {
			frame++
			ctx.clearRect(0, 0, canvas.width, canvas.height)

			if (frame % 3 === 0 && embers.length < 100) spawnEmber()

			for (let i = embers.length - 1; i >= 0; i--) {
				const e = embers[i]
				e.life -= e.decay
				if (e.life <= 0) { embers.splice(i, 1); continue }

				e.x += e.vx + Math.sin(frame * 0.02 + i * 0.7) * 0.25
				e.y += e.vy

				const alpha = e.life * e.opacity
				const hue = 8 + (1 - e.life) * 22

				// Glow
				ctx.save()
				ctx.globalCompositeOperation = 'lighter'
				ctx.globalAlpha = alpha * 0.5
				const glow = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.size * 3.5)
				glow.addColorStop(0, `hsl(${hue}, 100%, 55%)`)
				glow.addColorStop(1, 'transparent')
				ctx.fillStyle = glow
				ctx.beginPath()
				ctx.arc(e.x, e.y, e.size * 3.5, 0, Math.PI * 2)
				ctx.fill()
				ctx.restore()

				// Core
				ctx.save()
				ctx.globalCompositeOperation = 'lighter'
				ctx.globalAlpha = alpha * 0.9
				ctx.beginPath()
				ctx.arc(e.x, e.y, e.size, 0, Math.PI * 2)
				ctx.fillStyle = `hsl(${hue + 15}, 100%, 75%)`
				ctx.fill()
				ctx.restore()
			}

			animId = requestAnimationFrame(animate)
		}

		animate()
		return () => {
			cancelAnimationFrame(animId)
			window.removeEventListener('resize', resize)
		}
	}, [])

	return (
		<canvas
			ref={canvasRef}
			style={{
				position: 'absolute',
				bottom: 0,
				left: 0,
				width: '100%',
				height: 520,
				pointerEvents: 'none',
				zIndex: 0,
				...style,
			}}
		/>
	)
}
