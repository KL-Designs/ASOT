import type { Metadata, Viewport } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { renderUniform, renderBox, getRenderFingerprint } from '@/lib/milpac-gen/client'
import { buildUniformData, buildBoxData, computeUniformHash } from '@/lib/milpac-gen/data-mapper'
import { AWARD_TO_CITATION, QUAL_TO_BADGE } from '@/lib/milpac-gen/maps'
import { certificateCodeForCitation, MEDALLION_CERTIFICATE_CODES, rankAbbrFromName } from '@asot/lib'
import { RANK_TRACKS } from '@/lib/military/promotion-requirements'
import { calculateOpPoints } from '@/lib/military/points'
import { deriveStatus, platoonLabel } from '@/lib/military/milpac-status'
import { ensureVisible, hexToRgbTriplet } from '@/lib/discord/color'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { getOrbatEntryByUserId } from '@/lib/orbat'
import { resolveMilpacProfile } from '@/lib/military/milpac-profile'
import { CoverUpload } from './cover-upload'
import { BiographyEditor } from './bio-editor'
import { RequestAwardButton } from './RequestAwardButton'
import { ImageLightbox } from './image-lightbox'
import { CertificateViewer } from './certificate-link'
import { Hero, type HeroStat } from './hero'
import { Panel, Rows, Row, Empty, MedallionIcon, MEDALLION_ART, MonthChart, bucketByMonth } from './panels'
import s from './profile.module.css'


// ── Training badge → asset subfolder ─────────────────────────────────────────
const BADGE_SUBFOLDER: Record<string, string> = {
	'BCQB': 'CQB', 'ACQB': 'CQB', 'ECQB': 'CQB',
	'BM': 'Medical', 'AdvM': 'Medical', 'ExpM': 'Medical',
	'BIDF': 'IDF', 'AIDF': 'IDF', 'BCIDF': 'IDF',
	'BR': 'Rotary', 'AdvR': 'Rotary', 'ExpR': 'Rotary',
	'BF': 'Fixed%20Wing', 'AF': 'Fixed%20Wing', 'EF': 'Fixed%20Wing',
	'NCO': 'NCO', 'Platoon': 'NCO', 'Company': 'NCO',
	'PT': 'Parradrop-HALO', 'HALO': 'Parradrop-HALO', 'JM': 'Parradrop-HALO', 'PR': 'Parradrop-HALO',
	'BAT': 'Weapons', 'BGLA': 'Weapons', 'BMG': 'Weapons', 'BPistol': 'Weapons',
	'BRifle': 'Weapons', 'BSniper': 'Weapons',
	'ExpAT': 'Weapons', 'ExpGLA': 'Weapons', 'ExpMG': 'Weapons',
	'ExpPistol': 'Weapons', 'ExpRifle': 'Weapons', 'ExpSniper': 'Weapons',
	'Driver': 'Armoured%20Crewman', 'Gunner': 'Armoured%20Crewman', 'Commander': 'Armoured%20Crewman',
	'FO': 'FO%20and%20JTAC', 'JTAC': 'FO%20and%20JTAC',
	'Commando': 'Special%20Forces', 'Ranger': 'Special%20Forces', 'SASR': 'Special%20Forces',
}

function trainingBadgeUrl(code: string): string | null {
	if (code === 'RE') return '/milpac-assets/imge/Training%20Badges/RE.png'
	const subfolder = BADGE_SUBFOLDER[code]
	if (!subfolder) return null
	return `/milpac-assets/imge/Training%20Badges/${subfolder}/${code}.png`
}

/**
 * The certificate slide code for an award, or undefined if it has none.
 *
 * Medallions are looked up by award name because several of them map onto the
 * same ribbon; everything else goes through the citation the ribbon is drawn
 * from. The render service rejects a code with no slide, so an award that
 * resolves to nothing here simply isn't clickable.
 */
function certificateCodeForAward(name: string): string | undefined {
	const citation = AWARD_TO_CITATION[name]
	return MEDALLION_CERTIFICATE_CODES[name]
		?? (citation ? certificateCodeForCitation(citation) : undefined)
}

