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
import Image from 'next/image'
import Avatar from '@/components/member/avatar'
import Banner from '@/public/images/home/Droneteam7.png'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import { getOrbatEntryByUserId } from '@/lib/orbat'
import { resolveMilpacProfile } from '@/lib/military/milpac-profile'
import { CoverUpload } from './cover-upload'
import { BiographyEditor } from './bio-editor'
import { RequestAwardButton } from './RequestAwardButton'
import { ImageLightbox } from './image-lightbox'
import { CertificateViewer } from './certificate-link'


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

// ── Soldiers Medallions ──────────────────────────────────────────────────────

/**
 * The three Soldiers Medallions are chest medallions, not ribbons, so they have
 * no `AWARD_TO_CITATION` entry and the awards list drew an empty box for them.
 *
 * Their only artwork is a full-canvas 1398x1000 uniform layer with the medallion
 * sitting in one of three chest slots — there is no standalone icon anywhere in
 * the asset tree. Rather than add one (a generated asset to keep in step with
 * the layer it was cut from), the layer is cropped to the medallion in CSS. The
 * `2` variant is the centre slot; the suffix only shifts X, so which one is used
 * is arbitrary as long as the offset matches.
 */
const MEDALLION_ART: Record<string, string> = {
	'Bronze Soldiers Medallion': 'Bronze2',
	'Silver Soldiers Medallion': 'Silver2',
	'Gold Soldiers Medallion':   'Gold2',
}

/** Where the medallion sits in the 1398x1000 layer, measured off its alpha channel. */
const MEDALLION_CROP = { x: 510, y: 356, w: 36, h: 35, canvasW: 1398, canvasH: 1000 }

function MedallionIcon({ art, alt, size }: { art: string; alt: string; size: number }) {
	const scale = size / MEDALLION_CROP.h
	return (
		<span style={{
			display: 'block', width: size, height: size, flexShrink: 0,
			position: 'relative', overflow: 'hidden',
		}}>
			<img
				src={`/milpac-assets/imge/Medallions/${art}.png`}
				alt={alt}
				title={alt}
				style={{
					position: 'absolute',
					width: MEDALLION_CROP.canvasW * scale,
					height: MEDALLION_CROP.canvasH * scale,
					left: -(MEDALLION_CROP.x + (MEDALLION_CROP.w - MEDALLION_CROP.h) / 2) * scale,
					top: -MEDALLION_CROP.y * scale,
					maxWidth: 'none',
				}}
			/>
		</span>
	)
}

