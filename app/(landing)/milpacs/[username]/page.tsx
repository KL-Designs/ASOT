import { notFound } from 'next/navigation'
import Link from 'next/link'
import Avatar from '@/components/member/avatar'
import client from '@/lib/discord'
import { fetchORBAT, findOrbatEntry } from '@/lib/orbat'
import { ensureVisible } from '@/lib/discord/color'


export default async function Page({ params }: { params: Promise<{ username: string }> }) {
	const { username } = await params

	const [allMembers, orbat] = await Promise.all([client.fetchAllMembers(), fetchORBAT()])
	const member = allMembers.find(m => m.username === username)
	if (!member) notFound()

	const lookup = client.buildOrbatLookup(allMembers)
	const orbatEntry = findOrbatEntry(orbat, lookup, member.id)

	const accent = ensureVisible(member.hexAccentColor || '#db001d')
	const displayName = member.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() || member.globalName || member.username

	const rankAndName = member.guild?.nickname?.replace(/\s*\[[^\]]*\]/g, '').trim() || displayName
	const parts = rankAndName.split(' ')
	const rank = parts.length > 1 ? parts[0] : null
	const callsign = member.bio?.callsign || null

	return (
		<div style={{ background: 'rgb(10,10,10)', minHeight: '100vh', color: 'rgba(237,237,237,0.9)' }}>
			<div style={{ maxWidth: 900, margin: '0 auto', padding: '4rem 2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

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
					alignSelf: 'flex-start',
				}}>
					← Milpacs
				</Link>

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
						{rank && (
							<span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: `${accent}cc` }}>
								{rank}
							</span>
						)}

						<h1 style={{ margin: 0, fontSize: 'clamp(1.4rem, 4vw, 2.2rem)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1 }}>
							{parts.length > 1 ? parts.slice(1).join(' ') : displayName}
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
							<Row label='Joined' value={member.guild?.joinedTimestamp ? new Date(member.guild.joinedTimestamp).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'} />
							<Row label='Rank' value={rank || '—'} />
						</tbody>
					</table>
					<Placeholder text='Full promotion history coming soon.' />
				</Section>

				{/* ── Qualifications ───────────────────────────────────── */}
				<Section accent={accent} title='Qualifications'>
					{member.optionals ? (
						<div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
							{[
								...member.optionals.qol,
								...member.optionals.gfx,
								...member.optionals.zeus,
								...member.optionals.j2,
								...member.optionals.j5,
							].map(q => (
								<span key={q.id} style={{
									padding: '4px 12px',
									borderRadius: 4,
									border: `1px solid ${accent}40`,
									background: `${accent}10`,
									fontSize: '0.7rem',
									fontWeight: 600,
									letterSpacing: '0.1em',
									textTransform: 'uppercase',
									color: 'rgba(237,237,237,0.7)',
								}}>
									{q.name}
								</span>
							))}
							{Object.values(member.optionals).flat().length === 0 && (
								<Placeholder text='No qualifications on record.' />
							)}
						</div>
					) : (
						<Placeholder text='No qualifications on record.' />
					)}
				</Section>

				{/* ── Awards & Commendations ───────────────────────────── */}
				<Section accent={accent} title='Awards & Commendations'>
					<Placeholder text='Awards system coming soon.' />
				</Section>

				{/* ── Operation History ─────────────────────────────────── */}
				<Section accent={accent} title='Operation History'>
					<Placeholder text='Operation attendance tracking coming soon.' />
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