/**
 * Promotion certificate code for a stored rank.
 *
 * Promotions hold the rank's full name, but CSV-imported rows can hold the
 * abbreviation already — hence the fallback. The certificate assets drop the
 * parentheses: `PTE(S)` is `PTES`.
 */
function promotionCertCode(rank: string): string {
	return (rankAbbrFromName(rank) || rank).replace(/[()]/g, '')
}

// ── Promotion progress helper ─────────────────────────────────────────────────
function getPromotionProgress(currentRankAbbr: string | undefined, points: number) {
	if (!currentRankAbbr) return null
	const track = RANK_TRACKS.find(t => t.ranks.some(r => r.abbr === currentRankAbbr))
	if (!track) return null
	const idx = track.ranks.findIndex(r => r.abbr === currentRankAbbr)
	const next = track.ranks[idx + 1]
	if (!next) return { atMax: true as const }
	if (next.minPts === null) return { atMax: false as const, nextRank: next.abbr, billetOnly: true as const }
	// Use the previous rank's threshold as the start of the bar so it shows
	// progress through the current tier, not from 0 to next.minPts.
	const prev = idx > 0 ? track.ranks[idx - 1] : null
	const from = prev?.minPts ?? 0
	const pct = Math.min(100, Math.max(0, ((points - from) / (next.minPts - from)) * 100))
	return { atMax: false as const, nextRank: next.abbr, required: next.minPts, current: points, pct, billetOnly: false as const }
}

/** Rough duration between a stored date string and now, as `2.4Y` / `7M`.
 *
 *  `milpac.enlistedDate` and `promotions[].date` are free-form strings written by
 *  CSV imports and by hand, so this has to cope with `DD/MM/YYYY`, `DD-MM-YYYY`
 *  and the `en-AU` "17 Aug 2026" the Discord-join fallback produces. Anything it
 *  cannot parse yields null and the row renders an em-dash rather than `NaN`.
 */
function durationSince(raw?: string | null): string | null {
	if (!raw) return null
	let d: Date | null = null
	const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw.trim())
	if (dmy) d = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]))
	else {
		const parsed = new Date(raw)
		if (!Number.isNaN(parsed.getTime())) d = parsed
	}
	if (!d || Number.isNaN(d.getTime())) return null
	const months = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
	if (months < 0) return null
	return months < 12 ? `${Math.max(0, Math.round(months))}M` : `${(months / 12).toFixed(1)}Y`
}


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
		openGraph: { title, description, siteName: role },
		twitter: { card: 'summary_large_image', title, description },
	}
}


