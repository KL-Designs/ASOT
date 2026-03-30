'use client'

import { useRef, useEffect } from 'react'

export default function PhysicsGame({ onActivate, onGameOver, onRestart }: {
	onActivate: () => void
	onGameOver?: (score: number, collectScore: number) => void
	onRestart?: () => void
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const onGameOverRef = useRef(onGameOver)
	const onRestartRef  = useRef(onRestart)

	useEffect(() => { onGameOverRef.current = onGameOver }, [onGameOver])
	useEffect(() => { onRestartRef.current  = onRestart  }, [onRestart])

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		const TRI        = 26
		const GRAVITY    = 0.30
		const THRUST     = 0.62
		const MAX_UP     = -10.0
		const MAX_DOWN   = 13.0
		const MAGNET_MS    = 20_000   // magnet lasts 15 real seconds
		const SLOW_MS      = 10_000   // slow time lasts 10 real seconds
		const SHIELD_MS    = 10_000   // shield lasts 10 real seconds
		const AUTOPILOT_MS = 15_000    // autopilot lasts 8 real seconds
		const POWERUP_R  = 22       // visual + collection radius

		// ── Rounded-rect helper ───────────────────────────────────────
		const rRect = (x: number, y: number, w: number, h: number, r: number) => {
			ctx.beginPath()
			ctx.moveTo(x + r, y)
			ctx.lineTo(x + w - r, y)
			ctx.quadraticCurveTo(x + w, y,     x + w, y + r)
			ctx.lineTo(x + w, y + h - r)
			ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
			ctx.lineTo(x + r, y + h)
			ctx.quadraticCurveTo(x, y + h,     x, y + h - r)
			ctx.lineTo(x, y + r)
			ctx.quadraticCurveTo(x, y,         x + r, y)
			ctx.closePath()
		}

		// ── Space background (persists across rounds) ──────────────────
		interface Star { x: number; y: number; size: number; speed: number; alpha: number; phase: number }
		interface ShootingStar { x: number; y: number; vx: number; vy: number; length: number; life: number; maxLife: number }

		let bgAlpha           = 0
		let shootingStarTimer = 180

		const starField:     Star[]         = []
		const shootingStars: ShootingStar[] = []

		const initStars = () => {
			starField.length = 0
			for (let i = 0; i < 110; i++) starField.push({
				x: Math.random() * canvas.width,  y: Math.random() * canvas.height,
				size: 0.6 + Math.random() * 0.5,  speed: 0.12 + Math.random() * 0.22,
				alpha: 0.2 + Math.random() * 0.5, phase: Math.random() * Math.PI * 2,
			})
			for (let i = 0; i < 55; i++) starField.push({
				x: Math.random() * canvas.width,   y: Math.random() * canvas.height,
				size: 1.0 + Math.random() * 0.8,   speed: 0.35 + Math.random() * 0.45,
				alpha: 0.35 + Math.random() * 0.45, phase: Math.random() * Math.PI * 2,
			})
			for (let i = 0; i < 28; i++) starField.push({
				x: Math.random() * canvas.width,  y: Math.random() * canvas.height,
				size: 1.6 + Math.random() * 1.2,  speed: 0.8 + Math.random() * 1.1,
				alpha: 0.5 + Math.random() * 0.45, phase: Math.random() * Math.PI * 2,
			})
		}
		initStars()

		const spawnShootingStar = () => {
			const speed = 11 + Math.random() * 9
			const angle = 0.06 + Math.random() * 0.12
			shootingStars.push({
				x: canvas.width + 80, y: Math.random() * canvas.height * 0.85,
				vx: -speed, vy: speed * Math.tan(angle),
				length: 55 + Math.random() * 90,
				life: 0, maxLife: 45 + Math.floor(Math.random() * 25),
			})
		}

		// ── Game state ─────────────────────────────────────────────────
		interface Asteroid {
			x: number; y: number
			radius: number
			verts: { a: number; r: number }[]
			rotation: number; rotSpeed: number; speed: number
		}
		interface Gem    { x: number; y: number; size: number; speed: number; rare: boolean; superRare: boolean; rainbow: boolean }
		interface Powerup { x: number; y: number; type: 'magnet' | 'slowtime' | 'shield' | 'gemshower' | 'nuke' | 'autopilot'; speed: number }
		interface Debris  { x: number; y: number; verts: [number,number][]; rotation: number; rotSpeed: number; speed: number; scale: number; radius: number }

		// Right-angle polygon shapes (normalised, centered near origin)
		const DEBRIS_SHAPES: [number,number][][] = [
			// L-shape
			[[-1,-1],[0,-1],[0,0],[1,0],[1,1],[-1,1]],
			// T-shape
			[[-1,-1],[1,-1],[1,0],[0.35,0],[0.35,1],[-0.35,1],[-0.35,0],[-1,0]],
			// Plus / cross
			[[-0.35,-1],[0.35,-1],[0.35,-0.35],[1,-0.35],[1,0.35],[0.35,0.35],[0.35,1],[-0.35,1],[-0.35,0.35],[-1,0.35],[-1,-0.35],[-0.35,-0.35]],
			// S-shape
			[[-1,0],[-1,-1],[0.35,-1],[0.35,0],[1,0],[1,1],[-0.35,1],[-0.35,0]],
			// C-shape
			[[0,-1],[1,-1],[1,-0.35],[0.35,-0.35],[0.35,0.35],[1,0.35],[1,1],[0,1],[-0.5,1],[-0.5,-1]],
			// Stepped
			[[-1,-1],[0,-1],[0,0],[1,0],[1,1],[0,1],[0,0],[-1,0]],
		]

		const state = {
			active: false,
			dead: false, deadTimer: 0, deathReported: false,
			x: 0, y: 0, vy: 0, thrusting: false,
			hintTimer: 0,
			countdown: -1, countdownTimer: 0,
			asteroids:     [] as Asteroid[],
			spawnTimer:    60, spawnInterval: 100, obsSpeed: 1.6,
			score: 0, collectScore: 0,
			gems:          [] as Gem[],
			gemTimer:      130,
			powerups:      [] as Powerup[],
			powerupTimer:  280,
			debris:        [] as Debris[],
			debrisTimer:   100,
			magnetEnd:     0,   // performance.now() expiry, 0 = inactive
			slowTimeEnd:   0,
			shieldEnd:     0,
			autopilotEnd:   0,
			gemShowerEnd:   0,
		}

		const makeAsteroid = (): Asteroid => {
			const numV   = 6 + Math.floor(Math.random() * 5)
			const radius = 16 + Math.random() * 54
			const verts  = Array.from({ length: numV }, (_, i) => ({
				a: (i / numV) * Math.PI * 2 + (Math.random() - 0.5) * (Math.PI / numV) * 1.2,
				r: radius * (0.55 + Math.random() * 0.55),
			}))
			return {
				x: canvas.width + radius + 10,
				y: radius + 20 + Math.random() * (canvas.height - radius * 2 - 40),
				radius, verts,
				rotation: Math.random() * Math.PI * 2,
				rotSpeed: (Math.random() - 0.5) * 0.016,
				speed:    state.obsSpeed * (0.65 + Math.random() * 0.7),
			}
		}

		const makeDebris = (): Debris => {
			const shape = DEBRIS_SHAPES[Math.floor(Math.random() * DEBRIS_SHAPES.length)]
			const scale = 10 + Math.random() * 22
			const radius = scale * 1.35
			return {
				x:        canvas.width + radius + 10,
				y:        radius + 20 + Math.random() * (canvas.height - radius * 2 - 40),
				verts:    shape,
				rotation: Math.random() * Math.PI * 2,
				rotSpeed: (Math.random() - 0.5) * 0.025,
				speed:    state.obsSpeed * (0.55 + Math.random() * 0.8),
				scale, radius,
			}
		}

		const drawDebris = (d: Debris) => {
			ctx.save()
			ctx.translate(d.x, d.y)
			ctx.rotate(d.rotation)
			ctx.beginPath()
			d.verts.forEach(([vx, vy], i) => {
				const px = vx * d.scale, py = vy * d.scale
				i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)
			})
			ctx.closePath()
			ctx.strokeStyle = 'rgba(160,200,230,0.80)'
			ctx.lineWidth   = 1.5
			ctx.stroke()
			ctx.fillStyle   = 'rgba(160,200,230,0.05)'
			ctx.fill()
			ctx.restore()
		}


		const makePowerup = (): Powerup => ({
			x:     canvas.width + 30,
			y:     canvas.height * (0.1 + Math.random() * 0.8),
			type:  (['magnet', 'slowtime', 'shield', 'gemshower', 'nuke', 'autopilot'] as const)[Math.floor(Math.random() * 6)],
			speed: state.obsSpeed * 0.75,
		})

		const reset = () => {
			state.x             = canvas.width * 0.18
			state.y             = canvas.height * 0.5 - TRI / 2
			state.vy            = 0
			state.thrusting     = false
			state.asteroids     = []
			state.spawnTimer    = 130
			state.spawnInterval = 100
			state.obsSpeed      = 7.5
			state.score         = 0
			state.collectScore  = 0
			state.gems          = []
			state.gemTimer      = 130
			state.powerups      = []
			state.powerupTimer  = 280
			state.debris        = []
			state.debrisTimer   = 100
			state.magnetEnd     = 0
			state.slowTimeEnd   = 0
			state.shieldEnd     = 0
			state.autopilotEnd  = 0
			state.gemShowerEnd  = 0
			state.dead          = false
			state.deadTimer     = 0
			state.deathReported = false
			state.hintTimer     = 230
			state.countdown     = 3
			state.countdownTimer = 45
		}

		const resize = () => {
			canvas.width  = canvas.offsetWidth
			canvas.height = canvas.offsetHeight
			initStars()
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
		window.addEventListener('keyup',   onKeyUp)

		let animId:   number
		let frame   = 0
		let lastTime = 0   // rAF timestamp of previous frame

		const die = () => {
			if (state.dead) return
			state.y         = Math.max(0, Math.min(canvas.height - TRI, state.y))
			state.dead      = true
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
			ctx.fillStyle   = fill
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

		const drawPowerup = (p: Powerup) => {
			const r     = POWERUP_R
			const pulse = 1 + Math.sin(frame * 0.07) * 0.1

			ctx.save()
			ctx.translate(p.x, p.y)
			ctx.scale(pulse, pulse)

			if (p.type === 'magnet') {
				const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2)
				grd.addColorStop(0, 'rgba(0,220,255,0.22)')
				grd.addColorStop(1, 'rgba(0,220,255,0)')
				ctx.fillStyle = grd
				ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill()

				ctx.strokeStyle = 'rgba(0,220,255,0.85)'
				ctx.lineWidth   = 2
				ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()

				ctx.lineWidth   = 3.5
				ctx.lineCap     = 'round'
				ctx.strokeStyle = 'rgba(0,220,255,0.95)'
				ctx.beginPath(); ctx.arc(0, r * 0.08, r * 0.50, Math.PI, 0, false); ctx.stroke()

				ctx.strokeStyle = 'rgba(255,90,90,1)'
				ctx.beginPath()
				ctx.moveTo(-r * 0.50, r * 0.08); ctx.lineTo(-r * 0.50, -r * 0.50)
				ctx.stroke()
				ctx.fillStyle = 'rgba(255,90,90,1)'
				ctx.fillRect(-r * 0.50 - 4, -r * 0.50 - 5, 8, 5)

				ctx.strokeStyle = 'rgba(80,160,255,1)'
				ctx.beginPath()
				ctx.moveTo(r * 0.50, r * 0.08); ctx.lineTo(r * 0.50, -r * 0.50)
				ctx.stroke()
				ctx.fillStyle = 'rgba(80,160,255,1)'
				ctx.fillRect(r * 0.50 - 4, -r * 0.50 - 5, 8, 5)

			} else if (p.type === 'slowtime') {
				const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2)
				grd.addColorStop(0, 'rgba(160,0,255,0.22)')
				grd.addColorStop(1, 'rgba(160,0,255,0)')
				ctx.fillStyle = grd
				ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill()

				ctx.strokeStyle = 'rgba(180,60,255,0.85)'
				ctx.lineWidth   = 2
				ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()

				ctx.strokeStyle = 'rgba(200,120,255,0.75)'
				ctx.lineWidth   = 1.5
				ctx.beginPath(); ctx.arc(0, 0, r * 0.60, 0, Math.PI * 2); ctx.stroke()

				ctx.strokeStyle = 'rgba(200,120,255,0.65)'
				ctx.lineWidth   = 1.5
				for (let t = 0; t < 4; t++) {
					const a = (t / 4) * Math.PI * 2
					ctx.beginPath()
					ctx.moveTo(Math.cos(a) * r * 0.46, Math.sin(a) * r * 0.46)
					ctx.lineTo(Math.cos(a) * r * 0.60, Math.sin(a) * r * 0.60)
					ctx.stroke()
				}

				ctx.strokeStyle = 'rgba(215,135,255,0.95)'
				ctx.lineWidth   = 2; ctx.lineCap = 'round'
				ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -r * 0.38); ctx.stroke()
				ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 0.28, r * 0.10); ctx.stroke()

				ctx.fillStyle = 'rgba(215,135,255,1)'
				ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, Math.PI * 2); ctx.fill()

			} else if (p.type === 'shield') {
				// Shield — green hexagon + inner shield shape
				const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2)
				grd.addColorStop(0, 'rgba(0,255,160,0.22)')
				grd.addColorStop(1, 'rgba(0,255,160,0)')
				ctx.fillStyle = grd
				ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill()

				ctx.strokeStyle = 'rgba(0,255,160,0.85)'
				ctx.lineWidth   = 2
				ctx.beginPath()
				for (let i = 0; i < 6; i++) {
					const a = (i / 6) * Math.PI * 2 - Math.PI / 2
					const hx = Math.cos(a) * r * 0.82, hy = Math.sin(a) * r * 0.82
					i === 0 ? ctx.moveTo(hx, hy) : ctx.lineTo(hx, hy)
				}
				ctx.closePath(); ctx.stroke()

				ctx.strokeStyle = 'rgba(0,255,160,0.95)'
				ctx.lineWidth   = 2.5; ctx.lineCap = 'round'
				ctx.beginPath()
				ctx.moveTo(0,         -r * 0.52)
				ctx.lineTo( r * 0.36, -r * 0.24)
				ctx.lineTo( r * 0.36,  r * 0.12)
				ctx.lineTo(0,          r * 0.48)
				ctx.lineTo(-r * 0.36,  r * 0.12)
				ctx.lineTo(-r * 0.36, -r * 0.24)
				ctx.closePath()
				ctx.fillStyle = 'rgba(0,255,160,0.12)'; ctx.fill()
				ctx.stroke()

			} else if (p.type === 'gemshower') {
				// Orange burst circle + gem icons
				const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2)
				grd.addColorStop(0, 'rgba(255,140,0,0.22)')
				grd.addColorStop(1, 'rgba(255,140,0,0)')
				ctx.fillStyle = grd
				ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill()

				ctx.strokeStyle = 'rgba(255,150,0,0.85)'
				ctx.lineWidth   = 2
				ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()

				// Three small rotating diamonds
				const spinAngle = frame * 0.055
				for (let i = 0; i < 3; i++) {
					const a  = spinAngle + (i / 3) * Math.PI * 2
					const gx = Math.cos(a) * r * 0.50
					const gy = Math.sin(a) * r * 0.50
					const gs = r * 0.22
					ctx.save()
					ctx.translate(gx, gy)
					ctx.rotate(Math.PI / 4 + frame * 0.04)
					ctx.strokeStyle = i === 0 ? 'rgba(255,60,60,0.95)' : i === 1 ? 'rgba(0,255,130,0.95)' : 'rgba(255,210,0,0.95)'
					ctx.lineWidth   = 1.5
					ctx.strokeRect(-gs, -gs, gs * 2, gs * 2)
					ctx.restore()
				}

			} else if (p.type === 'nuke') {
				// Red/orange explosion circle
				const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2)
				grd.addColorStop(0, 'rgba(255,80,0,0.28)')
				grd.addColorStop(1, 'rgba(255,0,0,0)')
				ctx.fillStyle = grd
				ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill()

				ctx.strokeStyle = 'rgba(255,100,0,0.9)'
				ctx.lineWidth   = 2
				ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()

				// Burst rays
				ctx.strokeStyle = 'rgba(255,180,0,0.85)'
				ctx.lineWidth   = 2; ctx.lineCap = 'round'
				for (let i = 0; i < 8; i++) {
					const a  = (i / 8) * Math.PI * 2 + frame * 0.03
					const r1 = r * 0.38, r2 = r * 0.72
					ctx.beginPath()
					ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1)
					ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2)
					ctx.stroke()
				}

				// Center dot
				ctx.fillStyle = 'rgba(255,220,0,1)'
				ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill()

			} else if (p.type === 'autopilot') {
				// Teal/cyan targeting circle
				const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, r * 2)
				grd.addColorStop(0, 'rgba(0,230,220,0.22)')
				grd.addColorStop(1, 'rgba(0,230,220,0)')
				ctx.fillStyle = grd
				ctx.beginPath(); ctx.arc(0, 0, r * 2, 0, Math.PI * 2); ctx.fill()

				ctx.strokeStyle = 'rgba(0,230,220,0.85)'
				ctx.lineWidth   = 2
				ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()

				// Crosshair
				ctx.strokeStyle = 'rgba(0,230,220,0.7)'
				ctx.lineWidth   = 1.5
				const cr = r * 0.55
				ctx.beginPath(); ctx.moveTo(-cr, 0); ctx.lineTo(cr, 0); ctx.stroke()
				ctx.beginPath(); ctx.moveTo(0, -cr); ctx.lineTo(0, cr); ctx.stroke()

				// Inner ring
				ctx.strokeStyle = 'rgba(0,230,220,0.55)'
				ctx.lineWidth   = 1.5
				ctx.beginPath(); ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2); ctx.stroke()

				// Corner ticks on outer ring
				ctx.strokeStyle = 'rgba(0,230,220,0.95)'
				ctx.lineWidth   = 2.5; ctx.lineCap = 'round'
				for (let i = 0; i < 4; i++) {
					const a = (i / 4) * Math.PI * 2 - Math.PI / 4
					ctx.beginPath()
					ctx.arc(0, 0, r, a, a + 0.42)
					ctx.stroke()
				}
			}

			ctx.restore()
		}

		const drawSpaceBackground = (dt: number, speedMult: number) => {
			ctx.fillStyle = `rgba(4,6,20,${bgAlpha})`
			ctx.fillRect(0, 0, canvas.width, canvas.height)

			for (const s of starField) {
				s.x -= s.speed * speedMult * dt
				if (s.x < -4) s.x = canvas.width + 4
				const twinkle = 0.72 + Math.sin(frame * 0.04 + s.phase) * 0.28
				ctx.save()
				ctx.globalAlpha = s.alpha * twinkle * Math.min(1, bgAlpha * 1.8)
				ctx.fillStyle   = '#ffffff'
				ctx.beginPath(); ctx.arc(s.x, s.y, s.size * 0.5, 0, Math.PI * 2); ctx.fill()
				ctx.restore()
			}

			for (let i = shootingStars.length - 1; i >= 0; i--) {
				const ss = shootingStars[i]
				ss.x    += ss.vx * speedMult * dt
				ss.y    += ss.vy * speedMult * dt
				ss.life += dt
				const t    = ss.life / ss.maxLife
				const fade = t < 0.25 ? t / 0.25 : 1 - (t - 0.25) / 0.75
				const tailX = ss.x + ss.length
				const tailY = ss.y + (ss.vy / Math.abs(ss.vx)) * ss.length
				ctx.save()
				ctx.globalAlpha = fade * 0.88 * Math.min(1, bgAlpha * 2)
				const grad = ctx.createLinearGradient(ss.x, ss.y, tailX, tailY)
				grad.addColorStop(0,   'rgba(255,255,255,0.95)')
				grad.addColorStop(0.4, 'rgba(200,220,255,0.5)')
				grad.addColorStop(1,   'rgba(180,210,255,0)')
				ctx.strokeStyle = grad
				ctx.lineWidth   = 1.4
				ctx.beginPath(); ctx.moveTo(ss.x, ss.y); ctx.lineTo(tailX, tailY); ctx.stroke()
				ctx.restore()
				if (ss.life >= ss.maxLife || ss.x + ss.length < 0) shootingStars.splice(i, 1)
			}
		}

		const drawHUD = (magnetRemainingMs: number, slowRemainingMs: number, shieldRemainingMs: number, autopilotRemainingMs: number) => {
			const midX = canvas.width / 2
			ctx.save()
			ctx.textBaseline = 'top'

			const scoreLabel = `SCORE  ${state.score}`
			const gemsLabel  = `◆  ${state.collectScore}`
			ctx.font = '700 20px monospace'
			const sw     = ctx.measureText(scoreLabel).width
			const gw     = ctx.measureText(gemsLabel).width
			const gap    = 24
			const totalW = sw + gap + gw
			const startX = midX - totalW / 2

			ctx.fillStyle = 'rgba(0,0,0,0.45)'
			rRect(startX - 12, 8, totalW + 24, 32, 16)
			ctx.fill()

			ctx.textAlign = 'left'
			ctx.fillStyle = 'rgba(237,237,237,0.95)'
			ctx.fillText(scoreLabel, startX, 14)
			ctx.fillStyle = 'rgba(255,210,0,0.95)'
			ctx.fillText(gemsLabel,  startX + sw + gap, 14)

			let pillY = 52

			const drawPill = (label: string, remainingMs: number, maxMs: number, color: string) => {
				const secs = Math.ceil(remainingMs / 1000)
				const frac = Math.max(0, remainingMs / maxMs)
				const barW = 130, barH = 24
				const px   = midX - barW / 2

				ctx.fillStyle = 'rgba(0,0,0,0.55)'; rRect(px, pillY, barW, barH, 12); ctx.fill()
				ctx.fillStyle = color; ctx.globalAlpha = 0.28; rRect(px, pillY, barW * frac, barH, 12); ctx.fill()
				ctx.globalAlpha = 1
				ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85
				rRect(px, pillY, barW, barH, 12); ctx.stroke()
				ctx.globalAlpha = 1

				ctx.fillStyle = 'rgba(255,255,255,0.95)'
				ctx.font = '700 11px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
				ctx.fillText(`${label}  ${secs}s`, midX, pillY + barH / 2)
				pillY += 30
			}

			if (magnetRemainingMs    > 0) drawPill('⚡ MAGNET',    magnetRemainingMs,    MAGNET_MS,    'rgba(0,220,255,1)')
			if (slowRemainingMs      > 0) drawPill('⏱ SLOW TIME', slowRemainingMs,      SLOW_MS,      'rgba(180,60,255,1)')
			if (shieldRemainingMs    > 0) drawPill('🛡 SHIELD',    shieldRemainingMs,    SHIELD_MS,    'rgba(0,255,160,1)')
			if (autopilotRemainingMs > 0) drawPill('✈ AUTOPILOT', autopilotRemainingMs, AUTOPILOT_MS, 'rgba(0,230,220,1)')

			ctx.restore()
		}

		const animate = (now: number) => {
			// Delta time normalised to 60 fps — capped at 3 to survive tab-switch spikes
			const dt = lastTime > 0 ? Math.min((now - lastTime) / (1000 / 60), 3) : 1
			lastTime = now
			frame   += dt

			ctx.clearRect(0, 0, canvas.width, canvas.height)

			if (!state.active) { animId = requestAnimationFrame(animate); return }

			bgAlpha = Math.min(0.94, bgAlpha + 0.012 * dt)

			// Real-time powerup remaining
			const magnetRemainingMs   = Math.max(0, state.magnetEnd    - now)
			const slowRemainingMs     = Math.max(0, state.slowTimeEnd  - now)
			const magnetActive        = magnetRemainingMs  > 0
			const slowTimeActive      = slowRemainingMs    > 0
			const shieldRemainingMs   = Math.max(0, state.shieldEnd   - now)
			const shieldActive        = shieldRemainingMs  > 0
			const autopilotRemainingMs = Math.max(0, state.autopilotEnd - now)
			const speedMult          = slowTimeActive ? 0.35 : 1.0

			// Shooting-star spawn timer (dt-based)
			shootingStarTimer -= dt
			if (shootingStarTimer <= 0) {
				spawnShootingStar()
				shootingStarTimer = 140 + Math.random() * 220
			}

			drawSpaceBackground(dt, speedMult)

			const cx   = state.x + TRI / 2
			const cy   = state.y + TRI / 2
			const tilt = Math.atan2(state.vy, 6) * 0.85

			// ── Countdown ────────────────────────────────────────────
			if (state.countdown >= 0) {
				state.countdownTimer -= dt
				if (state.countdownTimer <= 0) {
					if (state.countdown === 0) {
						state.countdown = -1
					} else {
						state.countdown--
						state.countdownTimer = state.countdown === 0 ? 32 : 45
					}
				}

				drawTri(cx, cy, TRI, 0, 'rgba(237,237,237,0.88)', 'rgba(237,237,237,0.08)')

				const stepFrames = state.countdown === 0 ? 32 : 45
				const progress   = state.countdownTimer / stepFrames
				const fontSize   = Math.round((state.countdown === 0 ? 62 : 80) * (1.0 + progress * 0.28))
				const label      = state.countdown > 0 ? String(state.countdown) : 'GO!'
				const fadeAlpha  = state.countdown === 0 ? Math.min(1, state.countdownTimer / 9) : 1

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
				const autopilotActive = state.autopilotEnd > now
				if (autopilotActive) {
					const shipCX   = state.x + TRI / 2
					const shipCY   = state.y + TRI / 2
					const LOOKAHEAD = 340

					// ── Obstacle repulsion ──────────────────────────
					let forceY = 0
					const applyRepulsion = (ox: number, oy: number, radius: number, weight: number) => {
						const rdx = ox - shipCX
						if (rdx < -(radius + 20) || rdx > LOOKAHEAD) return
						const rdy   = oy - shipCY
						const dist  = Math.max(1, Math.hypot(rdx, rdy))
						const clear = radius + TRI + 40
						if (dist < clear * 2.0) {
							const urgency   = Math.pow(Math.max(0, 1 - dist / (clear * 2.0)), 1.4)
							const xProx     = Math.max(0, 1 - Math.max(0, rdx) / LOOKAHEAD)
							forceY -= (rdy / dist) * urgency * xProx * weight
						}
					}
					for (const ast of state.asteroids) applyRepulsion(ast.x, ast.y, ast.radius, 18)
					for (const deb of state.debris)    applyRepulsion(deb.x, deb.y, deb.radius, 12)

					// ── Edge avoidance ──────────────────────────────
					const edgeBuf = 90
					if (shipCY < edgeBuf)                      forceY += (1 - shipCY / edgeBuf) * 9
					if (shipCY > canvas.height - edgeBuf)      forceY -= (1 - (canvas.height - shipCY) / edgeBuf) * 9

					// ── Path-clearance check (line-segment vs circle) ────
					const pathBlocked = (tx: number, ty: number): boolean => {
						const dx   = tx - shipCX
						const dy   = ty - shipCY
						const len2 = dx * dx + dy * dy
						if (len2 === 0) return false
						const safeR = TRI / 2 + 14   // ship radius + small buffer
						const checkCircle = (ox: number, oy: number, r: number): boolean => {
							const fx    = shipCX - ox
							const fy    = shipCY - oy
							const total = r + safeR
							const b     = 2 * (fx * dx + fy * dy)
							const c     = fx * fx + fy * fy - total * total
							const disc  = b * b - 4 * len2 * c
							if (disc < 0) return false
							const sq = Math.sqrt(disc)
							const t1 = (-b - sq) / (2 * len2)
							const t2 = (-b + sq) / (2 * len2)
							return t2 >= 0 && t1 <= 1
						}
						for (const ast of state.asteroids) {
							if (ast.x > shipCX - ast.radius && checkCircle(ast.x, ast.y, ast.radius)) return true
						}
						for (const deb of state.debris) {
							if (deb.x > shipCX - deb.radius && checkCircle(deb.x, deb.y, deb.radius)) return true
						}
						return false
					}

					// ── Seek nearest clear valuable target ────────────
					let targetY     = canvas.height / 2
					let bestPri     = 0
					for (const g of state.gems) {
						if (g.x < shipCX - 40) continue
						if (pathBlocked(g.x, g.y)) continue
						const gdx  = g.x - shipCX
						const gdy  = g.y - shipCY
						const dist = Math.hypot(gdx, gdy) + gdx * 0.4 + 1
						const val  = g.rainbow ? 100 : g.superRare ? 50 : g.rare ? 10 : 1
						const pri  = (val * 60) / dist
						if (pri > bestPri) { bestPri = pri; targetY = g.y }
					}
					for (const p of state.powerups) {
						if (p.x < shipCX - 40) continue
						if (pathBlocked(p.x, p.y)) continue
						const pdx  = p.x - shipCX
						const pdy  = p.y - shipCY
						const dist = Math.hypot(pdx, pdy) + pdx * 0.4 + 1
						const pri  = 250 / dist
						if (pri > bestPri) { bestPri = pri; targetY = p.y }
					}

					// ── Combine seek + repulsion → velocity ──────────
					const seekForce = (targetY - shipCY) * 0.055
					state.vy = state.vy * 0.65 + (seekForce + forceY) * 0.35 * dt
				} else {
					state.vy += GRAVITY * dt
					if (state.thrusting) state.vy -= (THRUST + GRAVITY) * dt
				}
				state.vy = Math.max(MAX_UP, Math.min(MAX_DOWN, state.vy))
				state.y += state.vy * speedMult * dt
				if (state.y < 0 || state.y + TRI > canvas.height) die()

				// ── Asteroids ─────────────────────────────────────────
				state.spawnTimer -= dt
				if (state.spawnTimer <= 0 && state.asteroids.length < 22) {
					state.asteroids.push(makeAsteroid())
					state.spawnTimer    = state.spawnInterval * (0.45 + Math.random() * 0.7)
					state.obsSpeed      = Math.min(20.0, state.obsSpeed + 0.20)
					state.spawnInterval = Math.max(30, state.spawnInterval - 3)
				}
				for (let i = state.asteroids.length - 1; i >= 0; i--) {
					const ast = state.asteroids[i]
					ast.x        -= ast.speed * speedMult * dt
					ast.rotation += ast.rotSpeed * dt
					if (ast.x + ast.radius < 0) { state.asteroids.splice(i, 1); state.score++ }
				}

				// ── Gems ──────────────────────────────────────────────
				state.gemTimer -= dt
				if (state.gemTimer <= 0) {
					const rng         = Math.random()
					const isRainbow   = rng < 0.04
					const isSuperRare = !isRainbow && rng < 0.19
					const isRare      = !isRainbow && !isSuperRare && rng < 0.34
					state.gems.push({
						x:         canvas.width + 10,
						y:         canvas.height * (0.12 + Math.random() * 0.76),
						size:      isRainbow ? 26 : isSuperRare ? 18 : isRare ? 16 : 13,
						speed:     state.obsSpeed * 0.85,
						rare:      isRare,
						superRare: isSuperRare,
						rainbow:   isRainbow,
					})
					state.gemTimer = 130 * (0.5 + Math.random() * 1.0)
				}
				const gemShowerActive = state.gemShowerEnd > now
				if (magnetActive || gemShowerActive) {
					for (const g of state.gems) {
						const dx = cx - g.x, dy = cy - g.y
						const dist = Math.hypot(dx, dy)
						if (dist > 5) {
							const pull = Math.min(20.0, 800 / dist) * dt
							g.x += (dx / dist) * pull
							g.y += (dy / dist) * pull
						}
					}
				}
				// ── Passive gem attraction (gentle pull within 80px) ─────
				if (!magnetActive && !gemShowerActive) {
					for (const g of state.gems) {
						const dx2 = cx - g.x, dy2 = cy - g.y
						const dist2 = Math.hypot(dx2, dy2)
						if (dist2 < 80 && dist2 > 5) {
							const pull = Math.min(0.9, 25 / dist2) * dt
							g.x += (dx2 / dist2) * pull
							g.y += (dy2 / dist2) * pull
						}
					}
				}
				for (let i = state.gems.length - 1; i >= 0; i--) {
					state.gems[i].x -= state.gems[i].speed * speedMult * dt
					if (state.gems[i].x < -20) state.gems.splice(i, 1)
				}

				// ── Debris spawning & movement ──────────────────────
				state.debrisTimer -= dt
				if (state.debrisTimer <= 0 && state.debris.length < 18) {
					state.debris.push(makeDebris())
					state.debrisTimer = 80 + Math.random() * 100
				}
				for (let i = state.debris.length - 1; i >= 0; i--) {
					const d = state.debris[i]
					d.x        -= d.speed * speedMult * dt
					d.rotation += d.rotSpeed * dt
					if (d.x + d.radius < 0) { state.debris.splice(i, 1); state.score++ }
				}


				// ── Powerup spawning & movement ───────────────────────
				state.powerupTimer -= dt
				if (state.powerupTimer <= 0) {
					state.powerups.push(makePowerup())
					state.powerupTimer = 520 + Math.random() * 400
				}
				for (let i = state.powerups.length - 1; i >= 0; i--) {
					state.powerups[i].x -= state.powerups[i].speed * speedMult * dt
					if (state.powerups[i].x < -60) state.powerups.splice(i, 1)
				}

				// ── Collisions ────────────────────────────────────────
				const shipR = TRI / 3.8
				if (!shieldActive) {
					for (const ast of state.asteroids) {
						if (Math.hypot(cx - ast.x, cy - ast.y) < shipR + ast.radius * 0.70) die()
					}
					for (const d of state.debris) {
						if (Math.hypot(cx - d.x, cy - d.y) < shipR + d.radius * 0.75) die()
					}
				}

				// ── Powerup collection ────────────────────────────────
				for (let i = state.powerups.length - 1; i >= 0; i--) {
					const p = state.powerups[i]
					if (Math.hypot(cx - p.x, cy - p.y) < POWERUP_R + TRI / 2) {
						const now2 = performance.now()
						if      (p.type === 'magnet')   state.magnetEnd    = now2 + MAGNET_MS
						else if (p.type === 'slowtime') state.slowTimeEnd  = now2 + SLOW_MS
						else if (p.type === 'shield')   state.shieldEnd    = now2 + SHIELD_MS
						else if (p.type === 'autopilot') state.autopilotEnd = now2 + AUTOPILOT_MS
						else if (p.type === 'nuke') {
							state.score += state.asteroids.length + state.debris.length
							state.asteroids = []
							state.debris    = []
						}
						else if (p.type === 'gemshower') {
							state.gemShowerEnd = now2 + 6_000
							for (let g = 0; g < 20; g++) {
								const rng2    = Math.random()
								const isRB    = rng2 < 0.04
								const isSR    = !isRB && rng2 < 0.19
								const isR     = !isRB && !isSR && rng2 < 0.34
								state.gems.push({
									x:         canvas.width * (0.2 + Math.random() * 0.75),
									y:         canvas.height * (0.1 + Math.random() * 0.8),
									size:      isRB ? 26 : isSR ? 18 : isR ? 16 : 13,
									speed:     state.obsSpeed * 0.85,
									rare:      isR,
									superRare: isSR,
									rainbow:   isRB,
								})
							}
						}
						state.powerups.splice(i, 1)
					}
				}

				// ── Gem collection ────────────────────────────────────
				for (let i = state.gems.length - 1; i >= 0; i--) {
					const g = state.gems[i]
					if (Math.hypot(cx - g.x, cy - g.y) < g.size + TRI / 2.5) {
						state.collectScore += g.rainbow ? 100 : g.superRare ? 50 : g.rare ? 10 : 1
						state.gems.splice(i, 1)
					}
				}

				// ── Slow-time purple vignette ─────────────────────────
				if (slowTimeActive) {
					const fadeIn  = Math.min(1, (SLOW_MS - slowRemainingMs) / 800)
					const fadeOut = Math.min(1, slowRemainingMs / 800)
					const vig = ctx.createRadialGradient(
						canvas.width / 2, canvas.height / 2, canvas.height * 0.25,
						canvas.width / 2, canvas.height / 2, canvas.height * 0.78,
					)
					vig.addColorStop(0, 'rgba(80,0,180,0)')
					vig.addColorStop(1, `rgba(80,0,180,${0.28 * fadeIn * fadeOut})`)
					ctx.save(); ctx.fillStyle = vig; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore()
				}

				// ── Magnet / gem-shower attraction lines ─────────────
				if (magnetActive || gemShowerActive) {
					const strength = magnetActive ? magnetRemainingMs / MAGNET_MS : Math.min(1, (state.gemShowerEnd - now) / 1000)
					for (const g of state.gems) {
						const dist = Math.hypot(cx - g.x, cy - g.y)
						if (dist < 200) {
							ctx.save()
							ctx.globalAlpha = (1 - dist / 200) * 0.38 * strength
							ctx.strokeStyle = 'rgba(0,220,255,0.9)'
							ctx.lineWidth   = 1
							ctx.setLineDash([3, 7])
							ctx.beginPath(); ctx.moveTo(g.x, g.y); ctx.lineTo(cx, cy); ctx.stroke()
							ctx.setLineDash([])
							ctx.restore()
						}
					}
				}

				// ── Draw powerups ─────────────────────────────────────
				for (const p of state.powerups) drawPowerup(p)


				// ── Draw debris ──────────────────────────────────────
				for (const d of state.debris) drawDebris(d)

				// ── Draw asteroids ────────────────────────────────────
				for (const ast of state.asteroids) drawAsteroid(ast)

				// ── Draw gems ─────────────────────────────────────────
				for (const g of state.gems) {
					ctx.save()
					ctx.translate(g.x, g.y)
					ctx.rotate(Math.PI / 4 + frame * 0.022)
					if (g.rainbow) {
						// Cycling hue border + diamond
						const hue   = (frame * 2.2) % 360
						const hue2  = (frame * 2.2 + 120) % 360
						const pulse = 0.8 + Math.sin(frame * 0.12) * 0.2
						ctx.shadowColor = `hsla(${hue},100%,65%,${pulse})`
						ctx.shadowBlur  = 30
						const grd = ctx.createLinearGradient(-g.size, -g.size, g.size, g.size)
						grd.addColorStop(0,   `hsla(${hue},  100%,65%,0.95)`)
						grd.addColorStop(0.5, `hsla(${hue2}, 100%,65%,0.95)`)
						grd.addColorStop(1,   `hsla(${(hue + 240) % 360},100%,65%,0.95)`)
						ctx.strokeStyle = grd; ctx.lineWidth = 3
						ctx.strokeRect(-g.size, -g.size, g.size * 2, g.size * 2)
						ctx.fillStyle = `hsla(${hue},100%,65%,0.10)`
						ctx.fillRect(-g.size, -g.size, g.size * 2, g.size * 2)
						const h = g.size * 0.52
						ctx.beginPath()
						ctx.moveTo(0,-h); ctx.lineTo(h,0); ctx.lineTo(0,h); ctx.lineTo(-h,0)
						ctx.closePath()
						ctx.fillStyle = `hsla(${hue2},100%,65%,0.45)`; ctx.fill()
						ctx.strokeStyle = `hsla(${(hue+60)%360},100%,80%,0.9)`; ctx.lineWidth = 2; ctx.stroke()
					} else if (g.superRare) {
						const pulse = 0.7 + Math.sin(frame * 0.13) * 0.3
						ctx.shadowColor = `rgba(255,40,40,${pulse})`
						ctx.shadowBlur  = 24
						ctx.strokeStyle = 'rgba(255,60,60,0.95)'; ctx.lineWidth = 2.5
						ctx.strokeRect(-g.size, -g.size, g.size * 2, g.size * 2)
						ctx.fillStyle = 'rgba(255,40,40,0.18)'
						ctx.fillRect(-g.size, -g.size, g.size * 2, g.size * 2)
						const h = g.size * 0.50
						ctx.beginPath()
						ctx.moveTo(0,-h); ctx.lineTo(h,0); ctx.lineTo(0,h); ctx.lineTo(-h,0)
						ctx.closePath()
						ctx.fillStyle = 'rgba(255,80,80,0.45)'; ctx.fill()
						ctx.strokeStyle = 'rgba(255,120,120,0.9)'; ctx.lineWidth = 1.5; ctx.stroke()
					} else if (g.rare) {
						const pulse = 0.7 + Math.sin(frame * 0.10) * 0.3
						ctx.shadowColor = `rgba(0,255,120,${pulse})`
						ctx.shadowBlur  = 18
						ctx.strokeStyle = 'rgba(0,255,130,0.95)'; ctx.lineWidth = 2
						ctx.strokeRect(-g.size, -g.size, g.size * 2, g.size * 2)
						ctx.fillStyle = 'rgba(0,255,130,0.22)'
						ctx.fillRect(-g.size, -g.size, g.size * 2, g.size * 2)
						const h = g.size * 0.45
						ctx.beginPath()
						ctx.moveTo(0,-h); ctx.lineTo(h,0); ctx.lineTo(0,h); ctx.lineTo(-h,0)
						ctx.closePath()
						ctx.fillStyle = 'rgba(0,255,130,0.35)'; ctx.fill()
					} else {
						if (magnetActive) { ctx.shadowColor = 'rgba(0,220,255,0.8)'; ctx.shadowBlur = 10 }
						ctx.strokeStyle = 'rgba(255,210,0,0.95)'; ctx.lineWidth = 1.5
						ctx.strokeRect(-g.size, -g.size, g.size * 2, g.size * 2)
						ctx.fillStyle = 'rgba(255,210,0,0.2)'
						ctx.fillRect(-g.size, -g.size, g.size * 2, g.size * 2)
					}
					ctx.restore()
				}

				// ── Thruster flame ────────────────────────────────────
				if (state.thrusting || Math.random() < 0.15 * dt) {
					const fl = state.thrusting ? 6 + Math.random() * 10 : 2 + Math.random() * 4
					ctx.save()
					ctx.translate(cx, cy); ctx.rotate(tilt)
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

				// ── Draw player ───────────────────────────────────────
				drawTri(cx, cy, TRI, tilt, 'rgba(237,237,237,0.88)', 'rgba(237,237,237,0.08)')

				// ── Shield bubble ────────────────────────────────────
				if (shieldActive) {
					const fadeOut = Math.min(1, shieldRemainingMs / 800)
					const pulse   = 1 + Math.sin(frame * 0.12) * 0.07
					ctx.save()
					ctx.shadowColor = 'rgba(0,255,160,0.9)'
					ctx.shadowBlur  = 18
					ctx.globalAlpha = 0.75 * fadeOut
					ctx.strokeStyle = 'rgba(0,255,160,0.9)'
					ctx.lineWidth   = 2
					ctx.beginPath(); ctx.arc(cx, cy, TRI * 0.9 * pulse, 0, Math.PI * 2); ctx.stroke()
					ctx.globalAlpha = 0.10 * fadeOut
					ctx.fillStyle   = 'rgba(0,255,160,1)'
					ctx.fill()
					ctx.restore()
				}

				// ── HUD ───────────────────────────────────────────────
				drawHUD(magnetRemainingMs, slowRemainingMs, shieldRemainingMs, autopilotRemainingMs)

				// ── Hint ──────────────────────────────────────────────
				if (state.hintTimer > 0) {
					state.hintTimer -= dt
					const alpha = Math.min(1, state.hintTimer / 40) * 0.55
					ctx.save()
					ctx.globalAlpha  = alpha
					ctx.fillStyle    = '#fff'
					ctx.font         = '600 11px monospace'
					ctx.textAlign    = 'center'
					ctx.textBaseline = 'middle'
					ctx.fillText('HOLD W / SPACE / ↑  TO FLY', canvas.width / 2, canvas.height * 0.72)
					ctx.restore()
				}

			} else {
				// ── Dead state ────────────────────────────────────────
				if (state.deadTimer > 0) state.deadTimer -= dt

				for (const ast of state.asteroids) drawAsteroid(ast, 0.3)

				if (Math.floor(frame / 5) % 2 === 0) {
					drawTri(cx, cy, TRI, tilt, 'rgba(219,0,29,0.9)', 'rgba(219,0,29,0.2)')
				}

				if (state.deadTimer <= 0) {
					ctx.save()
					ctx.textAlign    = 'center'
					ctx.textBaseline = 'middle'
					ctx.fillStyle    = 'rgba(237,237,237,0.8)'
					ctx.font         = '700 22px monospace'
					ctx.fillText(`SCORE  ${state.score}  ◆  ${state.collectScore}`, canvas.width / 2, canvas.height / 2 - 16)
					ctx.fillStyle    = 'rgba(237,237,237,0.4)'
					ctx.font         = '600 16px monospace'
					ctx.fillText('SPACE TO RESTART', canvas.width / 2, canvas.height / 2 + 16)
					ctx.restore()
				}
			}

			animId = requestAnimationFrame(animate)
		}
		animId = requestAnimationFrame(animate)

		return () => {
			cancelAnimationFrame(animId)
			window.removeEventListener('keydown', onKeyDown)
			window.removeEventListener('keyup',   onKeyUp)
			window.removeEventListener('resize',  resize)
		}
	}, []) // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<canvas
			ref={canvasRef}
			style={{
				position:      'absolute',
				inset:         0,
				width:         '100%',
				height:        '100%',
				pointerEvents: 'none',
				zIndex:        2,
			}}
		/>
	)
}
