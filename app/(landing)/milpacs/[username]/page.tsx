import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { existsSync } from 'fs'
import { join } from 'path'
import Image from 'next/image'
import Avatar from '@/components/member/avatar'
import Banner from '@/public/images/home/Droneteam7.png'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { getOrbatEntryByUserId } from '@/lib/orbat'
import { resolveMilpacProfile } from '@/lib/milpac-profile'
import { CoverUpload } from './cover-upload'
import { BiographyEditor } from './bio-editor'


async function resolveProfile(username: string) {
	const allMembers = await client.fetchAllMembers()
	const member = allMembers.find(m => m.username === username) ?? null
	if (!member) return null
	const orbatEntry = await getOrbatEntryByUserId(member.id)
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
	const { name, rankAbbr, member, orbatEntry } = profile
	const title = `${rankAbbr ? `${rankAbbr} ${name}` : name} | ASOT`
	const description = member.bio?.content || undefined
	const role = orbatEntry?.role || undefined
	return {
		title,
		description,
		openGraph: {
			title,
			description,
			siteName: role,
		},
		twitter: {
			card: 'summary_large_image',
			title,
			description,
		},
	}
}


export default async function Page({ params }: { params: Promise<{ username: string }> }) {
	const { username } = await params

	const profile = await resolveProfile(username)
	if (!profile) notFound()

	const { member, orbatEntry, accent, name, fullRank, callsign } = profile

	const uniformPath = join(process.cwd(), 'milpacs', `${username}.png`)
	const hasUniform = existsSync(uniformPath)
	const medalsPath = join(process.cwd(), 'milpacs', `${username}-medals.png`)
	const hasMedals = existsSync(medalsPath)

	const me = await client.fetchMe().catch(() => null)
	const canEdit = me ? client.hasRoles(me, ['J5-Media']) : false
	const isOwn = me?.id === member.id
	const hasCover = existsSync(join(process.cwd(), 'uploads', 'cover', `${member.id}.png`))

	// Fetch confirmed attendance records for operation history
	const attendanceDocs = await Db.operationAttendance.find({
		records: { $elemMatch: { userId: member.id, confirmed: true } },
	}).toArray()
	const operationIds = attendanceDocs.map(d => d.operationId)
	const operationsData = operationIds.length > 0
		? await Db.operations.find({ _id: { $in: operationIds } }).toArray()
		: []
	const opMap = new Map(operationsData.map(o => [String(o._id), o]))
	const seenOpIds = new Set<string>()
	const confirmedOps = attendanceDocs.flatMap(doc => {
		const opId = String(doc.operationId)
		if (seenOpIds.has(opId)) return []
		seenOpIds.add(opId)
		const rec = doc.records.find(r => r.userId === member.id && r.confirmed)
		if (!rec) return []
		const op = opMap.get(opId)
		return [{
			operationId: opId,
			name: op?.title ?? 'Unknown Operation',
			date: op?.date ? new Date(op.date) : null,
		}]
	})

	return (
		<div style={{ background: 'rgb(10,10,10)', color: 'rgba(237,237,237,0.9)' }}>

			{/* Hero banner */}
			<div className='relative w-full h-banner-sm md:h-banner-sm-md flex flex-col justify-end items-center overflow-hidden'>
				{hasCover ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img src={`/api/uploads/cover?id=${member.id}&t=${Date.now()}`} alt='Cover' style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
				) : (
					<Image src={Banner} alt='Banner' fill className='object-cover object-center' loading='eager' />
				)}
				{isOwn && <CoverUpload hasCover={hasCover} />}
				<div className='absolute inset-0' style={{ background: `linear-gradient(to bottom, rgba(0,0,0,0.4) 0%, ${accent}20 40%, rgba(10,10,10,0.85) 75%, #0a0a0a 100%)` }} />
				<div className='relative z-10 flex flex-col items-center gap-3 pb-12 px-6 text-center'>
					<div style={{ position: 'relative', width: 90, height: 90, borderRadius: '50%', padding: 3, background: `linear-gradient(135deg, ${accent}99, rgba(237,237,237,0.08))`, flexShrink: 0, marginBottom: 4 }}>
						<div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'rgb(13,13,13)' }}>
							<Avatar user={member} />
						</div>
					</div>
					{fullRank && (
						<span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: `${accent}ee`, background: 'rgba(0,0,0,0.45)', padding: '3px 10px', backdropFilter: 'blur(4px)' }}>
							{fullRank}
						</span>
					)}
					<h1 style={{ margin: 0, fontSize: 'clamp(1.6rem, 5vw, 2.8rem)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', lineHeight: 1 }}>
						{name}
					</h1>
					<div className='flex items-center gap-3' style={{ maxWidth: 360, width: '100%' }}>
						<div style={{ flex: 1, height: 1, background: `${accent}40` }} />
						<div style={{ height: 2, width: 40, background: accent }} />
						<div style={{ flex: 1, height: 1, background: `${accent}40` }} />
					</div>
					{orbatEntry?.role && (
						<span style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.5)' }}>
							{orbatEntry.role}
						</span>
					)}
					{callsign && (
						<span style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.14em', color: 'rgba(237,237,237,0.5)' }}>
							{callsign}
						</span>
					)}
				</div>
			</div>

			<div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 2rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>

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

					<div style={{ display: 'flex', gap: 8 }}>
						{canEdit && (
							<Link href={`/members/${username}`} style={{
								display: 'inline-flex',
								alignItems: 'center',
								gap: 6,
								fontSize: '0.7rem',
								fontWeight: 600,
								letterSpacing: '0.14em',
								textTransform: 'uppercase',
								color: 'rgba(237,237,237,0.5)',
								textDecoration: 'none',
								padding: '5px 12px',
								border: '1px solid rgba(237,237,237,0.12)',
								background: 'rgba(237,237,237,0.04)',
							}}>
								Edit
							</Link>
						)}
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
				</div>

				<Section accent={accent} title='Biography'>
					{isOwn ? (
						<BiographyEditor initial={member.bio?.content ?? null} accent={accent} />
					) : member.bio?.content ? (
						<p style={{ margin: 0, lineHeight: 1.8, color: 'rgba(237,237,237,0.65)', fontSize: '0.9rem' }}>
							{member.bio.content}
						</p>
					) : (
						<Placeholder text='No biography on record.' />
					)}
				</Section>

				{hasUniform && (
					<div style={{
						borderRadius: 8,
						border: `1px solid rgba(255,255,255,0.06)`,
						borderLeft: `2px solid ${accent}80`,
						background: 'rgba(255,255,255,0.02)',
						overflow: 'hidden',
						display: 'flex',
						flexDirection: 'column',
					}}>
						<span style={{
							padding: '1.25rem 1.75rem 0',
							fontSize: '0.65rem',
							fontWeight: 700,
							letterSpacing: '0.2em',
							textTransform: 'uppercase',
							color: `${accent}cc`,
						}}>
							Uniform
						</span>
						<div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={`/api/milpacs/${username}`}
								alt={`${name} uniform`}
								style={{ objectFit: 'contain', maxHeight: 500 }}
							/>
						</div>
					</div>
				)}

				{hasMedals && (
					<div style={{
						borderRadius: 8,
						border: `1px solid rgba(255,255,255,0.06)`,
						borderLeft: `2px solid ${accent}80`,
						background: 'rgba(255,255,255,0.02)',
						overflow: 'hidden',
						display: 'flex',
						flexDirection: 'column',
					}}>
						<span style={{
							padding: '1.25rem 1.75rem 0',
							fontSize: '0.65rem',
							fontWeight: 700,
							letterSpacing: '0.2em',
							textTransform: 'uppercase',
							color: `${accent}cc`,
						}}>
							Medals
						</span>
						<div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={`/api/milpacs/${username}?type=medals`}
								alt={`${name} medals`}
								style={{ objectFit: 'contain', maxWidth: '100%' }}
							/>
						</div>
					</div>
				)}

				{/* ── Service Record ───────────────────────────────────── */}
				<Section accent={accent} title='Service Record'>
					<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
						<tbody>
							<Row label='Status' value='Active' />
							<Row label='Enlisted' value={member.milpac?.enlistedDate || (member.guild?.joinedTimestamp ? new Date(member.guild.joinedTimestamp).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' }) : '—')} />
							<Row label='Rank' value={fullRank || '—'} />
						</tbody>
					</table>

					{member.milpac?.promotions && member.milpac.promotions.length > 0 ? (() => {
						const showIssuedBy = member.milpac!.promotions!.some(p => p.issuedByName)
						const thStyle: React.CSSProperties = { padding: '6px 0', textAlign: 'left', color: 'rgba(237,237,237,0.25)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }
						return (
							<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
								<span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
									Promotion History
								</span>
								<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
									<thead>
										<tr>
											<th style={thStyle}>Date</th>
											<th style={thStyle}>Rank</th>
											<th style={thStyle}>Role</th>
											{showIssuedBy && <th style={thStyle}>Issued By</th>}
										</tr>
									</thead>
									<tbody>
										{member.milpac!.promotions!.map((p, i) => (
											<tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
												<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem', width: 130 }}>{p.date}</td>
												<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.75)', fontWeight: 600 }}>{p.rank}</td>
												<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.5)' }}>{p.role}</td>
												{showIssuedBy && <td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.3)', fontSize: '0.75rem' }}>{p.issuedByName || '—'}</td>}
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)
					})() : (
						<Placeholder text='No promotion history on record.' />
					)}
				</Section>

				{/* ── Qualifications ───────────────────────────────────── */}
				<Section accent={accent} title='Qualifications'>
					{member.milpac?.qualifications && member.milpac.qualifications.length > 0 ? (() => {
						const showIssuedBy = member.milpac!.qualifications!.some(q => q.issuedByName)
						const thStyle: React.CSSProperties = { padding: '6px 0', textAlign: 'left', color: 'rgba(237,237,237,0.25)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }
						return (
							<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
								<thead>
									<tr>
										<th style={thStyle}>Date</th>
										<th style={thStyle}>Qualification</th>
										{showIssuedBy && <th style={thStyle}>Issued By</th>}
									</tr>
								</thead>
								<tbody>
									{member.milpac!.qualifications!.map((q, i) => (
										<tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
											<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem', width: 130 }}>{q.date}</td>
											<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.75)', fontWeight: 600 }}>{q.qualification}</td>
											{showIssuedBy && <td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.3)', fontSize: '0.75rem' }}>{q.issuedByName || '—'}</td>}
										</tr>
									))}
								</tbody>
							</table>
						)
					})() : (
						<Placeholder text='No qualifications on record.' />
					)}
				</Section>

				{/* ── Awards & Citations ───────────────────────────── */}
				<Section accent={accent} title='Awards & Citations'>
					{member.milpac?.awards && member.milpac.awards.length > 0 ? (
						<div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
							{member.milpac.awards.map((a, i) => (
								<div key={i} style={{ paddingBottom: '0.75rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
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
									{a.issuedByName && (
										<div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', marginTop: 3 }}>
											Issued by {a.issuedByName}
										</div>
									)}
								</div>
							))}
						</div>
					) : (
						<Placeholder text='No awards on record.' />
					)}
				</Section>

				{/* ── Operation History ─────────────────────────────────── */}
				{(() => {
					function baseName(name: string): string {
						return name
							.replace(/\s*[-–—]\s*(sat|sun|night|day|part|session)(\s*\d+)?\s*$/gi, '')  // "— Sun", "— Sat", "— Night 2"
							.replace(/\s+(sat|sun|night|day|part|session)(\s*\d+)?\s*$/gi, '')
							.replace(/\s+\d+\s*$/g, '')
							.replace(/\s+[IVXLC]+\s*$/i, '')  // Roman numerals
							.replace(/\s*[-–—]\s*$/g, '')      // trailing dash artifacts
							.trim()
					}
					function fmtDate(d: Date) {
						return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })
					}

					type GroupedOp = { id: string; name: string; date: Date | null }
					const groups = new Map<string, { dates: Date[]; ops: GroupedOp[] }>()
					for (const op of confirmedOps) {
						const key = baseName(op.name)
						if (!groups.has(key)) groups.set(key, { dates: [], ops: [] })
						const g = groups.get(key)!
						if (op.date) g.dates.push(op.date)
						g.ops.push({ id: op.operationId, name: op.name, date: op.date })
					}
					const grouped = Array.from(groups.entries())
						.map(([name, g]) => ({ name, ...g }))
						.sort((a, b) => {
							const aMax = a.dates.length ? Math.max(...a.dates.map(d => d.getTime())) : 0
							const bMax = b.dates.length ? Math.max(...b.dates.map(d => d.getTime())) : 0
							return bMax - aMax
						})

					return (
						<Section accent={accent} title={`Operation History (${confirmedOps.length})`}>
							{grouped.length === 0 ? (
								<Placeholder text='No operations on record.' />
							) : (
								<div style={{ display: 'flex', flexDirection: 'column' }}>
									{grouped.map(g => {
										const sorted = [...g.dates].sort((a, b) => a.getTime() - b.getTime())
										const dateRange = sorted.length === 0 ? '—'
											: sorted.length === 1 ? fmtDate(sorted[0])
											: `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])}`
										const isSingle = g.ops.length === 1
										return isSingle ? (
											<a key={g.name} href={`/operations/${g.ops[0].id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', textDecoration: 'none', color: 'inherit' }}>
												<span style={{ flex: 1, fontSize: '0.8rem', color: 'rgba(237,237,237,0.75)', fontWeight: 600 }}>{g.name}</span>
												<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', whiteSpace: 'nowrap' }}>{dateRange}</span>
											</a>
										) : (
											<details key={g.name} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
												<summary style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', cursor: 'pointer', listStyle: 'none', userSelect: 'none' }}>
													<span style={{ flex: 1, fontSize: '0.8rem', color: 'rgba(237,237,237,0.75)', fontWeight: 600 }}>{g.name}</span>
													<span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', whiteSpace: 'nowrap' }}>{dateRange}</span>
													<span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', background: `${accent}18`, border: `1px solid ${accent}35`, color: `${accent}cc`, borderRadius: 3, flexShrink: 0 }}>
														×{g.ops.length}
													</span>
												</summary>
												<div style={{ display: 'flex', flexDirection: 'column', paddingLeft: 12, paddingBottom: 4 }}>
													{g.ops
														.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
														.map(op => (
															<a key={op.id} href={`/operations/${op.id}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.03)', textDecoration: 'none', color: 'inherit' }}>
																<span style={{ flex: 1, fontSize: '0.76rem', color: 'rgba(237,237,237,0.6)' }}>{op.name}</span>
																{op.date && <span style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.3)', whiteSpace: 'nowrap' }}>{fmtDate(op.date)}</span>}
															</a>
														))}
												</div>
											</details>
										)
									})}
								</div>
							)}
						</Section>
					)
				})()}

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