export default async function Page({ params }: { params: Promise<{ username: string }> }) {
	const { username } = await params

	const profile = await resolveProfile(username)
	if (!profile) notFound()

	const { member, orbatEntry, accent, name, fullRank } = profile

	// Build uniform/box data (also used for the corps badge)
	const uniformData = buildUniformData(member, orbatEntry)
	const boxData     = buildBoxData(member)
	const badge       = uniformData.badge

	// Auto-generate portrait and medal box if stale or missing
	const uniformPath = join(process.cwd(), '..', '..', 'storage', 'milpacs', `${member.id}.png`)
	const medalsPath  = join(process.cwd(), '..', '..', 'storage', 'milpacs', `${member.id}-medals.png`)
	try {
		// The fingerprint covers the artwork; the payload covers the member. A
		// change to either redraws — see computeUniformHash.
		const currentHash = computeUniformHash(uniformData, boxData, await getRenderFingerprint())
		const needsRegen  = currentHash !== member.milpac?.uniformHash
			|| !existsSync(uniformPath)
			|| !existsSync(medalsPath)

		if (needsRegen) {
			const [uniformPng, medalsPng] = await Promise.all([
				renderUniform(uniformData),
				renderBox(boxData),
			])
			await mkdir(dirname(uniformPath), { recursive: true })
			await Promise.all([
				writeFile(uniformPath, uniformPng),
				writeFile(medalsPath, medalsPng),
			])
			await Db.users.updateOne({ username }, { $set: { 'milpac.uniformHash': currentHash } })
		}
	} catch (err) {
		// A page view should never 500 because the render service is down — the
		// previously generated images below are still served if they exist.
		console.error('[milpac] render failed for', username, err)
	}

	const hasUniform = existsSync(uniformPath)
	const hasMedals  = existsSync(medalsPath)

	const me = await client.fetchMe().catch(() => null)
	// /api/milpac/certificate is gated to logged-in members, so the click
	// targets below are only offered to someone who can actually load one.
	const canViewCertificates = me !== null
	// Matches the gate on the page this links to (`members.editStandard`), which
	// a hardcoded ['J5-Media'] check did not — it offered J5-Media users an Edit
	// link to a page that redirected them straight back to /me.
	const canEdit         = me ? client.hasRoles(me, ['J4 - Administration']) : false
	const isOwn           = me?.id === member.id
	const canRequestAward = me !== null && me.id !== member.id && !member.isSkeletonAccount
	const hasCover        = existsSync(join(process.cwd(), '..', '..', 'storage', 'uploads', 'cover', `${member.id}.png`))

	// Fetch confirmed attendance for operation history + stat bar count
	const attendanceDocs = await Db.operationAttendance.find({
		records: { $elemMatch: { userId: member.id, confirmed: true } },
	}).toArray()
	const operationIds = attendanceDocs.map(d => d.operationId)
	const operationsData = operationIds.length > 0
		// Soft-deleted operations were previously shown in public op history.
		? await Db.operations.find({ _id: { $in: operationIds }, deletedAt: { $exists: false } }).toArray()
		: []
	const opMap    = new Map(operationsData.map(o => [String(o._id), o]))
	const seenOpIds = new Set<string>()
	const confirmedOps = attendanceDocs.flatMap(doc => {
		const opId = String(doc.operationId)
		if (seenOpIds.has(opId)) return []
		seenOpIds.add(opId)
		const rec = doc.records.find(r => r.userId === member.id && r.confirmed)
		if (!rec) return []
		const op = opMap.get(opId)
		if (!op) return []
		return [{
			operationId: opId,
			name:        op.title ?? 'Unknown Operation',
			date:        op.date ? new Date(op.date) : null,
			confirmedAt: rec.confirmedAt ? new Date(rec.confirmedAt) : null,
			// Snapshotted per record: where this member sat AT THAT OPERATION,
			// which is what makes the Recent Operations line show progression
			// rather than repeating their current posting.
			unit:        rec.unit ?? null,
			section:     rec.orbatSection ?? null,
			role:        rec.orbatRole ?? null,
			ocap:        op.ocap ?? null,
		}]
	})

	// Promotion points — recalculate live (matches editor logic):
	// non-op points from stored billetCounts + live op points from confirmed attendance
	const liveOpPts = calculateOpPoints(confirmedOps)
	const billetCounts = member.milpac?.billetCounts
	let promotionPts: number
	if (billetCounts) {
		const { calculatePromotionPoints } = await import('@/lib/military/points')
		promotionPts = calculatePromotionPoints({
			...billetCounts,
			primaryNightOps:   0,
			secondaryNightOps: 0,
			awards:         (member.milpac?.awards        ?? []).map(a => ({ name: a.name })),
			qualifications: (member.milpac?.qualifications ?? []).map(q => ({ qualification: q.qualification })),
			j4Points:             member.milpac?.j4Points             ?? 0,
			disciplineDeductions: member.milpac?.disciplineDeductions  ?? 0,
		}) + liveOpPts
	} else {
		promotionPts = (member.milpac?.promotionPoints ?? 0)
	}
	const progress = getPromotionProgress(member.milpac?.currentRank, promotionPts)

	// Enlisted date — prefer stored milpac date, fall back to Discord guild join
	const enlistedDate = member.milpac?.enlistedDate
		|| (member.guild?.joinedTimestamp
			? new Date(member.guild.joinedTimestamp).toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' })
			: null)

	// The SteamID64 is not on the user document; the public join flow stamps the
	// Discord id onto the application that carries it, so it is recoverable for
	// anyone who joined through the site.
	const steamApp = await Db.j1Applications.findOne(
		{ linkedUserId: member.id, steamId64: { $exists: true, $ne: '' } },
		{ sort: { _id: -1 }, projection: { steamId64: 1 } },
	).catch(() => null)

	const awards = member.milpac?.awards ?? []
	const quals  = member.milpac?.qualifications ?? []
	const promotions = member.milpac?.promotions ?? []
	const citations  = awards.filter(a => (a.type ?? '').toLowerCase().includes('citation')).length
	const lastPromotion = promotions.length > 0 ? promotions[promotions.length - 1] : null

	const status  = deriveStatus(Boolean(member.discharged), orbatEntry?.category)
	const platoon = platoonLabel(orbatEntry?.category)
	const months  = bucketByMonth(confirmedOps.map(o => o.date))

	const stats: HeroStat[] = [
		{ value: String(confirmedOps.length), label: 'Operations attended' },
		{ value: durationSince(enlistedDate) ?? '—', label: 'Time in service' },
		{ value: String(awards.length), label: 'Awards & decorations' },
		{ value: String(quals.length), label: 'Qualifications held' },
		{ value: String(promotionPts), unit: 'pts', label: 'Promotion points' },
	]

	const fmtDate = (d: Date) => d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })

	return (
		<div
			className={s.shell}
			// The member's own Discord accent, everything else neutral. ensureVisible
			// lifts a near-black accent off the background; the triplet has to be
			// derived from the same value or the text colour and its tints disagree.
			style={{
				['--acc' as string]: ensureVisible(accent),
				['--acc-rgb' as string]: hexToRgbTriplet(ensureVisible(accent)),
			}}
		>
			<Hero
				memberId={member.id}
				username={username}
				name={name}
				avatarURL={member.avatarURL}
				rankAbbr={member.milpac?.currentRank}
				fullRank={fullRank || '—'}
				role={orbatEntry?.role}
				section={orbatEntry?.section}
				platoon={platoon}
				timezone={member.timezone ?? undefined}
				status={status}
				hasCover={hasCover}
				discordId={member.id}
				steamId64={steamApp?.steamId64}
				stats={stats}
				topbarActions={
					<>
						<a
							className={s.btn}
							href={`https://australianspecialoperationstaskforce.com/${encodeURIComponent(name)}`}
							target='_blank'
							rel='noreferrer noopener'
						>
							View original ↗
						</a>
						{canEdit && <Link className={s.btn} href={`/members/${username}`}>Edit</Link>}
					</>
				}
				bannerActions={isOwn ? <CoverUpload hasCover={hasCover} /> : null}
				identActions={canRequestAward
					? (
						<RequestAwardButton
							targetUserId={member.id}
							targetUserName={name}
							existingAwardNames={awards.map(a => a.name)}
							accent={accent}
						/>
					)
					: null}
			/>

			{progress && !progress.atMax && !progress.billetOnly && (
				<div style={{ padding: '14px var(--pad) 0' }}>
					<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
						<span className={s.lbl} style={{ color: 'var(--acc)' }}>{member.milpac?.currentRank}</span>
						<span className={s.crumb} style={{ margin: 0 }}>{progress.current} / {progress.required} pts</span>
						<span className={s.lbl}>{progress.nextRank}</span>
					</div>
					<div style={{ height: 6, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
						<div style={{
							height: '100%',
							width: `${progress.pct}%`,
							minWidth: progress.pct > 0 ? 6 : 0,
							background: 'var(--acc)',
							boxShadow: '0 0 8px rgba(var(--acc-rgb),0.6)',
						}} />
					</div>
				</div>
			)}

			<div className={s.page}>
				{/* ── main column ─────────────────────────────────────────────── */}
				<div className={s.stack}>

					<Panel title='Personnel Summary' tag={`${member.milpac?.currentRank ?? ''} ${name}`.trim()} delay='.05s'>
						{isOwn
							? <BiographyEditor initial={member.bio?.content ?? null} accent={accent} />
							: member.bio?.content
								? <p className={s.bio}>{member.bio.content}</p>
								: <Empty text='No biography on record.' />}
					</Panel>

					<Panel title='Combat Record' tag='Operations attended · last 12 months' delay='.1s'>
						<MonthChart months={months} />
						<div className={s.substats}>
							<div>
								<div className={s.substatV}>{confirmedOps.length}</div>
								<div className={`${s.lbl} ${s.substatK}`}>Ops attended</div>
							</div>
							<div>
								<div className={s.substatV}>{citations}</div>
								<div className={`${s.lbl} ${s.substatK}`}>Citations</div>
							</div>
							<div>
								<div className={s.substatV}>{durationSince(lastPromotion?.date) ?? '—'}</div>
								<div className={`${s.lbl} ${s.substatK}`}>Time in grade</div>
							</div>
							<div>
								<div className={s.substatV}>{promotionPts}</div>
								<div className={`${s.lbl} ${s.substatK}`}>Promotion points</div>
							</div>
						</div>
					</Panel>

					<Panel title='Recent Operations' tag={confirmedOps.length > 0 ? `${confirmedOps.length} confirmed` : undefined} delay='.15s'>
						{confirmedOps.length === 0
							? <Empty text='No operations on record.' />
							: (
								<ul className={s.tl}>
									{[...confirmedOps]
										.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
										.slice(0, 8)
										.map(op => (
											<li key={op.operationId} className={op.ocap ? s.tlHi : undefined}>
												<div className={s.tlD}>{op.date ? fmtDate(op.date) : 'Date unknown'}</div>
												<div className={s.tlT}>
													<Link href={`/operations/${op.operationId}`}>{op.name}</Link>
												</div>
												{/* The member's posting as at that operation, not now. */}
												{(op.section || op.role) && (
													<div className={s.tlX}>{[op.unit, op.section, op.role].filter(Boolean).join(' · ')}</div>
												)}
											</li>
										))}
								</ul>
							)}
					</Panel>

					<Panel title='Commendations & Remarks' delay='.2s'>
						<Empty text='No commendations on record. Staff write these at the end of an operation.' />
					</Panel>

					<Panel title={`Operation History (${confirmedOps.length})`} delay='.25s'>
						<OperationHistory ops={confirmedOps} />
					</Panel>

				</div>

				{/* ── side column ─────────────────────────────────────────────── */}
				<div className={s.stack}>

					<Panel title='Service Data' delay='.08s'>
						<Rows>
							<Row label='Status' value={status.label} />
							<Row label='Enlisted' value={enlistedDate} />
							<Row label='Time in service' value={durationSince(enlistedDate)} />
							<Row label='Time in grade' value={durationSince(lastPromotion?.date)} />
							<Row label='Rank' value={fullRank || null}>
								{(() => {
									const rankCode = (member.milpac?.currentRank ?? '').replace(/[()]/g, '')
									// Every promotion below is its own click target, so this
									// only appears when nothing down there already offers it.
									const inHistory = promotions.some(p => promotionCertCode(p.rank) === rankCode)
									if (!canViewCertificates || !rankCode || inHistory) return undefined
									return (
										<CertificateViewer
											inline
											label={`Promotion — ${fullRank || rankCode}`}
											accent={accent}
											href={`/api/milpac/certificate/${username}?type=promotion&cert=${encodeURIComponent(rankCode)}`}
										>
											<span>{fullRank} ⤢</span>
										</CertificateViewer>
									)
								})()}
							</Row>
							<Row label='Corps' value={badge} />
							<Row label='Platoon' value={platoon} />
							<Row label='Element' value={orbatEntry?.section} />
							<Row label='Billet' value={orbatEntry?.role} />
							<Row label='Timezone' value={member.timezone} />
							<Row label='Promotion points' value={promotionPts > 0 ? promotionPts : null} />
						</Rows>
					</Panel>

					{hasUniform && (
						<Panel title='Service Dress' delay='.1s' flush>
							<ImageLightbox
								src={`/api/milpacs/${member.id}`}
								alt={`${name} uniform`}
								style={{ width: '100%', height: 'auto', display: 'block' }}
							/>
						</Panel>
					)}

					<Panel title='Awards & Decorations' tag={awards.length > 0 ? String(awards.length) : undefined} delay='.13s'>
						{awards.length === 0 ? <Empty text='No awards on record.' /> : (
							<>
								{hasMedals && (
									<div style={{ marginTop: 14 }}>
										<ImageLightbox
											src={`/api/milpacs/${member.id}?type=medals`}
											alt={`${name} medals`}
											style={{ width: '100%', height: 'auto', display: 'block' }}
										/>
									</div>
								)}
								<div style={{ marginTop: 16, display: 'grid', gap: 8 }}>
									{awards.map((a, i) => {
										const certCode = certificateCodeForAward(a.name)
										const canOpen  = canViewCertificates && Boolean(certCode)
										const citation = AWARD_TO_CITATION[a.name]
										const medallion = MEDALLION_ART[a.name]
										const row = (
											<div className={s.rw} style={{ alignItems: 'center' }}>
												{/* Fixed-width slot so ribbons, medallions and
												    awards with no artwork all line up down the
												    left edge rather than ragging. */}
												<span style={{ width: 58, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
													{citation
														? (
															<img
																src={`/milpac-assets/imge/Ribbons/${citation}.png`}
																alt=''
																style={{ width: 58, height: 18, objectFit: 'contain', imageRendering: 'pixelated' }}
															/>
														)
														: medallion
															? <MedallionIcon art={medallion} alt='' size={22} />
															: null}
												</span>
												<span style={{ flex: 1, minWidth: 0 }}>
													<span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--ink)' }}>{a.name}</span>
													<span className={s.cmdType} style={{ marginLeft: 8 }}>{a.type}</span>
													{a.issuedByName && (
														<span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--ink-3)', marginTop: 2 }}>
															Issued by {a.issuedByName}
														</span>
													)}
												</span>
												<span className={s.rwV} style={{ whiteSpace: 'nowrap' }}>
													{a.date ?? ''}{canOpen ? ' ⤢' : ''}
												</span>
											</div>
										)
										return canOpen ? (
											<CertificateViewer
												key={i}
												label={a.name}
												accent={accent}
												href={`/api/milpac/certificate/${username}?type=award&cert=${encodeURIComponent(certCode!)}`}
											>
												{row}
											</CertificateViewer>
										) : <div key={i}>{row}</div>
									})}
								</div>
							</>
						)}
					</Panel>

					<Panel title='Qualifications' tag={quals.length > 0 ? String(quals.length) : undefined} delay='.18s'>
						{quals.length === 0 ? <Empty text='No qualifications on record.' /> : (
							<div style={{ display: 'grid', gap: 8 }}>
								{quals.map((q, i) => {
									const badgeCode = QUAL_TO_BADGE[q.qualification]
									const badgeImg  = badgeCode ? trainingBadgeUrl(badgeCode) : null
									return (
										<div key={i} className={s.rw} style={{ alignItems: 'center' }}>
											<span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
												{badgeImg && (
													<img src={badgeImg} alt='' title={q.qualification} style={{ width: 26, height: 26, objectFit: 'contain', flexShrink: 0 }} />
												)}
												<span style={{ minWidth: 0 }}>
													<span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)' }}>{q.qualification}</span>
													{q.issuedByName && (
														<span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--ink-3)', marginTop: 2 }}>
															Issued by {q.issuedByName}
														</span>
													)}
												</span>
											</span>
											<span className={s.rwV} style={{ whiteSpace: 'nowrap' }}>{q.date}</span>
										</div>
									)
								})}
							</div>
						)}
					</Panel>

					<Panel title='Promotion History' tag={promotions.length > 0 ? String(promotions.length) : undefined} delay='.2s'>
						{promotions.length === 0 ? <Empty text='No promotion history on record.' /> : (
							<Rows>
								{promotions.map((p, i) => (
									<div key={i} className={s.rw} style={{ alignItems: 'flex-start' }}>
										<span style={{ minWidth: 0 }}>
											<span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)' }}>{p.rank}</span>
											{p.role && (
												<span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--ink-2)', marginTop: 2 }}>{p.role}</span>
											)}
											{p.issuedByName && (
												<span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--ink-3)', marginTop: 2 }}>
													Issued by {p.issuedByName}
												</span>
											)}
										</span>
										<span className={s.rwV} style={{ whiteSpace: 'nowrap' }}>
											{canViewCertificates ? (
												<CertificateViewer
													inline
													label={`Promotion — ${p.rank}`}
													accent={accent}
													href={`/api/milpac/certificate/${username}?type=promotion&cert=${encodeURIComponent(promotionCertCode(p.rank))}`}
												>
													<span title='View certificate'>{p.date} ⤢</span>
												</CertificateViewer>
											) : p.date}
										</span>
									</div>
								))}
							</Rows>
						)}
					</Panel>

					<Panel title='Assigned Loadout' tag='Standard' delay='.23s'>
						<Empty text='No loadout on record. Kit is imported from Arma.' />
					</Panel>

				</div>
			</div>

			<div className={s.foot}>
				<span>Unclassified // For unit use only</span>
				<span>{username}</span>
			</div>
		</div>
	)
}


