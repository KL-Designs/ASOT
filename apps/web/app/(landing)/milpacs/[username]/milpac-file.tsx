import type { Metadata, Viewport } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { renderUniform, renderBox, getRenderFingerprint } from '@/lib/milpac-gen/client'
import { buildUniformData, buildBoxData, computeUniformHash } from '@/lib/milpac-gen/data-mapper'
import { AWARD_TO_CITATION } from '@/lib/milpac-gen/maps'
import { certificateCodeForCitation, MEDALLION_CERTIFICATE_CODES, rankAbbrFromName } from '@asot/lib'
import { deriveStatus, platoonLabel } from '@/lib/military/milpac-status'
import { ensureVisible, hexToRgbTriplet } from '@/lib/discord/color'
import client from '@/lib/discord'
import Db from '@/lib/mongo'
import PERMISSIONS from '@/lib/permissions'
import { getOrbatEntryByUserId } from '@/lib/orbat'
import { resolveMilpacProfile } from '@/lib/military/milpac-profile'
import { hasCover as memberHasCover } from '@/lib/military/milpac-cover'
import { resolveSegment } from '@/lib/military/milpac-slug'
import { loadConfirmedOps, resolvePromotionPoints, resolveEnlistedDate, durationSince, getPromotionProgress } from '@/lib/military/milpac-stats'
import { CoverUpload } from './cover-upload'
import { BiographyEditor } from './bio-editor'
import { RequestAwardButton } from './RequestAwardButton'
import { ImageLightbox } from './image-lightbox'
import { CertificateViewer } from './certificate-link'
import { Hero, type HeroStat } from './hero'
import { EditMilpacButton } from './edit-milpac'
import { Panel, Rows, Row, Empty, MedallionIcon, MEDALLION_ART, MonthChart, bucketByMonth } from './panels'
import { LoadoutPanel } from './loadout-panel'
import { MilpacTabs } from './tabs'
import { tabSuffix, type MilpacTab } from '@/lib/military/milpac-tabs'
import { pickLoadoutId } from '@/lib/loadout/select'
import { kitIcon } from '@/lib/loadout/kit-icons'
import { normaliseTags } from '@/lib/loadout/tags'
import { LoadoutManager } from './loadout-manager'
import RankProgress from '@/components/ui/RankProgress'
import s from './profile.module.css'


// Training badge artwork is deliberately not rendered in the qualifications
// list. The only assets are 1398x1000 full-uniform layers — the badge occupies
// roughly one percent of the canvas — so drawn at list size they appear as an
// invisible speck while still indenting the row, which left qualifications with
// a badge misaligned against those without. They need the crop-a-known-region
// treatment MedallionIcon uses, and nobody has measured the regions yet.
// See docs/superpowers/specs/2026-08-17-milpac-redesign-design.md, risk R6.

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

