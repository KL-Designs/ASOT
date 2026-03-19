'use client'

import Link from 'next/link'
import Image, { StaticImageData } from 'next/image'
import { useRef, useEffect, useState } from 'react'

import { Button, Typography } from '@mui/material'
import { ChevronRight } from '@mui/icons-material'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDiscord } from '@fortawesome/free-brands-svg-icons'

import LargeLogo from '@/public/ASOT.svg'
import Banner from '@/public/images/home/PHQ2.png'
import YearsOfExperience from '@/public/images/home/yearsofexperience.jpg'
import DynamicGameplay from '@/public/images/home/dynamicgameplay.jpg'
import CommunityFocussed from '@/public/images/home/VicPose2.png'
import LargestMilsim from '@/public/images/home/Rooftopincert.jpg'
import CustomFeatures from '@/public/images/home/Droneteam7.png'

import SPEAR_OVERCAST_Final from '@/public/images/home/SPEAR_OVERCAST_Final.png'
import Mike1440 from '@/public/images/home/Mike1440.png'
import Droneteam7 from '@/public/images/home/Droneteam7.png'



export default function Page() {

	const ref = useRef<HTMLDivElement>(null)
	const [keys, setKeys] = useState<string>('')
	const [gameActive, setGameActive] = useState(false)

	useEffect(() => {
		if (ref.current) ref.current.focus({ preventScroll: true })
	}, [])

	useEffect(() => {
		const phrase = keys.toLocaleLowerCase()
		if (phrase === 'id10t') window.location.href = 'https://www.youtube.com/watch?v=xvFZjo5PgG0'
	}, [keys])

	function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
		if (e.key === 'Shift') return
		if (e.key === 'Backspace') return setKeys('')
		setKeys(keys + e.key)
	}

	return (
		<>
			{/* ── Hero ─────────────────────────────────────────────── */}
			<div
				ref={ref}
				className='h-[70vh] md:h-[80vh] w-full relative my-[-5px]'
				style={{ zIndex: -1 }}
				onKeyDown={handleKeyDown}
				tabIndex={0}
			>
				<Image src={Banner} alt='Banner' fill className='object-cover object-center' />
				<div className='absolute inset-0' style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.1) 50%, rgba(10,10,10,0.95) 100%)' }} />
			<div className='absolute inset-0' style={{ background: 'rgba(0,0,0,0.45)', opacity: gameActive ? 1 : 0, transition: 'opacity 0.7s ease', pointerEvents: 'none', zIndex: 1 }} />
			<FireEmbers />
			<PhysicsGame onActivate={() => setGameActive(true)} />

				<div className='h-full flex flex-col items-center justify-center gap-6 px-6 relative' style={{ opacity: gameActive ? 0 : 1, transition: 'opacity 0.6s ease', pointerEvents: gameActive ? 'none' : 'auto' }}>
					<div className='relative w-full max-w-[800px]' style={{ height: 'clamp(160px, 24vw, 340px)' }}>
						<Image src={LargeLogo} alt='ASOT Logo' fill className='object-contain object-center' />
					</div>

					<div className='flex flex-col items-center gap-2'>
						<div style={{ height: 2, width: 48, background: 'var(--red)' }} />
						<p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(237,237,237,0.92)', textTransform: 'uppercase', margin: 0 }}>
							Oceania&apos;s Largest ARMA 3 Milsim Unit
						</p>
						<div style={{ height: 2, width: 48, background: 'var(--red)' }} />
					</div>

					<div className='flex flex-wrap gap-3 justify-center'>
						<Link href='https://discord.gg/asot' target='_blank'>
							<Button variant='contained' color='primary' size='large' startIcon={<FontAwesomeIcon icon={faDiscord} />}>
								JOIN DISCORD
							</Button>
						</Link>
						<Link href='/about'>
							<Button variant='outlined' color='light' size='large'>
								LEARN MORE
							</Button>
						</Link>
					</div>
				</div>
			</div>

			{/* ── Stats Strip ──────────────────────────────────────── */}
			<div style={{ borderTop: '2px solid var(--red)', borderBottom: '1px solid rgba(219,0,29,0.15)', background: 'rgb(13,13,13)' }}>
				<div className='m-auto max-w-[1400px] grid grid-cols-2 md:grid-cols-4'>
					<StatItem label='Active Members' value={<MemberCount />} />
					<StatItem label='Years Active' value='6+' />
					<StatItem label='Ops Per Week' value='2' />
					<StatItem label='Region' value='Oceania' />
				</div>
			</div>

			{/* ── Main Content ─────────────────────────────────────── */}
			<div style={{ background: 'rgb(10,10,10)' }}>
				<div className='m-auto flex flex-col max-w-[1400px]' style={{ padding: '4rem 2rem', gap: '5rem' }}>

					{/* Largest Milsim */}
					<div style={{ border: '1px solid rgba(219,0,29,0.2)', borderTop: '2px solid var(--red)', background: 'rgba(219,0,29,0.03)' }}>
						<FeatureSection
							label='Recognition'
							title='The Largest Milsim In Australia'
							image={LargestMilsim}
							imageSide='right'
							action={{ href: '/about', label: 'About Us' }}
						>
							<Typography>We are proudly the largest milsim unit not only in Australia, but the entire Oceania Region.</Typography>
							<br />
							<Typography>With new recruits joining each week from across Australia, New Zealand, Asia and beyond, our operations regularly boast numbers of 50+ every week.</Typography>
						</FeatureSection>
					</div>

					{/* Discord CTA */}
					<div style={{ border: '1px solid rgba(88,101,242,0.2)', borderTop: '2px solid #5865F2', background: 'rgba(88,101,242,0.04)' }}>
						<div className='flex flex-col md:flex-row items-center justify-between gap-6 p-8'>
							<div className='flex flex-col gap-2'>
								<div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.18em', color: '#5865F2', textTransform: 'uppercase' }}>Community</div>
								<h2 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '0.06em', margin: 0 }}>JOIN OUR DISCORD</h2>
								<Typography style={{ color: 'rgba(237,237,237,0.55)', maxWidth: 520 }}>
									Connect with the ASOT community, stay up to date with operations, and take the first step toward joining the unit.
								</Typography>
							</div>
							<Link href='https://discord.gg/asot' target='_blank' style={{ flexShrink: 0 }}>
								<Button variant='contained' size='large' startIcon={<FontAwesomeIcon icon={faDiscord} />}
									style={{ background: '#5865F2', whiteSpace: 'nowrap' }}>
									JOIN NOW
								</Button>
							</Link>
						</div>
					</div>

					{/* Platoons */}
					<div className='flex flex-col gap-6'>
						<SectionHeader label='Our Units' title='Join Our Platoons' />
						<div className='flex flex-wrap gap-4' style={{ minHeight: 600 }}>
							<PlatoonCard title='1-1' image={Droneteam7} link='/about/callsigns#1-1'>
								1-1 is our primary infantry platoon, providing the main fighting force for the task force. They utilize a variety of weapons, vehicles, and equipment across three 8-man sections and a 4-man platoon headquarters.
							</PlatoonCard>
							<PlatoonCard title='1-2' image={SPEAR_OVERCAST_Final} link='/about/callsigns#1-2'>
								1-2 mirrors the structure and role of 1-1, serving as a core infantry platoon in ASOT. Comprising three 8-man sections and a 4-man platoon headquarters, they handle tactical operations across all environments.
							</PlatoonCard>
							<PlatoonCard title='1-3' image={Mike1440} link='/about/callsigns#1-3'>
								1-3 is ASOT&apos;s support platoon — providing combat engineering, indirect fire, rotary air support, medical aid, and armoured cavalry. Their specialised teams ensure operational flexibility on every mission.
							</PlatoonCard>
						</div>
					</div>

					{/* Feature Sections */}
					<div className='flex flex-col' style={{ border: '1px solid rgba(255,255,255,0.05)' }}>
						<FeatureSection
							label='Experience'
							title='Years of Experience'
							image={YearsOfExperience}
							imageSide='right'
							action={{ href: '/about', label: 'About Us' }}
						>
							<Typography>Our staff and members have a wealth of knowledge and experience behind them in running a community and of course, lots of hours within ARMA.</Typography>
							<br />
							<Typography>We have a number of previous and currently serving members of the armed forces who have helped develop our gameplay into a great balance of realism and playability.</Typography>
						</FeatureSection>

						<div style={{ height: 1, background: 'rgba(219,0,29,0.15)' }} />

						<FeatureSection
							label='Culture'
							title='Community Focused'
							image={CommunityFocussed}
							imageSide='left'
						>
							<Typography>Everyone has a voice.</Typography>
							<br />
							<Typography>Although we&apos;re a large, structured unit, everyone has the chance to provide feedback in nearly everything we do. New ideas are welcomed and we foster a community that is more like a family.</Typography>
						</FeatureSection>

						<div style={{ height: 1, background: 'rgba(219,0,29,0.15)' }} />

						<FeatureSection
							label='Features'
							title='Custom Game Features'
							image={CustomFeatures}
							imageSide='right'
						>
							<Typography>ASOT only features.</Typography>
							<br />
							<Typography>From custom uniforms, patches and weapons to vehicle recovery systems that let our engineers recover fully destroyed vehicles and aircraft — you will find a whole new side to ARMA never seen in other units.</Typography>
							<br />
							<Typography>We also have a custom rank and uniform system that allows members to track their progression and achievements in the unit.</Typography>
						</FeatureSection>

						<div style={{ height: 1, background: 'rgba(219,0,29,0.15)' }} />

						<FeatureSection
							label='Gameplay'
							title='Dynamic and Varied Gameplay'
							image={DynamicGameplay}
							imageSide='left'
							action={{ href: '/about/callsigns', label: 'Call Signs' }}
						>
							<Typography>Our missions are created with both realism and enjoyment in mind. Our full-time Zeus team ensures we experience well-balanced, challenging and dynamic missions each week.</Typography>
							<br />
							<Typography>We use a multitude of different weapons, equipment, vehicles and aircraft to create a truly combined arms approach to gameplay. There&apos;s something for everyone.</Typography>
						</FeatureSection>
					</div>

				</div>
			</div>
		</>
	)
}


