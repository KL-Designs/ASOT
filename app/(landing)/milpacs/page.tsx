import { connection } from 'next/server'

import { fetchORBAT } from '@/lib/orbat'
import client from '@/lib/discord'

import Card from './card'



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
		const key = orbatName.replace(/\s*\([^)]*\)/g, '').trim().toLowerCase()
		return byName.get(key) ?? null
	}

	return (
		<div style={{ background: 'rgb(10,10,10)', minHeight: '100vh' }}>
			<div className='m-auto max-w-[1400px]' style={{ padding: '3rem 2rem', display: 'flex', flexDirection: 'column', gap: '3rem' }}>

				{/* ── India Company HQ ──────────────────────────────────── */}
				<Section label='Command' title='India Company'>
					<SubSection title='Headquarters'>
						<div className='flex flex-wrap gap-4'>
							{[orbat.companyHQ.senior, ...orbat.companyHQ.members].map(m => {
								const member = lookup(m.name)
								return member ? <Card key={member.id} member={member} role={m.role} /> : null
							})}
						</div>
					</SubSection>
				</Section>

				<RedDivider />

				{/* ── 1st Platoon — sections from ORBAT ───────────── */}
				<Section label='Saturday' title='1st Platoon'>
					{orbat.platoon11.map((section) => (
						<SubSection key={section.title} title={section.title}>
							<div className='flex flex-wrap gap-4'>
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
				<Section label='Sunday' title='2nd Platoon'>
					{orbat.platoon12.map((section) => (
						<SubSection key={section.title} title={section.title}>
							<div className='flex flex-wrap gap-4'>
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
				<Section label='Saturday & Sunday' title='Support Platoon'>
					{orbat.support.map((section) => (
						<SubSection key={section.title} title={section.title}>
							<div className='flex flex-wrap gap-4'>
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
				<Section label='Reservists' title='Company Reservists'>
					{orbat.activeReservists.length > 0 && (
						<SubSection title='Active'>
							<div className='flex flex-wrap gap-4'>
								{orbat.activeReservists.map(name => {
									const member = lookup(name)
									return member ? <Card key={member.id} member={member} role='Active Reservist' /> : null
								})}
							</div>
						</SubSection>
					)}
					{orbat.inactiveReservists.length > 0 && (
						<SubSection title='Inactive'>
							<div className='flex flex-wrap gap-4' style={{ opacity: 0.5 }}>
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


function Section({ label, title, children }: { label: string; title: string; children: React.ReactNode }) {
	return (
		<div className='flex flex-col gap-6'>
			<div className='flex flex-col gap-4'>
				<div className='flex items-center gap-4'>
					<div style={{ width: 3, alignSelf: 'stretch', background: 'var(--red)', flexShrink: 0 }} />
					<div>
						<div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.8)', textTransform: 'uppercase', marginBottom: 4 }}>
							{label}
						</div>
						<h2 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.08em', margin: 0, textTransform: 'uppercase' }}>
							{title}
						</h2>
					</div>
				</div>
				<div style={{ height: 1, background: 'rgba(219,0,29,0.2)' }} />
			</div>
			<div className='flex flex-col gap-4'>
				{children}
			</div>
		</div>
	)
}


function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className='flex flex-col gap-4'>
			<div className='flex items-center gap-3'>
				<div style={{ height: 1, width: 24, background: 'rgba(219,0,29,0.4)', flexShrink: 0 }} />
				<h3 style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.45)', margin: 0, whiteSpace: 'nowrap' }}>
					{title}
				</h3>
				<div style={{ height: 1, flexGrow: 1, background: 'rgba(219,0,29,0.1)' }} />
			</div>
			{children}
		</div>
	)
}


function RedDivider() {
	return (
		<div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
			<div style={{ height: 1, flexGrow: 1, background: 'rgba(219,0,29,0.15)' }} />
			<div style={{ width: 6, height: 6, background: 'var(--red)', transform: 'rotate(45deg)', flexShrink: 0 }} />
			<div style={{ height: 1, flexGrow: 1, background: 'rgba(219,0,29,0.15)' }} />
		</div>
	)
}
