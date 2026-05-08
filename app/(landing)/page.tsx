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

import FireEmbers from '@/components/fire-embers'
import PhysicsGame from '@/components/physics-game'
import MinigameScoreboard from '@/components/minigame-scoreboard'
import MilitaryGrid from '@/components/military-grid'



export default function Page() {

	const ref       = useRef<HTMLDivElement>(null)
	const enlistRef = useRef<HTMLDivElement>(null)
	const [keys, setKeys] = useState<string>('')
	const [gameActive, setGameActive] = useState(false)
	const [currentUser, setCurrentUser] = useState<User | null>(null)
	const [scoreboardKey, setScoreboardKey] = useState(0)
	const [gameDead, setGameDead] = useState(false)
	const [showEnlistHint, setShowEnlistHint] = useState(false)
	const [lastScore, setLastScore] = useState<{ score: number; collectScore: number } | undefined>(undefined)
	const [globalBest, setGlobalBest]       = useState<number | undefined>(undefined)
	const [globalBestName, setGlobalBestName] = useState<string | undefined>(undefined)
	const [personalBest, setPersonalBest]   = useState<number | undefined>(undefined)
	const [sotm, setSotm] = useState<ScreenshotOfMonth | null>(null)

	useEffect(() => {
		if (ref.current) ref.current.focus({ preventScroll: true })
	}, [])

	useEffect(() => {
		const phrase = keys.toLocaleLowerCase()
		if (phrase === 'id10t') window.location.href = 'https://www.youtube.com/watch?v=xvFZjo5PgG0'
	}, [keys])

	useEffect(() => {
		fetch('/api/me').then(r => r.json()).then(data => {
			if (!data.error) setCurrentUser(data)
		}).catch(() => {})
	}, [])

	useEffect(() => {
		fetch('/api/gallery/sotm').then(r => r.json()).then(data => {
			setSotm(data ?? null)
		}).catch(() => {})
	}, [])

	useEffect(() => {
		fetch('/api/minigame/score')
			.then(r => r.json())
			.then((scores: { userId: string; displayName: string; total: number }[]) => {
				if (scores.length > 0) { setGlobalBest(scores[0].total); setGlobalBestName(scores[0].displayName) }
			}).catch(() => {})
	}, [scoreboardKey])

	useEffect(() => {
		if (!currentUser) return
		fetch('/api/minigame/score?all=true')
			.then(r => r.json())
			.then((scores: { userId: string; total: number }[]) => {
				const mine = scores.find(s => s.userId === currentUser.id)
				setPersonalBest(mine?.total)
			}).catch(() => {})
	}, [currentUser, scoreboardKey])

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			if (!enlistRef.current) return
			const rect = enlistRef.current.getBoundingClientRect()
			const cx = rect.left + rect.width / 2
			const cy = rect.top + rect.height / 2
			const dx = e.clientX - cx
			const dy = e.clientY - cy
			const dist = Math.hypot(dx, dy)
			const threshold = 180
			if (dist < threshold) {
				const force = (1 - dist / threshold) ** 0.7
				const tx = -(dx / dist) * force * 500
				const ty = -(dy / dist) * force * 500
				enlistRef.current.style.transform = `translate(${tx}px, ${ty}px)`
				setShowEnlistHint(true)
			} else {
				enlistRef.current.style.transform = 'translate(0,0)'
			}
		}
		window.addEventListener('mousemove', onMove, { passive: true })
		return () => window.removeEventListener('mousemove', onMove)
	}, [])

	function handleGameOver(score: number, collectScore: number) {
		setLastScore({ score, collectScore })
		setGameDead(true)
		if (!currentUser) return
		fetch('/api/minigame/score', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ score, collectScore }),
		}).then(() => setScoreboardKey(k => k + 1)).catch(() => {})
	}

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
				{sotm
					? <img src='/api/gallery/sotm/image' alt={`Screenshot of the Month — ${sotm.credit}`} className='absolute inset-0 w-full h-full object-cover object-center' />
					: <Image src={Banner} alt='Banner' fill className='object-cover object-center' />
				}
				<div className='absolute inset-0' style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.1) 50%, rgba(10,10,10,0.95) 100%)' }} />
				<MilitaryGrid gradient />
				<div className='absolute inset-0' style={{ background: 'rgba(0,0,0,0.45)', opacity: gameActive ? 1 : 0, transition: 'opacity 0.7s ease', pointerEvents: 'none', zIndex: 1 }} />
				<FireEmbers />
				<PhysicsGame onActivate={() => setGameActive(true)} onGameOver={handleGameOver} onRestart={() => setGameDead(false)} active={gameActive} personalBest={personalBest} globalBest={globalBest} globalBestName={globalBestName} liveUserId={currentUser?.id} liveAccentColor={currentUser?.hexAccentColor} />
				<MinigameScoreboard visible={gameDead} currentUserId={currentUser?.id} refreshKey={scoreboardKey} lastScore={lastScore} />

				{sotm && (
					<div className='absolute bottom-0 left-0 z-10 px-4 py-3' style={{ pointerEvents: 'none' }}>
						<div style={{ fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', fontFamily: 'monospace', marginBottom: 2 }}>
							Screenshot of the Month
						</div>
						<div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', letterSpacing: '0.04em' }}>
							{sotm.credit}
						</div>
						<div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.4)', letterSpacing: '0.04em', marginTop: 1 }}>
							{new Date(sotm.dateTaken).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
						</div>
						{sotm.operationTitle && (
							<div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.35)', letterSpacing: '0.04em', marginTop: 1 }}>
								{sotm.operationTitle}
							</div>
						)}
					</div>
				)}

				<div className='h-full flex flex-col items-center justify-center gap-6 px-6 relative' style={{ opacity: gameActive ? 0 : 1, transition: 'opacity 0.6s ease', pointerEvents: gameActive ? 'none' : 'auto' }}>
					<div className='relative w-full max-w-[800px]' style={{ height: 'clamp(160px, 24vw, 340px)' }}>
						<style>{`@keyframes logoBob { 0%, 100% { transform: translateY(0px); filter: drop-shadow(10px 15px 5px rgba(0,0,0,0.65)); } 50% { transform: translateY(-7px); filter: drop-shadow(15px 25px 10px rgba(0,0,0,0.5)); } }`}</style>
						<Image src={LargeLogo} alt='ASOT Logo' fill className='object-contain object-center' style={{ animation: 'logoBob 6s ease-in-out infinite' }} />
					</div>

					<div className='flex flex-col items-center gap-2'>
						<div style={{ height: 2, width: 48, background: 'var(--red)' }} />
						<p style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(237,237,237,0.92)', textTransform: 'uppercase', margin: 0, filter: 'drop-shadow(10px 20px 3px rgba(0,0,0,0.3))' }}>
							Oceania&apos;s Largest ARMA 3 Milsim Unit
						</p>
						<div style={{ height: 2, width: 48, background: 'var(--red)' }} />
					</div>

					<div className='flex flex-wrap gap-6 justify-center'>
						<Link href='https://discord.gg/asot' target='_blank'>
							<Button variant='contained' size='large' startIcon={<FontAwesomeIcon icon={faDiscord} />}
								sx={{
									background: '#5865F2',
									fontWeight: 700,
									letterSpacing: '0.1em',
									'&:hover': { background: '#4752c4' },
								}}
							>
								JOIN DISCORD
							</Button>
						</Link>
						{/* <Link href='/join'> */}
							<div style={{ position: 'relative', display: 'inline-block' }}>
								{showEnlistHint && (
									<span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.6)', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
										← Just Join through Discord
									</span>
								)}
								<div ref={enlistRef} style={{ display: 'inline-block', transition: 'transform 0.08s ease-out' }}>
									<Button
										variant='contained'
										size='large'
										endIcon={<ChevronRight />}
										sx={{
											'@keyframes enlistPulse': {
												'0%': { boxShadow: '0 0 0 0 rgba(219,0,29,0.7), 0 0 12px rgba(219,0,29,0.4)' },
												'70%': { boxShadow: '0 0 0 12px rgba(219,0,29,0), 0 0 18px rgba(219,0,29,0.15)' },
												'100%': { boxShadow: '0 0 0 0 rgba(219,0,29,0), 0 0 12px rgba(219,0,29,0.4)' },
											},
											background: 'var(--red)',
											fontWeight: 800,
											letterSpacing: '0.15em',
											animation: 'enlistPulse 2s ease-in-out infinite',
											'&:hover': {
												background: 'rgba(219,0,29,0.85)',
												transform: 'translateY(-1px)',
												boxShadow: '0 0 24px rgba(219,0,29,0.6)',
											},
											transition: 'transform 0.15s ease, box-shadow 0.15s ease',
										}}
										onClick={() => {}}
									>
										ENLIST NOW
									</Button>
								</div>
							</div>
						{/* </Link> */}
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
			<div style={{ background: 'rgb(10,10,10)', position: 'relative', overflow: 'hidden' }}>
				<MilitaryGrid />
				<div className='m-auto flex flex-col max-w-[1400px]' style={{ padding: '4rem 2rem', gap: '5rem', position: 'relative', zIndex: 1 }}>

					{/* Largest Milsim */}
					<div style={{ border: '1px solid rgba(255,255,255,0.06)', borderTop: '2px solid rgba(219,0,29,0.5)', background: 'rgb(13,13,13)' }}>
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
					<div style={{ border: '1px solid rgba(88,101,242,0.2)', borderTop: '2px solid #5865F2', background: 'rgb(13,13,13)' }}>
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

					{/* Intel Board — recent ops teaser */}
					<OpsTeaser />

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

					{/* Feature Sections — Dossier layout */}
					<div className='flex flex-col' style={{ border: '1px solid rgba(255,255,255,0.06)', background: 'rgb(13,13,13)' }}>
						<FeatureSection
							docNum={1}
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

						<div style={{ height: 1, background: 'rgba(219,0,29,0.12)' }} />

						<FeatureSection
							docNum={2}
							label='Culture'
							title='Community Focused'
							image={CommunityFocussed}
							imageSide='left'
						>
							<Typography>Everyone has a voice.</Typography>
							<br />
							<Typography>Although we&apos;re a large, structured unit, everyone has the chance to provide feedback in nearly everything we do. New ideas are welcomed and we foster a community that is more like a family.</Typography>
						</FeatureSection>

						<div style={{ height: 1, background: 'rgba(219,0,29,0.12)' }} />

						<FeatureSection
							docNum={3}
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

						<div style={{ height: 1, background: 'rgba(219,0,29,0.12)' }} />

						<FeatureSection
							docNum={4}
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


