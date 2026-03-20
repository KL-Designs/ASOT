import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Avatar from '@/components/member/avatar'
import client from '@/lib/discord'
import { fetchORBAT, findOrbatEntry } from '@/lib/orbat'
import { resolveMilpacProfile } from '@/lib/milpac-profile'


async function resolveProfile(username: string) {
	const [allMembers, orbat] = await Promise.all([client.fetchAllMembers(), fetchORBAT()])
	const member = allMembers.find(m => m.username === username) ?? null
	if (!member) return null
	const lookup = client.buildOrbatLookup(allMembers)
	const orbatEntry = findOrbatEntry(orbat, lookup, member.id)
	return { member, ...resolveMilpacProfile(member, orbatEntry) }
}


export async function generateViewport({ params }: { params: Promise<{ username: string }> }): Promise<Viewport> {
	const { username } = await params
	const profile = await resolveProfile(username)
	return { themeColor: profile?.accent ?? '#9d000c' }
}


export async function generateMetadata({ params }: { params: Promise<{ username: string }> }): Promise<Metadata> {
	const { username } = await params
	const profile = await resolveProfile(username)
	if (!profile) return { title: 'Australian Special Operations Taskforce' }
	const { name, member } = profile
	return {
		title: `${name} | Australian Special Operations Taskforce`,
		description: member.bio?.content || undefined,
	}
}


