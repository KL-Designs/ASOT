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

	// Build a lookup: stripped lowercase nickname → User
	const byName = new Map<string, User>()
	for (const member of allMembers) {
		const nick = member.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim()
		const key = (nick || member.globalName || '').toLowerCase()
		if (key) byName.set(key, member)
	}

	function lookup(orbatName: string): User | null {
		const key = orbatName.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim().toLowerCase()
		if (byName.has(key)) return byName.get(key)!
		// Fallback: Discord nickname may have trailing plain-text status (e.g. "LOA", "AWOL")
		for (const [discordKey, member] of byName) {
			if (discordKey.startsWith(key + ' ')) return member
		}
		// Fallback: rank prefix differs between sheet and Discord (e.g. "SAM" vs "SSAM")
		const orbatSuffix = key.includes(' ') ? key.slice(key.indexOf(' ') + 1) : ''
		if (orbatSuffix) {
			for (const [discordKey, member] of byName) {
				const discordSuffix = discordKey.includes(' ') ? discordKey.slice(discordKey.indexOf(' ') + 1) : ''
				if (discordSuffix === orbatSuffix || discordSuffix.startsWith(orbatSuffix + ' ')) return member
			}
		}
		return null
	}

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

			<div className='m-auto max-w-[1400px]' style={{ padding: '3rem 2rem', display: 'flex', flexDirection: 'column', gap: '3rem' }}>

				{/* ── India Company HQ ──────────────────────────────────── */}
				<Section id='india-company' label='Command' title='India Company'>
					<SubSection id='hq' title='Headquarters'>
						<div className='flex flex-wrap gap-4 justify-center'>
							{[orbat.companyHQ.senior, ...orbat.companyHQ.members].map(m => {
								const member = lookup(m.name)
								return member ? <Card key={member.id} member={member} role={m.role} /> : null
							})}
						</div>
					</SubSection>
				</Section>

				<RedDivider />

				{/* ── 1st Platoon — sections from ORBAT ───────────── */}
				<Section id='1st-platoon' label='Saturday' title='1st Platoon'>
					{orbat.platoon11.map((section) => (
						<SubSection key={section.title} id={slugify(section.title)} title={section.title}>
							<div className='flex flex-wrap gap-4 justify-center'>
								{section.members.map(m => {
									const member = lookup(m.name)
									return member ? <Card key={member.id} member={member} role={m.role} /> : null
								})}
							</div>
						</SubSection>
					))}
				</Section>

				<RedDivider />

				{/* ── 2nd Platoon — sections from ORBAT ───────────── */}
				<Section id='2nd-platoon' label='Sunday' title='2nd Platoon'>
					{orbat.platoon12.map((section) => (
						<SubSection key={section.title} id={slugify(section.title)} title={section.title}>
							<div className='flex flex-wrap gap-4 justify-center'>
								{section.members.map(m => {
									const member = lookup(m.name)
									return member ? <Card key={member.id} member={member} role={m.role} /> : null
								})}
							</div>
						</SubSection>
					))}
				</Section>

				<RedDivider />

				{/* ── Support Platoon (1-3) ─────────────────── */}
				<Section id='support-platoon' label='Saturday & Sunday' title='Support Platoon'>
					{orbat.support.map((section) => (
						<SubSection key={section.title} id={slugify(section.title)} title={section.title}>
							<div className='flex flex-wrap gap-4 justify-center'>
								{section.members.map(m => {
									const member = lookup(m.name)
									return member ? <Card key={member.id} member={member} role={m.role} /> : null
								})}
							</div>
						</SubSection>
					))}
				</Section>

				<RedDivider />

				{/* ── Reservists ─────────────────────────── */}
				<Section id='reservists' label='Reservists' title='Company Reservists'>
					{orbat.activeReservists.length > 0 && (
						<SubSection title='Active'>
							<div className='flex flex-wrap gap-4 justify-center'>
								{orbat.activeReservists.map(name => {
									const member = lookup(name)
									return member ? <Card key={member.id} member={member} role='Active Reservist' /> : null
								})}
							</div>
						</SubSection>
					)}
					{orbat.inactiveReservists.length > 0 && (
						<SubSection title='Inactive'>
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


function Section({ id, label, title, children }: { id?: string; label: string; title: string; children: React.ReactNode }) {
	return (
		<div id={id} className='flex flex-col gap-6' style={{ scrollMarginTop: '60px' }}>
			<div className='flex flex-col gap-3' style={{ alignItems: 'center', textAlign: 'center' }}>
				<div style={{ fontSize: 'clamp(0.6rem, 1.8vw, 0.7rem)', fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.8)', textTransform: 'uppercase' }}>
					{label}
				</div>
				<h2 style={{ fontSize: 'clamp(1.2rem, 5vw, 2rem)', fontWeight: 700, letterSpacing: '0.08em', margin: 0, textTransform: 'uppercase' }}>
					{title}
				</h2>
				<div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
					<div style={{ height: 1, flexGrow: 1, background: 'rgba(219,0,29,0.2)' }} />
					<div style={{ width: 4, height: 4, background: 'var(--red)', transform: 'rotate(45deg)', flexShrink: 0 }} />
					<div style={{ height: 1, flexGrow: 1, background: 'rgba(219,0,29,0.2)' }} />
				</div>
			</div>
			<div className='flex flex-col gap-4'>
				{children}
			</div>
		</div>
	)
}


function SubSection({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
	return (
		<div id={id} className='flex flex-col gap-4' style={{ scrollMarginTop: '60px' }}>
			<div className='flex items-center gap-3'>
				<div style={{ height: 1, flexGrow: 1, background: 'rgba(219,0,29,0.15)' }} />
				<h3 style={{ fontSize: 'clamp(0.65rem, 2vw, 1rem)', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.45)', margin: 0, whiteSpace: 'nowrap' }}>
					{title}
				</h3>
				<div style={{ height: 1, flexGrow: 1, background: 'rgba(219,0,29,0.15)' }} />
			</div>
			{children}
		</div>
	)
}


function RedDivider() {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
			<div style={{ height: 1, flexGrow: 1, background: 'linear-gradient(to right, transparent, rgba(219,0,29,0.25))' }} />
			<div style={{ width: 6, height: 6, background: 'var(--red)', transform: 'rotate(45deg)', flexShrink: 0 }} />
			<div style={{ height: 1, flexGrow: 1, background: 'linear-gradient(to left, transparent, rgba(219,0,29,0.25))' }} />
		</div>
	)
}