async function resolveProfile(segment: string) {
	const allMembers = await client.fetchAllMembers()
	const target = resolveSegment(segment, allMembers)
	if (!target) return null
	const orbatEntry = await getOrbatEntryByUserId(target.member.id)
	return {
		member: target.member,
		canonical: target.canonical,
		...resolveMilpacProfile(target.member, orbatEntry),
	}
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


/**
 * The whole personnel file. Rendered by four thin route files — `page.tsx`,
 * `record/page.tsx`, `kits/page.tsx` and `kits/[kit]/page.tsx` — rather than by
 * one route reading `?tab=`.
 *
 * That split is not cosmetic. The App Router aborts a navigation that changes
 * only the query string on the same path: the segment tree is unchanged, so the
 * router cancels the RSC fetch and commits nothing, silently. Measured against
 * production, a `?tab=` link needed 2-8 clicks to commit while ordinary links to
 * a different path committed on the first, every time. Putting the section in
 * the path makes each tab a real route change, which is the case that works.
 */
export async function MilpacFile({ segment, tab, kitSegment }: {
	segment: string
	tab: MilpacTab
	/** The `kits/[kit]` segment, when one was addressed. */
	kitSegment?: string
}) {
	const profile = await resolveProfile(segment)
	if (!profile) notFound()

	// Temporary, not permanent: the canonical segment is derived from a Discord
	// nickname, so it moves when the nickname does. A 308 would be cached by
	// browsers indefinitely with no way to invalidate it. The section is carried
	// across, so a shared link to a tab lands on that tab after the redirect.
	if (profile.canonical !== segment) redirect(`/milpacs/${profile.canonical}${tabSuffix(tab, kitSegment)}`)

	const { member, orbatEntry, accent, name, fullRank } = profile

	// The URL segment may now be a name slug, but everything below keys on the
	// Discord username — the uniformHash write, the certificate routes and the
	// editor's /api/members calls all look members up by it.
	const username = member.username

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
	// The same keys the editor itself enforces. A hardcoded ['J5-Media'] check
	// used to offer an Edit link to users the editor would then reject.
	const canEditStandard   = me ? client.hasRoles(me, PERMISSIONS.members.editStandard)   : false
	const canEditRestricted = me ? client.hasRoles(me, PERMISSIONS.members.editRestricted) : false
	const canEdit           = canEditStandard
	const isOwn           = me?.id === member.id
	const canRequestAward = me !== null && me.id !== member.id && !member.isSkeletonAccount
	const hasCover        = memberHasCover(member.id)

	// Confirmed attendance drives both the operation history panel and the stat bar.
	const confirmedOps = await loadConfirmedOps(member.id)

	const promotionPts = resolvePromotionPoints(member, confirmedOps)
	const progress = getPromotionProgress(member.milpac?.currentRank, promotionPts)

	const enlistedDate = resolveEnlistedDate(member)

	// The SteamID64 is not on the user document; the public join flow stamps the
	// Discord id onto the application that carries it, so it is recoverable for
	// anyone who joined through the site.
	const steamApp = await Db.j1Applications.findOne(
		{ linkedUserId: member.id, steamId64: { $exists: true, $ne: '' } },
		{ sort: { _id: -1 }, projection: { steamId64: 1 } },
	).catch(() => null)

	const allLoadouts = await Db.loadouts.find({ userId: member.id }).sort({ updatedAt: -1 }).toArray()

	// A private kit is the member's own business. It is filtered out here rather
	// than hidden in the component, so another visitor's browser never receives
	// its name, its description or its export string — and `?kit=<private id>`
	// cannot reach it either, because everything downstream reads this list.
	const loadouts = allLoadouts.filter(l => isOwn || l.shared)

	// `raw` is the ACE export the copy button hands out. Every row here is either
	// public or the viewer's own, so it travels for all of them.
	const loadoutList = loadouts.map(l => ({
		id: String(l._id),
		name: l.name,
		description: l.description ?? '',
		icon: kitIcon(l.icon),
		tags: normaliseTags(l.tags),
		isDefault: l.isDefault,
		shared: l.shared,
		raw: l.raw,
	}))

	// The /kits/<id> segment picks which one to render; without it, the default.
	const activeLoadoutId = pickLoadoutId(kitSegment, loadoutList)
	const activeLoadout = loadouts.find(l => String(l._id) === activeLoadoutId) ?? null

	// The viewer's own rating, for the control's initial state. Only ever their
	// own row: nothing here reads, or could read, who else rated it.
	const myRating = activeLoadout && me && !isOwn
		? await Db.loadoutRatings.findOne(
			{ loadoutId: activeLoadout._id, userId: me.id },
			{ projection: { stars: 1 } },
		)
		: null

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
			className={`command ${s.shell}`}
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
				canonicalPath={`/milpacs/${profile.canonical}`}
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
				topbarActions={canEdit
					? (
						<EditMilpacButton
							username={username}
							canEditRestricted={canEditRestricted}
							canEditStandard={canEditStandard}
						/>
					)
					: null}
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

			<MilpacTabs active={tab} basePath={`/milpacs/${profile.canonical}`} />

			{/* Who this member is, and what they have been doing lately. */}
			{tab === 'overview' && (
				<div className={`${s.page} ${s.pageLead}`}>
					<div className={s.stack}>
						{/* Shared with the navbar account menu — see components/ui/RankProgress. */}
						<RankProgress currentRank={member.milpac?.currentRank} progress={progress} accent='var(--acc)' />
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
					</div>

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

						{/* Under the service data rather than beside it: the uniform is
						    the picture the facts above describe. */}
						{hasUniform && (
							<Panel title='Service Dress' delay='.1s' flush>
								<ImageLightbox
									src={`/api/milpacs/${member.id}`}
									alt={`${name} uniform`}
									style={{ width: '100%', height: 'auto', display: 'block' }}
								/>
							</Panel>
						)}

						{hasMedals && (
							<Panel title='Medal Box' delay='.14s' flush>
								<ImageLightbox
									src={`/api/milpacs/${member.id}?type=medals`}
									alt={`${name} medals`}
									style={{ width: '100%', height: 'auto', display: 'block' }}
								/>
							</Panel>
						)}
					</div>
				</div>
			)}

			{/* What they have earned, and the paperwork behind it. */}
			{tab === 'record' && (
				<div className={`${s.page} ${s.pageEven}`}>
					<div className={s.stack}>
						<Panel title='Awards & Decorations' tag={awards.length > 0 ? String(awards.length) : undefined} delay='.13s'>
							{awards.length === 0 ? <Empty text='No awards on record.' /> : (
								<>
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
						<Panel title='Commendations & Remarks' delay='.18s'>
							<Empty text='No commendations on record. Staff write these at the end of an operation.' />
						</Panel>
						<Panel title='Qualifications' tag={quals.length > 0 ? String(quals.length) : undefined} delay='.23s'>
							{quals.length === 0 ? <Empty text='No qualifications on record.' /> : (
								<div style={{ display: 'grid', gap: 8 }}>
									{quals.map((q, i) => (
										<div key={i} className={s.rw} style={{ alignItems: 'baseline' }}>
											<span style={{ minWidth: 0 }}>
												<span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ink)' }}>{q.qualification}</span>
												{q.issuedByName && (
													<span style={{ display: 'block', fontSize: '0.65rem', color: 'var(--ink-3)', marginTop: 2 }}>
														Issued by {q.issuedByName}
													</span>
												)}
											</span>
											{/* Omitted rather than dashed when absent: a column of
											    em-dashes is noise, and the name is what matters here. */}
											{q.date && <span className={s.rwV} style={{ whiteSpace: 'nowrap' }}>{q.date}</span>}
										</div>
									))}
								</div>
							)}
						</Panel>
					</div>

					<div className={s.stack}>
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
						<Panel title={`Operation History (${confirmedOps.length})`} delay='.25s'>
							<OperationHistory ops={confirmedOps} />
						</Panel>
					</div>
				</div>
			)}

			{/* What they wear and carry. The artwork and the kit belong together. */}
			{tab === 'kits' && (
				<div className={`${s.page} ${s.pageFull}`}>
					<Panel title={`${name}'s Kits`} tag={activeLoadout?.name} delay='.23s'>
						{activeLoadout
							? (
								<LoadoutPanel
									loadout={activeLoadout}
									tags={normaliseTags(activeLoadout.tags)}
									// Omitted entirely for a private kit: an unpublished kit has
									// no audience to have an opinion, and its avg/count are always
									// zero since nobody but the owner can ever see it to rate it.
									rating={activeLoadout.shared ? {
										loadoutId: String(activeLoadout._id),
										avg: activeLoadout.ratingAvg ?? 0,
										count: activeLoadout.ratingCount ?? 0,
										mine: myRating?.stars ?? null,
										// Only a signed-in visitor who is not the owner may rate.
										canRate: Boolean(me) && !isOwn,
									} : undefined}
									actions={
										<LoadoutManager
											isOwn={isOwn}
											activeId={activeLoadoutId}
											basePath={`/milpacs/${profile.canonical}`}
											loadouts={loadoutList}
										/>
									}
								/>
							)
							: isOwn
								? <LoadoutManager isOwn activeId={null} loadouts={[]} basePath={`/milpacs/${profile.canonical}`} />
									: (
										// Wrapped so an empty file holds the same floor an
										// occupied one does, rather than collapsing to a
										// single line of text above the page footer.
										<div className={s.kitBlank}>
											<Empty text='No kit on record. Kits are imported from Arma.' />
										</div>
									)}
					</Panel>
				</div>
			)}
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