// ── Sub-components ────────────────────────────────────────────────────────────

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


function FeatureSection({ docNum, label, title, image, imageSide, children, action }: {
	docNum?: number
	label: string
	title: string
	image: StaticImageData
	imageSide: 'left' | 'right'
	children: React.ReactNode
	action?: { href: string, label: string }
}) {
	const num = docNum != null ? String(docNum).padStart(2, '0') : null

	return (
		<div className='grid grid-cols-1 md:grid-cols-2'>
			{/* Image pane */}
			<div className={`relative min-h-[300px] md:min-h-[420px] ${imageSide === 'right' ? 'md:order-last' : ''}`}>
				<Image src={image} alt={title} fill className='object-cover object-center' />
				<div className='absolute inset-0' style={{
					background: `linear-gradient(to ${imageSide === 'right' ? 'right' : 'left'}, rgba(13,13,13,0.92) 0%, transparent 35%)`,
				}} />
				{/* Caption bar */}
				<div className='absolute bottom-0 left-0 right-0' style={{
					borderTop: '1px solid rgba(219,0,29,0.18)',
					background: 'rgba(10,10,10,0.88)',
					backdropFilter: 'blur(4px)',
					padding: '6px 14px',
					display: 'flex',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}>
					<span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.18)' }}>
						J5 Media Team
					</span>
					{num && (
						<span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.4)' }}>
							File {num}
						</span>
					)}
				</div>
			</div>

			{/* Text pane */}
			<div className={`relative flex flex-col justify-center gap-5 p-8 md:p-12 overflow-hidden ${imageSide === 'right' ? 'md:order-first' : ''}`}>
				{/* Ghost document number */}
				{num && (
					<span aria-hidden style={{
						position: 'absolute',
						top: -10,
						right: 12,
						fontSize: '7rem',
						fontWeight: 900,
						color: 'rgba(255,255,255,0.03)',
						letterSpacing: '-0.04em',
						lineHeight: 1,
						userSelect: 'none',
						pointerEvents: 'none',
					}}>
						{num}
					</span>
				)}

				{/* Header */}
				<div>
					<div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
						{num && <span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', color: 'rgba(219,0,29,0.45)' }}>{num}</span>}
						{num && <div style={{ width: 1, height: 10, background: 'rgba(255,255,255,0.12)' }} />}
						<span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.75)' }}>{label}</span>
					</div>
					<h2 style={{ fontSize: '1.7rem', fontWeight: 900, letterSpacing: '0.06em', margin: 0, textTransform: 'uppercase' }}>{title}</h2>
				</div>

				{/* Rule */}
				<div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

				{/* Field notes label */}
				<div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.2)', marginBottom: -8 }}>
					── Field Notes
				</div>

				{/* Body */}
				<div style={{ borderLeft: '2px solid rgba(219,0,29,0.22)', paddingLeft: 14 }}>
					{children}
				</div>

				{action && (
					<div>
						<Link href={action.href as any}>
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
					<Link href={link as any} className='pButton'>
						<p>LEARN MORE</p>
						<ChevronRight />
					</Link>
				</div>
			</div>
		</div>
	)
}


