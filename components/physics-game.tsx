'use client'

import { useRef, useEffect } from 'react'

export default function PhysicsGame({ onActivate }: { onActivate: () => void }) {
	const canvasRef = useRef<HTMLCanvasElement>(null)

	useEffect(() => {
		const canvas = canvasRef.current
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		const BOX = 22
		const OBS_W = 18
		const GRAVITY = 0.12
		const JUMP_VEL = -9
		const MOVE_SPEED = 2.5

		interface Obstacle { x: number; height: number; speed: number }
		interface Platform { x: number; y: number; width: number; speed: number }
		interface Collectible { x: number; y: number; size: number; speed: number }

		const state = {
			active: false,
			dead: false,
			deadTimer: 0,
			x: 0, y: 0,
			vx: 0, vy: 0,
			onGround: false,
			hintTimer: 0,
			keys: { left: false, right: false },
			obstacles: [] as Obstacle[],
			platforms: [] as Platform[],
			spawnTimer: 90,
			platformTimer: 170,
			spawnInterval: 150,
			obsSpeed: 1.5,
			score: 0,
			collectScore: 0,
			collectibles: [] as Collectible[],
			collectTimer: 120,
		}

		const floor = () => canvas.height - BOX

		const reset = () => {
			state.x = 60
			state.y = -BOX
			state.vx = 0
			state.vy = 0
			state.onGround = false
			state.obstacles = []
			state.platforms = []
			state.spawnTimer = 90
			state.platformTimer = 170
			state.spawnInterval = 150
			state.obsSpeed = 1.5
			state.score = 0
			state.collectScore = 0
			state.collectibles = []
			state.collectTimer = 120
			state.dead = false
			state.deadTimer = 0
			state.hintTimer = 200
		}

		const resize = () => {
			canvas.width = canvas.offsetWidth
			canvas.height = canvas.offsetHeight
		}
		resize()
		window.addEventListener('resize', resize)

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.code === 'Space') {
				e.preventDefault()
				if (!state.active) { state.active = true; reset(); onActivate(); return }
				if (state.dead && state.deadTimer <= 0) { reset(); return }
				if (state.onGround) { state.vy = JUMP_VEL; state.onGround = false }
			}
			if (!state.active || state.dead) return
			if (e.code === 'KeyA') state.keys.left = true
			if (e.code === 'KeyD') state.keys.right = true
			if (e.code === 'Space' && state.onGround) {
				state.vy = JUMP_VEL
				state.onGround = false
			}
		}
		const onKeyUp = (e: KeyboardEvent) => {
			if (e.code === 'KeyA') state.keys.left = false
			if (e.code === 'KeyD') state.keys.right = false
			if ((e.code === 'KeyW' || e.code === 'Space') && state.vy < -3) state.vy = -3
		}

		window.addEventListener('keydown', onKeyDown)
		window.addEventListener('keyup', onKeyUp)

		let animId: number
		let frame = 0

		const animate = () => {
			frame++
			ctx.clearRect(0, 0, canvas.width, canvas.height)

			if (!state.active) { animId = requestAnimationFrame(animate); return }

			const f = floor()

			if (!state.dead) {
				// Physics
				state.vy += GRAVITY
				if (state.keys.left) state.vx = -MOVE_SPEED
				else if (state.keys.right) state.vx = MOVE_SPEED
				else state.vx *= 0.75
				state.x += state.vx
				state.y += state.vy

				// Ground + platform landing
				state.onGround = false
				if (state.y >= f) { state.y = f; state.vy = 0; state.onGround = true }
				for (const plat of state.platforms) {
					if (state.vy >= 0 &&
						state.x + BOX > plat.x && state.x < plat.x + plat.width &&
						state.y + BOX >= plat.y && state.y + BOX - state.vy <= plat.y + 4) {
						state.y = plat.y - BOX; state.vy = 0; state.onGround = true; break
					}
				}
				if (state.x <= 0) { state.dead = true; state.deadTimer = 100 }
				if (state.x > canvas.width * 0.45) { state.x = canvas.width * 0.45; state.vx = 0 }

				// Platforms
				state.platformTimer--
				if (state.platformTimer <= 0) {
					const minY = canvas.height * 0.52
					const maxY = canvas.height * 0.78
					state.platforms.push({
						x: canvas.width + 10,
						y: minY + Math.random() * (maxY - minY),
						width: 50 + Math.random() * 45,
						speed: state.obsSpeed * 0.9,
					})
					state.platformTimer = Math.floor(190 * (0.5 + Math.random() * 1.0))
				}
				for (let i = state.platforms.length - 1; i >= 0; i--) {
					state.platforms[i].x -= state.platforms[i].speed
					if (state.platforms[i].x + state.platforms[i].width < 0) state.platforms.splice(i, 1)
				}

				// Obstacles
				state.spawnTimer--
				if (state.spawnTimer <= 0) {
					state.obstacles.push({
						x: canvas.width + 10,
						height: Math.random() * 52 + 32,
						speed: state.obsSpeed,
					})
					state.spawnTimer = Math.floor(state.spawnInterval * (0.6 + Math.random() * 0.8))
					state.obsSpeed = Math.min(3.2, state.obsSpeed + 0.02)
					state.spawnInterval = Math.max(90, state.spawnInterval - 1)
				}
				for (let i = state.obstacles.length - 1; i >= 0; i--) {
					state.obstacles[i].x -= state.obstacles[i].speed
					if (state.obstacles[i].x + OBS_W < 0) {
						state.obstacles.splice(i, 1)
						state.score++
					}
				}

				// Collectibles
				state.collectTimer--
				if (state.collectTimer <= 0) {
					state.collectibles.push({
						x: canvas.width + 10,
						y: canvas.height * (0.12 + Math.random() * 0.76),
						size: 11,
						speed: state.obsSpeed * 0.95,
					})
					state.collectTimer = Math.floor(140 * (0.5 + Math.random() * 1.0))
				}
				for (let i = state.collectibles.length - 1; i >= 0; i--) {
					state.collectibles[i].x -= state.collectibles[i].speed
					if (state.collectibles[i].x < -20) state.collectibles.splice(i, 1)
				}

				// Collision — push player left, lose if they hit the left edge
				for (const obs of state.obstacles) {
					const obsY = canvas.height - obs.height
					if (state.x < obs.x + OBS_W && state.x + BOX > obs.x &&
						state.y < obsY + obs.height && state.y + BOX > obsY) {
						state.vx = -7
						state.x = obs.x - BOX - 1
					}
				}

				// Collect gems
				for (let i = state.collectibles.length - 1; i >= 0; i--) {
					const col = state.collectibles[i]
					if (state.x < col.x + col.size && state.x + BOX > col.x - col.size &&
						state.y < col.y + col.size && state.y + BOX > col.y - col.size) {
						state.collectibles.splice(i, 1)
						state.collectScore++
					}
				}

				// Draw obstacles
				for (const obs of state.obstacles) {
					const obsY = canvas.height - obs.height
					ctx.save()
					ctx.strokeStyle = 'rgba(219,0,29,0.8)'
					ctx.lineWidth = 1.5
					ctx.strokeRect(obs.x, obsY, OBS_W, obs.height)
					ctx.fillStyle = 'rgba(219,0,29,0.07)'
					ctx.fillRect(obs.x, obsY, OBS_W, obs.height)
					ctx.restore()
				}

				// Draw collectibles
				for (const col of state.collectibles) {
					ctx.save()
					ctx.translate(col.x, col.y)
					ctx.rotate(Math.PI / 4)
					ctx.strokeStyle = 'rgba(255,210,0,0.95)'
					ctx.lineWidth = 1.5
					ctx.strokeRect(-col.size, -col.size, col.size * 2, col.size * 2)
					ctx.fillStyle = 'rgba(255,210,0,0.18)'
					ctx.fillRect(-col.size, -col.size, col.size * 2, col.size * 2)
					ctx.restore()
				}

				// Draw platforms
				for (const plat of state.platforms) {
					ctx.save()
					ctx.strokeStyle = 'rgba(237,237,237,0.85)'
					ctx.lineWidth = 2
					ctx.strokeRect(plat.x, plat.y, plat.width, 8)
					ctx.fillStyle = 'rgba(237,237,237,0.15)'
					ctx.fillRect(plat.x, plat.y, plat.width, 8)
					ctx.restore()
				}

				// Draw player
				ctx.save()
				ctx.strokeStyle = 'rgba(237,237,237,0.85)'
				ctx.lineWidth = 1.5
				ctx.strokeRect(state.x, state.y, BOX, BOX)
				ctx.fillStyle = 'rgba(237,237,237,0.06)'
				ctx.fillRect(state.x, state.y, BOX, BOX)
				ctx.restore()

				// Score
				ctx.save()
				ctx.fillStyle = 'rgba(237,237,237,0.3)'
				ctx.font = '600 14px monospace'
				ctx.textAlign = 'left'
				ctx.fillText(`SCORE  ${state.score}`, 14, 22)
				ctx.restore()

				// Gem score at bottom
				ctx.save()
				ctx.fillStyle = 'rgba(255,210,0,0.55)'
				ctx.font = '600 14px monospace'
				ctx.textAlign = 'center'
				ctx.fillText(`◆  ${state.collectScore}`, canvas.width / 2, canvas.height - 10)
				ctx.restore()

				// Hint
				if (state.hintTimer > 0) {
					state.hintTimer--
					const alpha = Math.min(1, state.hintTimer / 40) * 0.6
					ctx.save()
					ctx.globalAlpha = alpha
					ctx.fillStyle = '#fff'
					ctx.font = '600 11px monospace'
					ctx.textAlign = 'center'
					ctx.fillText('W TO JUMP  ·  A D TO MOVE', canvas.width / 2, f - BOX - 14)
					ctx.restore()
				}
			} else {
				// Dead — flash player
				if (state.deadTimer > 0) state.deadTimer--
				if (Math.floor(frame / 5) % 2 === 0) {
					ctx.save()
					ctx.strokeStyle = 'rgba(219,0,29,0.9)'
					ctx.lineWidth = 1.5
					ctx.strokeRect(state.x, state.y, BOX, BOX)
					ctx.fillStyle = 'rgba(219,0,29,0.18)'
					ctx.fillRect(state.x, state.y, BOX, BOX)
					ctx.restore()
				}
				for (const obs of state.obstacles) {
					const obsY = canvas.height - obs.height
					ctx.save()
					ctx.strokeStyle = 'rgba(219,0,29,0.4)'
					ctx.lineWidth = 1.5
					ctx.strokeRect(obs.x, obsY, OBS_W, obs.height)
					ctx.restore()
				}
				if (state.deadTimer <= 0) {
					ctx.save()
					ctx.textAlign = 'center'
					ctx.fillStyle = 'rgba(237,237,237,0.8)'
					ctx.font = '700 22px monospace'
					ctx.fillText(`SCORE  ${state.score}  ◆  ${state.collectScore}`, canvas.width / 2, canvas.height / 2 - 16)
					ctx.fillStyle = 'rgba(237,237,237,0.4)'
					ctx.font = '600 16px monospace'
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