export default async function Page({ params }: { params: Promise<{ username: string }> }) {
	const { username } = await params

	const profile = await resolveProfile(username)
	if (!profile) notFound()

	const { member, orbatEntry, accent, name, fullRank, callsign } = profile

	return (
		<div style={{ background: 'rgb(10,10,10)', minHeight: '100vh', color: 'rgba(237,237,237,0.9)' }}>
			<div style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
					<Link href='/milpacs' style={{
						display: 'inline-flex',
						alignItems: 'center',
						gap: 8,
						fontSize: '0.7rem',
						fontWeight: 600,
						letterSpacing: '0.14em',
						textTransform: 'uppercase',
						color: 'rgba(237,237,237,0.35)',
						textDecoration: 'none',
					}}>
						← Milpacs
					</Link>

					<a
						href={`https://www.australianspecialoperationstaskforce.com/${name.toLocaleLowerCase()}`}
						target='_blank'
						rel='noopener noreferrer'
						style={{
							display: 'inline-flex',
							alignItems: 'center',
							gap: 6,
							fontSize: '0.7rem',
							fontWeight: 600,
							letterSpacing: '0.14em',
							textTransform: 'uppercase',
							color: `${accent}cc`,
							textDecoration: 'none',
							padding: '5px 12px',
							border: `1px solid ${accent}40`,
							background: `${accent}0d`,
						}}
					>
						View Original ↗
					</a>
				</div>

				{/* ── Header ───────────────────────────────────────────── */}
				<div style={{
					display: 'flex',
					gap: '2rem',
					alignItems: 'center',
					flexWrap: 'wrap',
					padding: 'clamp(1.5rem, 4vw, 2.5rem)',
					borderRadius: 8,
					border: `1px solid ${accent}30`,
					borderTop: `2px solid ${accent}`,
					background: `linear-gradient(160deg, ${accent}10 0%, ${accent}04 40%, transparent 100%)`,
				}}>
					<div style={{
						position: 'relative',
						width: 100,
						height: 100,
						borderRadius: '50%',
						padding: 3,
						background: `linear-gradient(135deg, ${accent}99, rgba(237,237,237,0.08))`,
						flexShrink: 0,
					}}>
						<div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'rgb(13,13,13)' }}>
							<Avatar user={member} />
						</div>
					</div>

					<div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
						{/* Rank above name */}
						{fullRank && (
							<span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: `${accent}cc` }}>
								{fullRank}
							</span>
						)}

						<h1 style={{ margin: 0, fontSize: 'clamp(1.4rem, 4vw, 2.2rem)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1 }}>
							{name}
						</h1>

						{/* Role & Section badges */}
						{orbatEntry && (
							<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 2 }}>
								<span style={{
									padding: '4px 12px',
									borderRadius: 4,
									border: `1px solid ${accent}50`,
									background: `${accent}18`,
									fontSize: '0.65rem',
									fontWeight: 700,
									letterSpacing: '0.14em',
									textTransform: 'uppercase',
									color: `${accent}ee`,
								}}>
									{orbatEntry.role}
								</span>
								<span style={{
									padding: '4px 12px',
									borderRadius: 4,
									border: '1px solid rgba(237,237,237,0.1)',
									background: 'rgba(237,237,237,0.04)',
									fontSize: '0.65rem',
									fontWeight: 600,
									letterSpacing: '0.14em',
									textTransform: 'uppercase',
									color: 'rgba(237,237,237,0.4)',
								}}>
									{orbatEntry.section}
								</span>
							</div>
						)}

						<span style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', letterSpacing: '0.12em' }}>
							@{member.username}
						</span>
					</div>
				</div>

				{/* ── Bio ──────────────────────────────────────────────── */}
				<Section accent={accent} title='Biography'>
					{member.bio?.content ? (
						<p style={{ margin: 0, lineHeight: 1.8, color: 'rgba(237,237,237,0.65)', fontSize: '0.9rem' }}>
							{member.bio.content}
						</p>
					) : (
						<Placeholder text='No biography on record.' />
					)}
				</Section>

				{/* ── Service Record ───────────────────────────────────── */}
				<Section accent={accent} title='Service Record'>
					<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
						<tbody>
							<Row label='Status' value='Active' />
							<Row label='Enlisted' value={member.milpac?.enlistedDate || (member.guild?.joinedTimestamp ? new Date(member.guild.joinedTimestamp).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' }) : '—')} />
							<Row label='Rank' value={fullRank || '—'} />
						</tbody>
					</table>

					{member.milpac?.promotions && member.milpac.promotions.length > 0 ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
							<span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
								Promotion History
							</span>
							<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
								<thead>
									<tr>
										<th style={{ padding: '6px 0', textAlign: 'left', color: 'rgba(237,237,237,0.25)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Date</th>
										<th style={{ padding: '6px 0', textAlign: 'left', color: 'rgba(237,237,237,0.25)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Rank</th>
										<th style={{ padding: '6px 0', textAlign: 'left', color: 'rgba(237,237,237,0.25)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Role</th>
									</tr>
								</thead>
								<tbody>
									{member.milpac.promotions.map((p, i) => (
										<tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
											<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem', width: 130 }}>{p.date}</td>
											<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.75)', fontWeight: 600 }}>{p.rank}</td>
											<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.5)' }}>{p.role}</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					) : (
						<Placeholder text='No promotion history on record.' />
					)}
				</Section>

				{/* ── Qualifications ───────────────────────────────────── */}
				<Section accent={accent} title='Qualifications'>
					<Placeholder text='No qualifications on record.' />
				</Section>

				{/* ── Awards & Citations ───────────────────────────── */}
				<Section accent={accent} title='Awards & Citations'>
					{member.milpac?.awards && member.milpac.awards.length > 0 ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
							{member.milpac.awards.map((a, i) => (
								<div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
									<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
										<span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.8)' }}>{a.name}</span>
										<span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `${accent}bb`, padding: '2px 8px', border: `1px solid ${accent}40`, background: `${accent}10` }}>
											{a.type}
										</span>
									</div>
									{a.date && (
										<span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.date}</span>
									)}
								</div>
							))}
						</div>
					) : (
						<Placeholder text='No awards on record.' />
					)}
				</Section>

				{/* ── Operation History ─────────────────────────────────── */}
				<Section accent={accent} title='Operation History'>
					{member.milpac?.operations && member.milpac.operations.length > 0 ? (
						<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
							<thead>
								<tr>
									<th style={{ padding: '6px 0', textAlign: 'left', color: 'rgba(237,237,237,0.25)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Operation</th>
									<th style={{ padding: '6px 0', textAlign: 'left', color: 'rgba(237,237,237,0.25)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>Date</th>
								</tr>
							</thead>
							<tbody>
								{member.milpac.operations.map((op, i) => (
									<tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
										<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.75)', fontWeight: 600 }}>{op.name}</td>
										<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem' }}>{op.startToEndDate}</td>
									</tr>
								))}
							</tbody>
						</table>
					) : (
						<Placeholder text='No operations on record.' />
					)}
				</Section>

			</div>
		</div>
	)
}


function Section({ accent, title, children }: { accent: string; title: string; children: React.ReactNode }) {
	return (
		<div style={{
			padding: 'clamp(1.25rem, 4vw, 1.75rem)',
			borderRadius: 8,
			border: `1px solid rgba(255,255,255,0.06)`,
			borderLeft: `2px solid ${accent}80`,
			background: 'rgba(255,255,255,0.02)',
			display: 'flex',
			flexDirection: 'column',
			gap: '1rem',
		}}>
			<h2 style={{
				margin: 0,
				fontSize: '0.65rem',
				fontWeight: 700,
				letterSpacing: '0.2em',
				textTransform: 'uppercase',
				color: `${accent}cc`,
			}}>
				{title}
			</h2>
			{children}
		</div>
	)
}

function Row({ label, value }: { label: string; value: string }) {
	return (
		<tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
			<td style={{ padding: '8px 0', color: 'rgba(237,237,237,0.35)', width: 160, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.7rem' }}>
				{label}
			</td>
			<td style={{ padding: '8px 0', color: 'rgba(237,237,237,0.75)' }}>
				{value}
			</td>
		</tr>
	)
}

function Placeholder({ text }: { text: string }) {
	return (
		<p style={{
			margin: 0,
			fontSize: '0.75rem',
			color: 'rgba(237,237,237,0.2)',
			fontStyle: 'italic',
			letterSpacing: '0.05em',
		}}>
			{text}
		</p>
	)
}