const STATUS_COLORS: Record<string, string> = {
	'Active':         'rgba(0,200,80,0.9)',
	'Upcoming':       'rgba(219,160,0,0.9)',
	'Completed':      'rgba(100,150,237,0.8)',
	'In Development': 'rgba(219,0,29,0.75)',
}

const STATUS_ORDER: Record<string, number> = {
	'Active': 0, 'Upcoming': 1, 'Completed': 2, 'In Development': 3,
}

function OpsTeaser() {
	const [ops, setOps] = useState<Operation[]>([])
	const [loading, setLoading] = useState(true)

	useEffect(() => {
		fetch('/api/operations?status=Active,Upcoming,Completed')
			.then(r => r.json())
			.then(data => {
				const sorted = (data.missions || []).sort((a: Operation, b: Operation) =>
					(STATUS_ORDER[a.status ?? ''] ?? 99) - (STATUS_ORDER[b.status ?? ''] ?? 99)
				)
				setOps(sorted.slice(0, 3))
				setLoading(false)
			})
			.catch(() => setLoading(false))
	}, [])

	function milDate(d: any) {
		if (!d) return '——'
		return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
	}

	if (!loading && ops.length === 0) return null

	return (
		<div className='flex flex-col gap-6'>
			<SectionHeader label='Intel Board' title='Recent & Upcoming Operations' />
			<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
				{loading ? (
					[0, 1, 2].map(i => (
						<div key={i} style={{ height: 260, background: 'rgb(16,16,16)', border: '1px solid rgba(255,255,255,0.04)' }} />
					))
				) : (
					ops.map(op => {
						const color = op.themeColor || '#db001d'
						const id = String(op._id)
						const statusColor = STATUS_COLORS[op.status ?? ''] || 'rgba(237,237,237,0.35)'
						return (
							<Link key={id} href={`/operations/${id}` as any} style={{ textDecoration: 'none', display: 'block' }}>
								<div className='relative overflow-hidden' style={{ height: 260, background: 'rgb(13,13,13)', border: '1px solid rgba(255,255,255,0.06)', borderTop: `2px solid ${color}`, cursor: 'pointer' }}>
									{/* Cover image bg */}
									{op.coverImage && (
										<>
											<img src={op.coverImage} alt='' style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }} />
											<div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(13,13,13,0.1) 0%, rgba(13,13,13,0.5) 55%, rgb(13,13,13) 100%)' }} />
										</>
									)}

									{/* Card content */}
									<div className='relative h-full flex flex-col justify-between p-5' style={{ zIndex: 1 }}>
										{/* Top row */}
										<div className='flex items-center justify-between'>
											<span style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: statusColor }}>
												● {op.status || 'Unknown'}
											</span>
											{op.department && (
												<span style={{ fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: `${color}cc`, background: `${color}18`, padding: '2px 8px', border: `1px solid ${color}44` }}>
													{op.department}
												</span>
											)}
										</div>

										{/* Title block */}
										<div className='flex flex-col gap-2'>
											<div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.28)' }}>
												Operation
											</div>
											<h3 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', margin: 0, color: 'rgba(237,237,237,0.92)', lineHeight: 1.2 }}>
												{op.title}
											</h3>
											<div style={{ height: 1, background: `${color}44`, marginTop: 2 }} />
										</div>

										{/* Bottom row */}
										<div className='flex items-center justify-between'>
											<span style={{ fontSize: '0.62rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>
												{milDate(op.date)}
											</span>
											<span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: `${color}bb` }}>
												Read Orders →
											</span>
										</div>
									</div>
								</div>
							</Link>
						)
					})
				)}
			</div>
			<div className='flex justify-end'>
				<Link href='/operations' style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.28)', textDecoration: 'none' }}>
					View All Operations →
				</Link>
			</div>
		</div>
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