/**
 * Confirmed operations, grouped by base name so a weekend run that ran as
 * "Op Foo — Sat" and "Op Foo — Sun" reads as one entry with a ×2 badge rather
 * than two rows.
 */
function OperationHistory({ ops }: {
	ops: { operationId: string; name: string; date: Date | null }[]
}) {
	function baseName(n: string): string {
		return n
			.replace(/\s*[-–—]\s*(sat|sun|night|day|part|session)(\s*\d+)?\s*$/gi, '')
			.replace(/\s+(sat|sun|night|day|part|session)(\s*\d+)?\s*$/gi, '')
			.replace(/\s+\d+\s*$/g, '')
			.replace(/\s+[IVXLC]+\s*$/i, '')
			.replace(/\s*[-–—]\s*$/g, '')
			.trim()
	}
	const fmtDate = (d: Date) => d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })

	const groups = new Map<string, { dates: Date[]; ops: typeof ops }>()
	for (const op of ops) {
		const key = baseName(op.name)
		if (!groups.has(key)) groups.set(key, { dates: [], ops: [] })
		const g = groups.get(key)!
		if (op.date) g.dates.push(op.date)
		g.ops.push(op)
	}
	const grouped = Array.from(groups.entries())
		.map(([n, g]) => ({ name: n, ...g }))
		.sort((a, b) => {
			const aMax = a.dates.length ? Math.max(...a.dates.map(d => d.getTime())) : 0
			const bMax = b.dates.length ? Math.max(...b.dates.map(d => d.getTime())) : 0
			return bMax - aMax
		})

	if (grouped.length === 0) return <Empty text='No operations on record.' />

	return (
		<Rows>
			{grouped.map(g => {
				const sorted = [...g.dates].sort((a, b) => a.getTime() - b.getTime())
				const range = sorted.length === 0 ? '—'
					: sorted.length === 1 ? fmtDate(sorted[0])
					: `${fmtDate(sorted[0])} – ${fmtDate(sorted[sorted.length - 1])}`

				if (g.ops.length === 1) return (
					<div key={g.name} className={s.rw}>
						<Link href={`/operations/${g.ops[0].operationId}`} style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', fontWeight: 600 }}>
							{g.name}
						</Link>
						<span className={s.rwV} style={{ whiteSpace: 'nowrap' }}>{range}</span>
					</div>
				)

				return (
					<details key={g.name} className={s.rw} style={{ display: 'block' }}>
						<summary style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', listStyle: 'none' }}>
							<span style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', fontWeight: 600 }}>{g.name}</span>
							<span className={s.rwV} style={{ whiteSpace: 'nowrap' }}>{range}</span>
							<span className={s.cmdType}>×{g.ops.length}</span>
						</summary>
						<div style={{ display: 'grid', paddingLeft: 12, paddingTop: 6 }}>
							{[...g.ops]
								.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))
								.map(op => (
									<Link
										key={op.operationId}
										href={`/operations/${op.operationId}`}
										style={{ display: 'flex', gap: 8, padding: '4px 0', fontSize: '0.76rem', color: 'var(--ink-2)' }}
									>
										<span style={{ flex: 1, minWidth: 0 }}>{op.name}</span>
										{op.date && <span className={s.rwV}>{fmtDate(op.date)}</span>}
									</Link>
								))}
						</div>
					</details>
				)
			})}
		</Rows>
	)
}
