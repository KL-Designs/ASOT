import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { connection } from 'next/server'

export const metadata: Metadata = {
	title: "MilPacs | Australian Special Operations Taskforce",
	description: "Military personnel files for the Australian Special Operations Taskforce — service records, ranks, and awards.",
}
import Banner from '@/public/images/home/Droneteam7.png'

import { fetchORBAT } from '@/lib/orbat'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

import Card from './card'
import MilpacsNav from './nav'
import WipPage from '@/components/wip-page'



function slugify(s: string) {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function hexToRgb(hex: string): string {
	const r = parseInt(hex.slice(1, 3), 16)
	const g = parseInt(hex.slice(3, 5), 16)
	const b = parseInt(hex.slice(5, 7), 16)
	return `${r}, ${g}, ${b}`
}

export default async function Page() {

	if (process.env.NODE_ENV !== 'production') return <WipPage />

	await connection()

	const [orbat, allMembers, me, metaDocs] = await Promise.all([
		fetchORBAT(),
		client.fetchAllMembers(),
		client.fetchMe().catch(() => null),
		Db.orbatSectionMeta.find({}).toArray(),
	])
	const metaMap = new Map(metaDocs.map(m => [`${m.category}:${m.sectionTitle ?? ''}`, m]))
	const canManageOrbat = !!me && client.hasRoles(me, PERMISSIONS.admin.manageOrbat)

	const lookup = client.buildOrbatLookup(allMembers)

	const navSections = [
		{
			id: 'india-company',
			label: 'India Company',
			subs: [{ id: 'hq', label: 'Headquarters' }],
		},
		{
			id: '1st-platoon',
			label: '1st Platoon',
			subs: orbat.platoon11.map(s => ({ id: slugify(s.title), label: s.title })),
		},
		{
			id: '2nd-platoon',
			label: '2nd Platoon',
			subs: orbat.platoon12.map(s => ({ id: slugify(s.title), label: s.title })),
		},
		{
			id: 'support-platoon',
			label: 'Support Platoon',
			subs: orbat.support.map(s => ({ id: slugify(s.title), label: s.title })),
		},
		{
			id: 'reservists',
			label: 'Reservists',
			subs: [],
		},
	]

	return (
		<div style={{ background: 'rgb(10,10,10)', minHeight: '100vh' }}>

			{/* Hero Banner */}
			<div className='relative w-full h-banner-sm md:h-banner-sm-md flex flex-col justify-end items-center overflow-hidden'>
				<Image src={Banner} alt='Banner' fill className='object-cover object-center' loading='eager' />
				<div className='absolute inset-0' style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.2) 40%, rgba(10,10,10,0.7) 75%, #0a0a0a 100%)' }} />
				<div className='relative z-10 flex flex-col items-center gap-3 pb-10 px-6 text-center w-full'>
					<h1 style={{ margin: 0, fontSize: 'clamp(2rem, 6vw, 3.5rem)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>MILPACS</h1>
					<div className='flex items-center gap-3' style={{ maxWidth: 360, width: '100%' }}>
						<div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.2)' }} />
						<div style={{ height: 2, width: 48, background: 'var(--red)' }} />
						<div style={{ flex: 1, height: 1, background: 'rgba(219,0,29,0.2)' }} />
					</div>
					<p style={{ margin: 0, fontSize: '0.75rem', opacity: 0.8, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.8)' }}>Military Personnel Accounting Centre</p>
					{canManageOrbat && (
						<Link href='/dashboard/orbat' style={{
							fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
							color: 'rgba(219,0,29,0.85)', background: 'rgba(0,0,0,0.45)',
							border: '1px solid rgba(219,0,29,0.35)', padding: '6px 16px', textDecoration: 'none',
							display: 'inline-flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(4px)',
						}}>
							⚙ Manage ORBAT
						</Link>
					)}
				</div>
			</div>

			<MilpacsNav sections={navSections} />

			<div className='m-auto max-w-[1400px]' style={{ padding: '3rem 2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

				{/* ── India Company HQ ──────────────────────────────────── */}
				<Section id='india-company' label='Command' title='India Company' rgb='219, 105, 105'>
					<SubSection id='hq' title='Headquarters' rgb='219, 105, 105'>
						<div className='flex flex-wrap gap-4 justify-center'>
							{[orbat.companyHQ.senior, ...orbat.companyHQ.members].map(m => {
								const member = lookup(m.name)
								return member ? <Card key={member.id} member={member} role={m.role} /> : null
							})}
						</div>
					</SubSection>
				</Section>

				{/* ── 1st Platoon — sections from ORBAT ───────────── */}
				<Section id='1st-platoon' label='Saturday' title='1st Platoon' rgb='173, 114, 4' hexColor={metaMap.get('platoon11:')?.color}>
					{orbat.platoon11.map((section) => {
						const secMeta = metaMap.get(`platoon11:${section.title}`)
						const patchUrl = secMeta?.patch ? `/api/orbat/patch?category=platoon11&section=${encodeURIComponent(section.title)}` : undefined
						return (
							<SubSection key={section.title} id={slugify(section.title)} title={section.title} rgb='173, 114, 4' hexColor={secMeta?.color ?? metaMap.get('platoon11:')?.color} patchUrl={patchUrl}>
								<div className='flex flex-wrap gap-4 justify-center'>
									{section.members.map(m => {
										const member = lookup(m.name)
										return member ? <Card key={member.id} member={member} role={m.role} /> : null
									})}
								</div>
							</SubSection>
						)
					})}
				</Section>

				{/* ── 2nd Platoon — sections from ORBAT ───────────── */}
				<Section id='2nd-platoon' label='Sunday' title='2nd Platoon' rgb='29, 116, 85' hexColor={metaMap.get('platoon12:')?.color}>
					{orbat.platoon12.map((section) => {
						const secMeta = metaMap.get(`platoon12:${section.title}`)
						const patchUrl = secMeta?.patch ? `/api/orbat/patch?category=platoon12&section=${encodeURIComponent(section.title)}` : undefined
						return (
							<SubSection key={section.title} id={slugify(section.title)} title={section.title} rgb='29, 116, 85' hexColor={secMeta?.color ?? metaMap.get('platoon12:')?.color} patchUrl={patchUrl}>
								<div className='flex flex-wrap gap-4 justify-center'>
									{section.members.map(m => {
										const member = lookup(m.name)
										return member ? <Card key={member.id} member={member} role={m.role} /> : null
									})}
								</div>
							</SubSection>
						)
					})}
				</Section>

				{/* ── Support Platoon (1-3) ─────────────────── */}
				<Section id='support-platoon' label='Saturday & Sunday' title='Support Platoon' rgb='32, 102, 148' hexColor={metaMap.get('support:')?.color}>
					{orbat.support.map((section) => {
						const secMeta = metaMap.get(`support:${section.title}`)
						const patchUrl = secMeta?.patch ? `/api/orbat/patch?category=support&section=${encodeURIComponent(section.title)}` : undefined
						return (
							<SubSection key={section.title} id={slugify(section.title)} title={section.title} rgb='32, 102, 148' hexColor={secMeta?.color ?? metaMap.get('support:')?.color} patchUrl={patchUrl}>
								<div className='flex flex-wrap gap-4 justify-center'>
									{section.members.map(m => {
										const member = lookup(m.name)
										return member ? <Card key={member.id} member={member} role={m.role} /> : null
									})}
								</div>
							</SubSection>
						)
					})}
				</Section>

				{/* ── Reservists ─────────────────────────── */}
				<Section id='reservists' label='Reservists' title='Company Reservists' rgb='194, 8, 154'>
					{orbat.activeReservists.length > 0 && (
						<SubSection title='Active' rgb='194, 8, 154'>
							<div className='flex flex-wrap gap-4 justify-center'>
								{orbat.activeReservists.map(name => {
									const member = lookup(name)
									return member ? <Card key={member.id} member={member} role='Active Reservist' /> : null
								})}
							</div>
						</SubSection>
					)}
					{orbat.inactiveReservists.length > 0 && (
						<SubSection title='Inactive' rgb='194, 8, 154'>
							<div className='flex flex-wrap gap-4 justify-center' style={{ opacity: 0.5 }}>
								{orbat.inactiveReservists.map(name => {
									const member = lookup(name)
									return member ? <Card key={member.id} member={member} role='Inactive Reservist' /> : null
								})}
							</div>
						</SubSection>
					)}
				</Section>

			</div>
		</div>
	)
}


function Section({ id, label, title, children, rgb, hexColor }: { id?: string; label: string; title: string; children: React.ReactNode; rgb: string; hexColor?: string }) {
	const effectiveRgb = hexColor ? hexToRgb(hexColor) : rgb
	return (
		<div
			id={id}
			className='flex flex-col gap-6'
			style={{
				scrollMarginTop: '60px',
				padding: 'clamp(1.25rem, 4vw, 2rem)',
				borderRadius: 8,
				border: `1px solid rgba(${effectiveRgb}, 0.18)`,
				borderTop: `2px solid rgba(${effectiveRgb}, 0.65)`,
				background: `linear-gradient(160deg, rgba(${effectiveRgb}, 0.05) 0%, rgba(${effectiveRgb}, 0.02) 40%, transparent 100%)`,
				boxShadow: `0 0 40px rgba(${effectiveRgb}, 0.06), 0 0 80px rgba(${effectiveRgb}, 0.03), inset 0 1px 0 rgba(${effectiveRgb}, 0.08)`,
			}}
		>
			<div className='flex flex-col gap-3' style={{ alignItems: 'center', textAlign: 'center' }}>
				<div style={{ fontSize: 'clamp(0.6rem, 1.8vw, 0.7rem)', fontWeight: 600, letterSpacing: '0.18em', color: `rgba(${effectiveRgb}, 0.85)`, textTransform: 'uppercase' }}>
					{label}
				</div>
				<h2 style={{ fontSize: 'clamp(1.2rem, 5vw, 2rem)', fontWeight: 700, letterSpacing: '0.08em', margin: 0, textTransform: 'uppercase' }}>
					{title}
				</h2>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
					<div style={{ height: 1, flexGrow: 1, background: `rgba(${effectiveRgb}, 0.2)` }} />
					<div style={{ width: 4, height: 4, background: `rgba(${effectiveRgb}, 1)`, transform: 'rotate(45deg)', flexShrink: 0 }} />
					<div style={{ height: 1, flexGrow: 1, background: `rgba(${effectiveRgb}, 0.2)` }} />
				</div>
			</div>
			<div className='flex flex-col gap-4'>
				{children}
			</div>
		</div>
	)
}


function SubSection({ id, title, children, rgb, hexColor, patchUrl }: { id?: string; title: string; children: React.ReactNode; rgb: string; hexColor?: string; patchUrl?: string }) {
	const effectiveRgb = hexColor ? hexToRgb(hexColor) : rgb
	return (
		<div id={id} className='flex flex-col gap-4' style={{ scrollMarginTop: '60px' }}>
			<div className='flex items-center gap-3'>
				<div style={{ height: 1, flexGrow: 1, background: `rgba(${effectiveRgb}, 0.15)` }} />
				{patchUrl && <img src={patchUrl} alt='' style={{ width: 22, height: 22, objectFit: 'contain', flexShrink: 0, opacity: 0.85 }} />}
				<h3 style={{ fontSize: 'clamp(0.65rem, 2vw, 1rem)', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: hexColor ? hexColor : 'rgba(237,237,237,0.45)', margin: 0, whiteSpace: 'nowrap' }}>
					{title}
				</h3>
				<div style={{ height: 1, flexGrow: 1, background: `rgba(${effectiveRgb}, 0.15)` }} />
			</div>
			{children}
		</div>
	)
}