function SectionHeader({ label, title }: { label: string, title: string }) {
	return (
		<div className='flex flex-col gap-4'>
			<div className='flex items-center gap-4'>
				<div style={{ width: 3, alignSelf: 'stretch', background: 'var(--red)', flexShrink: 0 }} />
				<div>
					<div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.8)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
					<h2 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.08em', margin: 0 }}>{title.toUpperCase()}</h2>
				</div>
			</div>
			<div style={{ height: 1, background: 'rgba(219,0,29,0.2)' }} />
		</div>
	)
}


function StatItem({ label, value }: { label: string, value: React.ReactNode }) {
	return (
		<div className='flex flex-col items-center justify-center gap-1' style={{ padding: '1.5rem 1rem', borderRight: '1px solid rgba(219,0,29,0.1)' }}>
			<span style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '0.02em', color: 'var(--red)' }}>{value}</span>
			<span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.16em', color: 'rgba(237,237,237,0.4)', textTransform: 'uppercase' }}>{label}</span>
		</div>
	)
}


function FeatureSection({ label, title, image, imageSide, children, action }: {
	label: string
	title: string
	image: StaticImageData
	imageSide: 'left' | 'right'
	children: React.ReactNode
	action?: { href: string, label: string }
}) {
	return (
		<div className='grid grid-cols-1 md:grid-cols-2'>
			<div className={`relative min-h-[300px] md:min-h-[420px] ${imageSide === 'right' ? 'md:order-last' : ''}`}>
				<Image src={image} alt={title} fill className='object-cover object-center' />
				<div className='absolute inset-0 hidden md:block' style={{ background: `linear-gradient(to ${imageSide === 'right' ? 'right' : 'left'}, rgba(10,10,10,0.9) 0%, transparent 30%)` }} />
			</div>
			<div className={`flex flex-col justify-center gap-5 p-8 md:p-14 ${imageSide === 'right' ? 'md:order-first' : ''}`}>
				<div>
					<div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.8)', textTransform: 'uppercase', marginBottom: 8 }}>{label}</div>
					<h2 style={{ fontSize: '1.8rem', fontWeight: 700, letterSpacing: '0.08em', margin: 0 }}>{title.toUpperCase()}</h2>
				</div>
				<div style={{ height: 2, width: 40, background: 'var(--red)' }} />
				<div>{children}</div>
				{action && (
					<div>
						<Link href={action.href}>
							<Button variant='outlined' color='primary' endIcon={<ChevronRight />}>
								{action.label.toUpperCase()}
							</Button>
						</Link>
					</div>
				)}
			</div>
		</div>
	)
}


