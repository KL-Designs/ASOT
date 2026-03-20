import { connection } from 'next/server'

import { fetchORBAT } from '@/lib/orbat'
import client from '@/lib/discord'

import Card from './card'
import MilpacsNav from './nav'



function slugify(s: string) {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default async function Page() {

	await connection()

	const [orbat, allMembers] = await Promise.all([
		fetchORBAT(),
		client.fetchAllMembers(),
	])

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
				<Section id='1st-platoon' label='Saturday' title='1st Platoon' rgb='173, 114, 4'>
					{orbat.platoon11.map((section) => (
						<SubSection key={section.title} id={slugify(section.title)} title={section.title} rgb='173, 114, 4'>
							<div className='flex flex-wrap gap-4 justify-center'>
								{section.members.map(m => {
									const member = lookup(m.name)
									return member ? <Card key={member.id} member={member} role={m.role} /> : null
								})}
							</div>
						</SubSection>
					))}
				</Section>

				{/* ── 2nd Platoon — sections from ORBAT ───────────── */}
				<Section id='2nd-platoon' label='Sunday' title='2nd Platoon' rgb='29, 116, 85'>
					{orbat.platoon12.map((section) => (
						<SubSection key={section.title} id={slugify(section.title)} title={section.title} rgb='29, 116, 85'>
							<div className='flex flex-wrap gap-4 justify-center'>
								{section.members.map(m => {
									const member = lookup(m.name)
									return member ? <Card key={member.id} member={member} role={m.role} /> : null
								})}
							</div>
						</SubSection>
					))}
				</Section>

				{/* ── Support Platoon (1-3) ─────────────────── */}
				<Section id='support-platoon' label='Saturday & Sunday' title='Support Platoon' rgb='32, 102, 148'>
					{orbat.support.map((section) => (
						<SubSection key={section.title} id={slugify(section.title)} title={section.title} rgb='32, 102, 148'>
							<div className='flex flex-wrap gap-4 justify-center'>
								{section.members.map(m => {
									const member = lookup(m.name)
									return member ? <Card key={member.id} member={member} role={m.role} /> : null
								})}
							</div>
						</SubSection>
					))}
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


function Section({ id, label, title, children, rgb }: { id?: string; label: string; title: string; children: React.ReactNode; rgb: string }) {
	return (
		<div
			id={id}
			className='flex flex-col gap-6'
			style={{
				scrollMarginTop: '60px',
				padding: 'clamp(1.25rem, 4vw, 2rem)',
				borderRadius: 8,
				border: `1px solid rgba(${rgb}, 0.18)`,
				borderTop: `2px solid rgba(${rgb}, 0.65)`,
				background: `linear-gradient(160deg, rgba(${rgb}, 0.05) 0%, rgba(${rgb}, 0.02) 40%, transparent 100%)`,
				boxShadow: `0 0 40px rgba(${rgb}, 0.06), 0 0 80px rgba(${rgb}, 0.03), inset 0 1px 0 rgba(${rgb}, 0.08)`,
			}}
		>
			<div className='flex flex-col gap-3' style={{ alignItems: 'center', textAlign: 'center' }}>
				<div style={{ fontSize: 'clamp(0.6rem, 1.8vw, 0.7rem)', fontWeight: 600, letterSpacing: '0.18em', color: `rgba(${rgb}, 0.85)`, textTransform: 'uppercase' }}>
					{label}
				</div>
				<h2 style={{ fontSize: 'clamp(1.2rem, 5vw, 2rem)', fontWeight: 700, letterSpacing: '0.08em', margin: 0, textTransform: 'uppercase' }}>
					{title}
				</h2>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
					<div style={{ height: 1, flexGrow: 1, background: `rgba(${rgb}, 0.2)` }} />
					<div style={{ width: 4, height: 4, background: `rgba(${rgb}, 1)`, transform: 'rotate(45deg)', flexShrink: 0 }} />
					<div style={{ height: 1, flexGrow: 1, background: `rgba(${rgb}, 0.2)` }} />
				</div>
			</div>
			<div className='flex flex-col gap-4'>
				{children}
			</div>
		</div>
	)
}


function SubSection({ id, title, children, rgb }: { id?: string; title: string; children: React.ReactNode; rgb: string }) {
	return (
		<div id={id} className='flex flex-col gap-4' style={{ scrollMarginTop: '60px' }}>
			<div className='flex items-center gap-3'>
				<div style={{ height: 1, flexGrow: 1, background: `rgba(${rgb}, 0.15)` }} />
				<h3 style={{ fontSize: 'clamp(0.65rem, 2vw, 1rem)', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.45)', margin: 0, whiteSpace: 'nowrap' }}>
					{title}
				</h3>
				<div style={{ height: 1, flexGrow: 1, background: `rgba(${rgb}, 0.15)` }} />
			</div>
			{children}
		</div>
	)
}
