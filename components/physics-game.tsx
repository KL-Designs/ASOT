'use client'

import { useRef, useEffect } from 'react'

export default function PhysicsGame({ onActivate, onGameOver, onRestart }: {
	onActivate: () => void
	onGameOver?: (score: number, collectScore: number) => void
	onRestart?: () => void
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const onGameOverRef = useRef(onGameOver)
	const onRestartRef = useRef(onRestart)

	useEffect(() => { onGameOverRef.current = onGameOver }, [onGameOver])
	useEffect(() => { onRestartRef.current = onRestart }, [onRestart])

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		const TRI      = 26
		const GRAVITY  = 0.06
		const THRUST   = 0.13
		const MAX_UP   = -2.0
		const MAX_DOWN = 2.5

		interface Asteroid {
			x: number; y: number
			radius: number
			verts: { a: number; r: number }[]
			rotation: number
			rotSpeed: number
			speed: number
		}
		interface Gem { x: number; y: number; size: number; speed: number }

		const state = {
			active: false,
			dead: false,
			deadTimer: 0,
			deathReported: false,
			x: 0, y: 0,
			vy: 0,
			thrusting: false,
			hintTimer: 0,
			countdown: -1,
			countdownTimer: 0,
			asteroids: [] as Asteroid[],
			spawnTimer: 130,
			spawnInterval: 190,
			obsSpeed: 1.6,
			score: 0,
			collectScore: 0,
			gems: [] as Gem[],
			gemTimer: 130,
		}

		const makeAsteroid = (): Asteroid => {
			const numV   = 6 + Math.floor(Math.random() * 5)   // 6–10 sides
			const radius = 16 + Math.random() * 54              // 16–70 px
			const verts  = Array.from({ length: numV }, (_, i) => ({
				a: (i / numV) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI / numV) * 1.2,
				r: radius * (0.55 + Math.random() * 0.55),
			}))
			return {
				x:        canvas.width + radius + 10,
				y:        radius + 20 + Math.random() * (canvas.height - radius * 2 - 40),
				radius,
				verts,
				rotation: Math.random() * Math.PI * 2,
				rotSpeed: (Math.random() - 0.5) * 0.016,
				speed:    state.obsSpeed * (0.65 + Math.random() * 0.7),
			}
		}

		const reset = () => {
			state.x            = canvas.width * 0.18
			state.y            = canvas.height * 0.5 - TRI / 2
			state.vy           = 0
			state.thrusting    = false
			state.asteroids    = []
			state.spawnTimer   = 130
			state.spawnInterval = 190
			state.obsSpeed     = 1.6
			state.score        = 0
			state.collectScore = 0
			state.gems         = []
			state.gemTimer     = 130
			state.dead         = false
			state.deadTimer    = 0
			state.deathReported = false
			state.hintTimer    = 230
			state.countdown    = 3
			state.countdownTimer = 90
		}

		const resize = () => {
			canvas.width  = canvas.offsetWidth
			canvas.height = canvas.offsetHeight
		}
		resize()
		window.addEventListener('resize', resize)

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') {
				e.preventDefault()
				if (!state.active) { state.active = true; reset(); onActivate(); return }
				if (state.dead && state.deadTimer <= 0) { reset(); onRestartRef.current?.(); return }
				if (state.countdown < 0) state.thrusting = true
			}
		}
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.code === 'Space' || e.code === 'KeyW' || e.code === 'ArrowUp') state.thrusting = false
		}
		window.addEventListener('keydown', onKeyDown)
		window.addEventListener('keyup', onKeyUp)

		let animId: number
		let frame = 0

		const die = () => {
			if (state.dead) return
			state.y     = Math.max(0, Math.min(canvas.height - TRI, state.y))
			state.dead  = true
			state.deadTimer = 80
			if (!state.deathReported) {
				state.deathReported = true
				onGameOverRef.current?.(state.score, state.collectScore)
			}
		}

		const drawTri = (cx: number, cy: number, size: number, tilt: number, stroke: string, fill: string) => {
			ctx.save()
			ctx.translate(cx, cy)
			ctx.rotate(tilt)
			ctx.beginPath()
			ctx.moveTo( size / 2,  0)
			ctx.lineTo(-size / 2, -size / 2)
			ctx.lineTo(-size / 2,  size / 2)
			ctx.closePath()
			ctx.strokeStyle = stroke
			ctx.lineWidth   = 1.5
			ctx.stroke()
			ctx.fillStyle = fill
			ctx.fill()
			ctx.restore()
		}

		const drawAsteroid = (ast: Asteroid, alpha = 1) => {
			ctx.save()
			ctx.globalAlpha = alpha
			ctx.translate(ast.x, ast.y)
			ctx.rotate(ast.rotation)
			ctx.beginPath()
			ast.verts.forEach((v, i) => {
				const px = Math.cos(v.a) * v.r
				const py = Math.sin(v.a) * v.r
				i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
			})
			ctx.closePath()
			ctx.strokeStyle = 'rgba(219,0,29,0.8)'
			ctx.lineWidth   = 1.5
			ctx.stroke()
			ctx.fillStyle   = 'rgba(219,0,29,0.06)'
			ctx.fill()
			ctx.restore()
		}

		const animate = () => {
			frame++
			ctx.clearRect(0, 0, canvas.width, canvas.height)
			if (!state.active) { animId = requestAnimationFrame(animate); return }

			const cx   = state.x + TRI / 2
			const cy   = state.y + TRI / 2
			const tilt = Math.atan2(state.vy, 6) * 0.85

			// ── Countdown ────────────────────────────────────────────
			if (state.countdown >= 0) {
				state.countdownTimer--
				if (state.countdownTimer <= 0) {
					if (state.countdown === 0) {
						state.countdown = -1   // done — game starts next frame
					} else {
						state.countdown--
						state.countdownTimer = state.countdown === 0 ? 65 : 90
					}
				}

				// Ship hovering in place
				drawTri(cx, cy, TRI, 0, 'rgba(237,237,237,0.88)', 'rgba(237,237,237,0.08)')

				// Number shrinks slightly as each beat elapses (1.3 → 1.0)
				const stepFrames = state.countdown === 0 ? 65 : 90
				const progress   = state.countdownTimer / stepFrames   // 1 → 0
				const fontSize   = Math.round((state.countdown === 0 ? 62 : 80) * (1.0 + progress * 0.28))
				const label      = state.countdown > 0 ? String(state.countdown) : 'GO!'
				const fadeAlpha  = state.countdown === 0 ? Math.min(1, state.countdownTimer / 18) : 1

				ctx.save()
				ctx.globalAlpha  = fadeAlpha
				ctx.fillStyle    = state.countdown === 0 ? 'rgba(255,255,255,0.95)' : 'rgba(237,237,237,0.88)'
				ctx.font         = `700 ${fontSize}px monospace`
				ctx.textAlign    = 'center'
				ctx.textBaseline = 'middle'
				ctx.fillText(label, canvas.width / 2, canvas.height / 2)
				ctx.restore()

				animId = requestAnimationFrame(animate); return
			}

			if (!state.dead) {
				// ── Physics ──────────────────────────────────────────
				state.vy += GRAVITY
				if (state.thrusting) state.vy -= THRUST + GRAVITY
				state.vy = Math.max(MAX_UP, Math.min(MAX_DOWN, state.vy))
				state.y += state.vy
				if (state.y < 0 || state.y + TRI > canvas.height) die()

				// ── Asteroids ─────────────────────────────────────────
				state.spawnTimer--
				if (state.spawnTimer <= 0 && state.asteroids.length < 8) {
					state.asteroids.push(makeAsteroid())
					state.spawnTimer    = Math.floor(state.spawnInterval * (0.55 + Math.random() * 0.9))
					state.obsSpeed      = Math.min(4.2, state.obsSpeed + 0.04)
					state.spawnInterval = Math.max(85, state.spawnInterval - 2)
				}
				for (let i = state.asteroids.length - 1; i >= 0; i--) {
					const ast = state.asteroids[i]
					ast.x        -= ast.speed
					ast.rotation += ast.rotSpeed
					if (ast.x + ast.radius < 0) { state.asteroids.splice(i, 1); state.score++ }
				}

				// ── Gems ──────────────────────────────────────────────
				state.gemTimer--
				if (state.gemTimer <= 0) {
					state.gems.push({
						x:     canvas.width + 10,
						y:     canvas.height * (0.12 + Math.random() * 0.76),
						size:  9,
						speed: state.obsSpeed * 0.85,
					})
					state.gemTimer = Math.floor(130 * (0.5 + Math.random() * 1.0))
				}
				for (let i = state.gems.length - 1; i >= 0; i--) {
					state.gems[i].x -= state.gems[i].speed
					if (state.gems[i].x < -20) state.gems.splice(i, 1)
				}

				// ── Collision (circle–circle) ──────────────────────────
				const shipR = TRI / 3.8
				for (const ast of state.asteroids) {
					if (Math.hypot(cx - ast.x, cy - ast.y) < shipR + ast.radius * 0.70) die()
				}

				// ── Gem collection ────────────────────────────────────
				for (let i = state.gems.length - 1; i >= 0; i--) {
					const g = state.gems[i]
					if (Math.hypot(cx - g.x, cy - g.y) < g.size + TRI / 2.5) {
						state.gems.splice(i, 1)
						state.collectScore++
					}
				}

				// ── Draw asteroids ────────────────────────────────────
				for (const ast of state.asteroids) drawAsteroid(ast)

				// ── Draw gems ─────────────────────────────────────────
				for (const g of state.gems) {
					ctx.save()
					ctx.translate(g.x, g.y)
					ctx.rotate(Math.PI / 4 + frame * 0.022)
					ctx.strokeStyle = 'rgba(255,210,0,0.95)'
					ctx.lineWidth   = 1.5
					ctx.strokeRect(-g.size, -g.size, g.size * 2, g.size * 2)
					ctx.fillStyle   = 'rgba(255,210,0,0.2)'
					ctx.fillRect(-g.size, -g.size, g.size * 2, g.size * 2)
					ctx.restore()
				}

				// ── Thruster flame ────────────────────────────────────
				{
					const showFlame = state.thrusting || Math.random() < 0.15
					if (showFlame) {
						const fl = state.thrusting ? 6 + Math.random() * 10 : 2 + Math.random() * 4
						ctx.save()
						ctx.translate(cx, cy)
						ctx.rotate(tilt)
						ctx.beginPath()
						ctx.moveTo(-TRI / 2, -TRI * 0.22)
						ctx.lineTo(-TRI / 2 - fl, 0)
						ctx.lineTo(-TRI / 2,  TRI * 0.22)
						ctx.closePath()
						ctx.fillStyle = state.thrusting
							? `rgba(255,${100 + Math.floor(Math.random() * 80)},0,0.78)`
							: 'rgba(255,160,0,0.35)'
						ctx.fill()
						ctx.restore()
					}
				}

				// ── Draw player ───────────────────────────────────────
				drawTri(cx, cy, TRI, tilt, 'rgba(237,237,237,0.88)', 'rgba(237,237,237,0.08)')

				// ── HUD ───────────────────────────────────────────────
				ctx.save()
				ctx.fillStyle = 'rgba(237,237,237,0.3)'
				ctx.font = '600 14px monospace'
				ctx.textAlign = 'left'
				ctx.fillText(`SCORE  ${state.score}`, 14, 22)
				ctx.restore()

				ctx.save()
				ctx.fillStyle = 'rgba(255,210,0,0.55)'
				ctx.font = '600 14px monospace'
				ctx.textAlign = 'center'
				ctx.fillText(`◆  ${state.collectScore}`, canvas.width / 2, canvas.height - 10)
				ctx.restore()

				// ── Hint ──────────────────────────────────────────────
				if (state.hintTimer > 0) {
					state.hintTimer--
					const alpha = Math.min(1, state.hintTimer / 40) * 0.55
					ctx.save()
					ctx.globalAlpha = alpha
					ctx.fillStyle   = '#fff'
					ctx.font        = '600 11px monospace'
					ctx.textAlign   = 'center'
					ctx.fillText('HOLD W / SPACE / ↑  TO FLY', canvas.width / 2, canvas.height * 0.72)
					ctx.restore()
				}

			} else {
				// ── Dead state ────────────────────────────────────────
				if (state.deadTimer > 0) state.deadTimer--

				for (const ast of state.asteroids) drawAsteroid(ast, 0.3)

				if (Math.floor(frame / 5) % 2 === 0) {
					drawTri(cx, cy, TRI, tilt, 'rgba(219,0,29,0.9)', 'rgba(219,0,29,0.2)')
				}

				if (state.deadTimer <= 0) {
					ctx.save()
					ctx.textAlign = 'center'
					ctx.fillStyle = 'rgba(237,237,237,0.8)'
					ctx.font      = '700 22px monospace'
					ctx.fillText(`SCORE  ${state.score}  ◆  ${state.collectScore}`, canvas.width / 2, canvas.height / 2 - 16)
					ctx.fillStyle = 'rgba(237,237,237,0.4)'
					ctx.font      = '600 16px monospace'
					ctx.fillText('SPACE TO RESTART', canvas.width / 2, canvas.height / 2 + 10)
					ctx.restore()
				}
			}

			animId = requestAnimationFrame(animate)
		}
		animate()

		return () => {
			cancelAnimationFrame(animId)
			window.removeEventListener('keydown', onKeyDown)
			window.removeEventListener('keyup', onKeyUp)
			window.removeEventListener('resize', resize)
		}
	}, []) // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<canvas
			ref={canvasRef}
			style={{
				position: 'absolute',
				inset: 0,
				width: '100%',
				height: '100%',
				pointerEvents: 'none',
				zIndex: 2,
			}}
		/>
	)
}
