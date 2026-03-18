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

				<div className='h-full flex flex-col items-center justify-center gap-6 px-6 relative'>
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


function MemberCount() {
	const [count, setCount] = useState<number | null>(null)

	useEffect(() => {
		fetch('/api/membercount')
			.then(res => res.json())
			.then(data => setCount(data.count))
	}, [])

	return <>{count || '---'}</>
}