// ── Promotion progress helper ─────────────────────────────────────────────────
function getPromotionProgress(currentRankAbbr: string | undefined, points: number) {
	if (!currentRankAbbr) return null
	const track = RANK_TRACKS.find(t => t.ranks.some(r => r.abbr === currentRankAbbr))
	if (!track) return null
	const idx = track.ranks.findIndex(r => r.abbr === currentRankAbbr)
	const current = track.ranks[idx]
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

	const { member, orbatEntry, accent, name, fullRank, callsign } = profile

	// Build uniform/box data (also used for badge display)
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
	const canEdit         = me ? client.hasRoles(me, ['J5-Media']) : false
	const isOwn           = me?.id === member.id
	const canRequestAward = me !== null && me.id !== member.id && !member.isSkeletonAccount
	const hasCover        = existsSync(join(process.cwd(), '..', '..', 'storage', 'uploads', 'cover', `${member.id}.png`))

	// Fetch confirmed attendance for operation history + stat bar count
	const attendanceDocs = await Db.operationAttendance.find({
		records: { $elemMatch: { userId: member.id, confirmed: true } },
	}).toArray()
	const operationIds = attendanceDocs.map(d => d.operationId)
	const operationsData = operationIds.length > 0
		? await Db.operations.find({ _id: { $in: operationIds } }).toArray()
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
		return [{
			operationId: opId,
			name:        op?.title ?? 'Unknown Operation',
			date:        op?.date ? new Date(op.date) : null,
			confirmedAt: rec.confirmedAt ? new Date(rec.confirmedAt) : null,
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
			: '—')

	return (
		<div style={{ background: 'rgb(10,10,10)', color: 'rgba(237,237,237,0.9)', minHeight: '100vh' }}>
			<style>{`
				.milpac-grid    { display: grid; grid-template-columns: 1fr; gap: 2rem; align-items: start; }
				.milpac-sidebar { display: flex; flex-direction: column; gap: 1.5rem; }
				@media (min-width: 960px) {
					.milpac-grid    { grid-template-columns: 500px 1fr; }
					.milpac-sidebar { position: sticky; top: 2rem; }
				}
				@media (min-width: 1300px) {
					.milpac-grid { grid-template-columns: 580px 1fr; }
				}
				.milpac-stat-bar { display: flex; flex-wrap: wrap; justify-content: center; gap: 0; }
				.milpac-stat-item { display: flex; flex-direction: column; gap: 2px; padding: 10px 24px; border-right: 1px solid rgba(255,255,255,0.07); }
				.milpac-stat-item:last-child { border-right: none; }
			`}</style>

			{/* ── Hero banner ──────────────────────────────────────────────────── */}
			<div className='relative w-full h-banner-sm md:h-banner-sm-md overflow-hidden' style={{ minHeight: 280 }}>
				{/* Background image */}
				{hasCover ? (
					<img src={`/api/uploads/cover?id=${member.id}&t=${Date.now()}`} alt='Cover' style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }} />
				) : (
					<Image src={Banner} alt='Banner' fill className='object-cover object-center' loading='eager' />
				)}
				{isOwn && <CoverUpload hasCover={hasCover} />}

				{/* Gradient overlays */}
				<div className='absolute inset-0' style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.1) 100%)' }} />
				<div className='absolute inset-0' style={{ background: `linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 40%, rgba(10,10,10,0.7) 80%, #0a0a0a 100%)` }} />

				{/* Action buttons — top left */}
				<div style={{ position: 'absolute', top: 16, left: 20, zIndex: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
					<Link href='/milpacs' style={{
						display: 'inline-flex', alignItems: 'center', gap: 6,
						fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
						color: 'rgba(237,237,237,0.55)', textDecoration: 'none',
						padding: '5px 11px', border: '1px solid rgba(255,255,255,0.1)',
						background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
					}}>
						← Milpacs
					</Link>
					{canEdit && (
						<Link href={`/members/${username}`} style={{
							display: 'inline-flex', alignItems: 'center', gap: 6,
							fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
							color: 'rgba(237,237,237,0.55)', textDecoration: 'none',
							padding: '5px 11px', border: '1px solid rgba(255,255,255,0.1)',
							background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
						}}>
							Edit
						</Link>
					)}
					<a
						href={`https://www.australianspecialoperationstaskforce.com/${name.toLocaleLowerCase()}`}
						target='_blank' rel='noopener noreferrer'
						style={{
							display: 'inline-flex', alignItems: 'center', gap: 6,
							fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
							color: `${accent}cc`, textDecoration: 'none',
							padding: '5px 11px', border: `1px solid ${accent}35`,
							background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)',
						}}
					>
						View Original ↗
					</a>
				</div>

				{/* Main hero content — bottom left */}
				<div style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
					{/* Member identity — centred */}
					<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '0 2rem 1.5rem', textAlign: 'center' }}>
						{/* Avatar */}
						<div style={{ position: 'relative', width: 100, height: 100, borderRadius: '50%', padding: 3, background: `linear-gradient(135deg, ${accent}cc, rgba(237,237,237,0.08))`, flexShrink: 0 }}>
							<div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: 'rgb(13,13,13)' }}>
								{/* Only what Avatar reads — passing the whole document sends
								    ObjectIds into a client component, which React warns about. */}
								<Avatar user={{ id: member.id, avatarURL: member.avatarURL }} />
							</div>
						</div>

						{/* Name + rank + role */}
						<div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
							{fullRank && (
								<span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: `${accent}ee`, background: 'rgba(0,0,0,0.5)', padding: '2px 10px', backdropFilter: 'blur(4px)' }}>
									{fullRank}
								</span>
							)}
							<h1 style={{ margin: 0, fontSize: 'clamp(1.8rem, 4vw, 3rem)', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', lineHeight: 1, textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}>
								{name}
							</h1>
							{(orbatEntry?.role || callsign) && (
								<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
									{orbatEntry?.role && (
										<span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.5)' }}>
											{orbatEntry.role}
										</span>
									)}
									{callsign && orbatEntry?.role && <span style={{ width: 3, height: 3, borderRadius: '50%', background: `${accent}80`, display: 'inline-block' }} />}
									{callsign && (
										<span style={{ fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: `${accent}bb` }}>
											{callsign}
										</span>
									)}
								</div>
							)}
						</div>

						{/* Award request button */}
						{canRequestAward && (
							<RequestAwardButton
								targetUserId={member.id}
								targetUserName={name}
								existingAwardNames={(member.milpac?.awards ?? []).map(a => a.name)}
								accent={accent}
							/>
						)}
					</div>

					{/* Stat bar */}
					<div style={{ borderTop: `1px solid rgba(255,255,255,0.07)`, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(12px)' }}>
						<div style={{ maxWidth: 680, margin: '0 auto' }}>
							<div className='milpac-stat-bar'>
								{[
									{ label: 'Enlisted',   value: enlistedDate },
									{ label: 'Rank',       value: member.milpac?.currentRank || '—' },
									{ label: 'Operations', value: String(confirmedOps.length) },
									{ label: 'Section',    value: orbatEntry?.section ?? '—' },
								].map(stat => (
									<div key={stat.label} className='milpac-stat-item'>
										<span style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: `${accent}99` }}>{stat.label}</span>
										<span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'rgba(237,237,237,0.85)', letterSpacing: '0.04em' }}>{stat.value}</span>
									</div>
								))}
							</div>

							{/* Promotion progress */}
							{progress && !progress.atMax && !progress.billetOnly && (
								<div style={{ padding: '0 24px 10px' }}>
									<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
										<span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: accent }}>
											{member.milpac?.currentRank}
										</span>
										<span style={{ fontSize: '0.55rem', fontWeight: 600, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.05em' }}>
											{progress.current} / {progress.required} pts
										</span>
										<span style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)' }}>
											{progress.nextRank}
										</span>
									</div>
									<div style={{ height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
										<div style={{ height: '100%', width: `${progress.pct}%`, minWidth: progress.pct > 0 ? 6 : 0, borderRadius: 3, background: accent, boxShadow: `0 0 8px ${accent}99` }} />
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</div>

			{/* ── Main content ─────────────────────────────────────────────────── */}
			<div style={{ maxWidth: 1440, margin: '0 auto', padding: '2rem 1.5rem' }}>
				<div className='milpac-grid'>

					{/* ── Left sidebar: uniform + medals ───────────────────── */}
					<div className='milpac-sidebar'>
						{hasUniform && (
							<div style={{ borderRadius: 6, border: `1px solid rgba(255,255,255,0.06)`, borderTop: `2px solid ${accent}60`, background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
								{/* Bottom padding here rather than on the image: the medals card
								    below gets its gap from the image's own inset, which the
								    uniform deliberately does not have — it runs edge to edge. */}
								<div style={{ padding: '0.75rem 1rem 0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
									<span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: `${accent}99` }}>Uniform</span>
								</div>
								<ImageLightbox
									src={`/api/milpacs/${member.id}`}
									alt={`${name} uniform`}
									style={{ width: '100%', height: 'auto', display: 'block' }}
								/>
							</div>
						)}
						{hasMedals && (
							<div style={{ borderRadius: 6, border: `1px solid rgba(255,255,255,0.06)`, borderTop: `2px solid ${accent}60`, background: 'rgba(255,255,255,0.02)', overflow: 'hidden' }}>
								<div style={{ padding: '0.75rem 1rem 0' }}>
									<span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: `${accent}99` }}>Medals</span>
								</div>
								<ImageLightbox
									src={`/api/milpacs/${member.id}?type=medals`}
									alt={`${name} medals`}
									style={{ width: '100%', height: 'auto', display: 'block', padding: '0.5rem' }}
								/>
							</div>
						)}
					</div>

					{/* ── Right column: all sections ───────────────────────── */}
					<div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

						{/* Biography */}
						<Section accent={accent} title='Biography'>
							{isOwn ? (
								<BiographyEditor initial={member.bio?.content ?? null} accent={accent} />
							) : member.bio?.content ? (
								<p style={{ margin: 0, lineHeight: 1.8, color: 'rgba(237,237,237,0.65)', fontSize: '0.88rem', overflowWrap: 'break-word', wordBreak: 'break-word' }}>
									{member.bio.content}
								</p>
							) : (
								<Placeholder text='No biography on record.' />
							)}
						</Section>

						{/* Service Record */}
						<Section accent={accent} title='Service Record'>
							<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
								<tbody>
									<Row label='Status' value='Active' />
									<Row label='Enlisted' value={enlistedDate} />
									{/* Every promotion in the history below is its own click
									    target, so this one only appears when nothing down there
									    already offers it — a CSV-imported member with a rank and
									    no history behind it. */}
									<Row label='Rank' value={fullRank || '—'} action={(() => {
										const rankCode = (member.milpac?.currentRank ?? '').replace(/[()]/g, '')
										if (!canViewCertificates || !rankCode) return null
										const inHistory = (member.milpac?.promotions ?? [])
											.some(p => promotionCertCode(p.rank) === rankCode)
										if (inHistory) return null
										return (
											<CertificateViewer
												inline
												label={`Promotion — ${fullRank || rankCode}`}
												accent={accent}
												href={`/api/milpac/certificate/${username}?type=promotion&cert=${encodeURIComponent(rankCode)}`}
											>
												<span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `${accent}bb`, padding: '1px 7px', border: `1px solid ${accent}40`, background: `${accent}10` }}>
													Certificate ⤢
												</span>
											</CertificateViewer>
										)
									})()} />
									<Row label='Points' value={promotionPts > 0 ? String(promotionPts) : '—'} />
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
													{canViewCertificates && <th style={{ ...thStyle, width: 28 }}></th>}
												</tr>
											</thead>
											<tbody>
												{member.milpac!.promotions!.map((p, i) => (
													<tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
														<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem', width: 130 }}>{p.date}</td>
														<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.75)', fontWeight: 600 }}>{p.rank}</td>
														<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.5)' }}>{p.role}</td>
														{showIssuedBy && <td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.3)', fontSize: '0.75rem' }}>{p.issuedByName || '—'}</td>}
														{/* A trigger cell rather than a clickable row: a <tr> cannot
														    live inside a <button>, and the awards list is a flex
														    column precisely because it can. A rank with no
														    certificate slide fails its first render and the viewer
														    drops back to plain text. */}
														{canViewCertificates && (
															<td style={{ padding: '7px 0', textAlign: 'right' }}>
																<CertificateViewer
																	inline
																	label={`Promotion — ${p.rank}`}
																	accent={accent}
																	href={`/api/milpac/certificate/${username}?type=promotion&cert=${encodeURIComponent(promotionCertCode(p.rank))}`}
																>
																	<span title='View certificate' style={{ fontSize: '0.7rem', color: `${accent}88`, padding: '0 2px' }}>⤢</span>
																</CertificateViewer>
															</td>
														)}
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

						{/* Qualifications */}
						<Section accent={accent} title='Qualifications'>
							{member.milpac?.qualifications && member.milpac.qualifications.length > 0 ? (() => {
								const showIssuedBy = member.milpac!.qualifications!.some(q => q.issuedByName)
								const thStyle: React.CSSProperties = { padding: '6px 0', textAlign: 'left', color: 'rgba(237,237,237,0.25)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.65rem', borderBottom: '1px solid rgba(255,255,255,0.06)' }
								return (
									<table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
										<thead>
											<tr>
												<th style={{ ...thStyle, width: 36 }}></th>
												<th style={thStyle}>Date</th>
												<th style={thStyle}>Qualification</th>
												{showIssuedBy && <th style={thStyle}>Issued By</th>}
											</tr>
										</thead>
										<tbody>
											{member.milpac!.qualifications!.map((q, i) => {
												const badgeCode = QUAL_TO_BADGE[q.qualification]
												const badgeImg  = badgeCode ? trainingBadgeUrl(badgeCode) : null
												return (
													<tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
														<td style={{ padding: '6px 8px 6px 0' }}>
															{badgeImg && (
																<img src={badgeImg} alt={badgeCode} title={q.qualification} style={{ width: 28, height: 28, objectFit: 'contain', display: 'block' }} />
															)}
														</td>
														<td style={{ padding: '7px 8px 7px 0', color: 'rgba(237,237,237,0.4)', fontSize: '0.75rem', width: 120 }}>{q.date}</td>
														<td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.75)', fontWeight: 600 }}>{q.qualification}</td>
														{showIssuedBy && <td style={{ padding: '7px 0', color: 'rgba(237,237,237,0.3)', fontSize: '0.75rem' }}>{q.issuedByName || '—'}</td>}
													</tr>
												)
											})}
										</tbody>
									</table>
								)
							})() : (
								<Placeholder text='No qualifications on record.' />
							)}
						</Section>

						{/* Awards & Citations — each row that has a matching certificate
						    slide opens it full-screen. The certificate is rendered on
						    demand by the milpac service and never persisted, so nothing
						    is fetched until the viewer actually clicks a row. */}
						<Section accent={accent} title='Awards & Citations'>
							{member.milpac?.awards && member.milpac.awards.length > 0 ? (
								<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
									{member.milpac.awards.map((a, i) => {
										const citation = AWARD_TO_CITATION[a.name]
										const medallion = MEDALLION_ART[a.name]
										const certCode = certificateCodeForAward(a.name)
										// Certificates are for logged-in members (the route is
										// gated), so an anonymous visitor gets the plain row
										// rather than a click target that 401s.
										const canOpen  = canViewCertificates && Boolean(certCode)

										const row = (
											<div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
												{citation ? (
													<img
														src={`/milpac-assets/imge/Ribbons/${citation}.png`}
														alt={a.name}
														title={a.name}
														style={{ width: 64, height: 20, objectFit: 'contain', flexShrink: 0, imageRendering: 'pixelated' }}
													/>
												) : medallion ? (
													// Centred in a 64-wide slot so medallions line up with
													// the ribbons above and below them in the list.
													<span style={{ width: 64, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
														<MedallionIcon art={medallion} alt={a.name} size={26} />
													</span>
												) : (
													<div style={{ width: 64, height: 20, flexShrink: 0, background: `${accent}18`, border: `1px solid ${accent}30`, borderRadius: 2 }} />
												)}
												<div style={{ flex: 1, minWidth: 0 }}>
													<div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
														<span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'rgba(237,237,237,0.8)' }}>{a.name}</span>
														<span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `${accent}bb`, padding: '1px 7px', border: `1px solid ${accent}40`, background: `${accent}10`, flexShrink: 0 }}>
															{a.type}
														</span>
													</div>
													{a.issuedByName && (
														<div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', marginTop: 2 }}>
															Issued by {a.issuedByName}
														</div>
													)}
												</div>
												{a.date && (
													<span style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.3)', whiteSpace: 'nowrap', flexShrink: 0 }}>{a.date}</span>
												)}
												{canOpen && (
													<span title='View certificate' style={{ fontSize: '0.7rem', color: `${accent}88`, flexShrink: 0 }}>⤢</span>
												)}
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
										) : (
											<div key={i}>{row}</div>
										)
									})}
								</div>
							) : (
								<Placeholder text='No awards on record.' />
							)}
						</Section>

						{/* Operation History */}
						{(() => {
							function baseName(n: string): string {
								return n
									.replace(/\s*[-–—]\s*(sat|sun|night|day|part|session)(\s*\d+)?\s*$/gi, '')
									.replace(/\s+(sat|sun|night|day|part|session)(\s*\d+)?\s*$/gi, '')
									.replace(/\s+\d+\s*$/g, '')
									.replace(/\s+[IVXLC]+\s*$/i, '')
									.replace(/\s*[-–—]\s*$/g, '')
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
								.map(([n, g]) => ({ name: n, ...g }))
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
			</div>
		</div>
	)
}


function Section({ accent, title, children }: { accent: string; title: string; children: React.ReactNode }) {
	return (
		<div style={{
			padding: 'clamp(1.1rem, 3vw, 1.5rem)',
			borderRadius: 6,
			border: `1px solid rgba(255,255,255,0.06)`,
			borderLeft: `2px solid ${accent}80`,
			background: 'rgba(255,255,255,0.02)',
			display: 'flex',
			flexDirection: 'column',
			gap: '1rem',
		}}>
			<h2 style={{ margin: 0, fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: `${accent}cc` }}>
				{title}
			</h2>
			{children}
		</div>
	)
}

function Row({ label, value, action }: { label: string; value: string; action?: React.ReactNode }) {
	return (
		<tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
			<td style={{ padding: '8px 0', color: 'rgba(237,237,237,0.35)', width: 140, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '0.68rem' }}>
				{label}
			</td>
			<td style={{ padding: '8px 0', color: 'rgba(237,237,237,0.75)' }}>
				<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
					{value}
					{action}
				</span>
			</td>
		</tr>
	)
}

function Placeholder({ text }: { text: string }) {
	return (
		<p style={{ margin: 0, fontSize: '0.75rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic', letterSpacing: '0.05em' }}>
			{text}
		</p>
	)
}