function PlatoonCard({ children, title, link, image }: { children: React.ReactNode, title: string, link: string, image: StaticImageData }) {
	return (
		<div className='relative flex-grow overflow-hidden' style={{ width: 'clamp(280px, 340px, 400px)' }}>
			<Image src={image} alt='PlatoonCard' fill className='object-cover object-center' />
			<div className='absolute inset-0' style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.97) 0%, rgba(10,10,10,0.5) 45%, transparent 100%)' }} />

			<div className='h-full relative flex flex-col justify-center py-10 overflow-hidden' style={{ zIndex: 1 }}>
				<h2
					className='text-center select-none'
					style={{ fontSize: '10rem', fontWeight: 800, color: 'rgba(237,237,237,0.06)', letterSpacing: '-0.02em' }}
				>
					{title}
				</h2>

				<div className='flex flex-col items-center gap-5 px-6'>
					<div className='flex flex-col items-center gap-2'>
						<div style={{ fontSize: '1rem', fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.8)', textTransform: 'uppercase' }}>Platoon</div>
						<h3 style={{ fontSize: '5rem', fontWeight: 800, letterSpacing: '0.06em', margin: 0, textAlign: 'center' }}>{title}</h3>
						<div style={{ height: 2, width: 36, background: 'var(--red)' }} />
					</div>
					<div
						className='w-full p-4'
						style={{ borderLeft: '2px solid var(--red)', background: 'rgba(10,10,10,0.75)', backdropFilter: 'blur(4px)' }}
					>
						<p style={{ fontSize: '0.83rem', lineHeight: 1.65, color: 'rgba(237,237,237,0.75)' }}>{children}</p>
					</div>
					<Link href={link} className='pButton'>
						<p>LEARN MORE</p>
						<ChevronRight />
					</Link>
				</div>
			</div>
		</div>
	)
}


function FireEmbers() {
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
				size: Math.random() * 1 + 0.4,
				opacity: Math.random() * 0.5 + 0.5,
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
				ctx.globalAlpha = alpha * 0.35
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
				ctx.globalAlpha = alpha * 0.75
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
			}}
		/>
	)
}


function PhysicsGame({ onActivate }: { onActivate: () => void }) {
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
				ctx.fillText(`\u25c6  ${state.collectScore}`, canvas.width / 2, canvas.height - 10)
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
					ctx.fillText(`SCORE  ${state.score}  \u25c6  ${state.collectScore}`, canvas.width / 2, canvas.height / 2 - 16)
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
	}, [])

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


function MemberCount() {
	const [count, setCount] = useState<number | null>(null)

	useEffect(() => {
		fetch('/api/membercount')
			.then(res => res.json())
			.then(data => setCount(data.count))
	}, [])

	return <>{count || '---'}</>
}
