import type { Metadata } from 'next'
import type { Route } from 'next'
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
import Masthead from '@/components/ui/Masthead'
import shell from '@/styles/shell.module.css'
import ui from '@/styles/ui.module.css'
import { fetchDefaultKitLines } from '@/lib/milpac-kits'
import { animatedCoverIds, coverIds } from '@/lib/military/milpac-cover'
import r from './roster.module.css'
import { buildSlugIndex, canonicalSegment, toSlugCandidate } from '@/lib/military/milpac-slug'
import MilpacsNav from './nav'



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

	await connection()

	const [orbat, allMembers, me, metaDocs] = await Promise.all([
		fetchORBAT(),
		client.fetchAllMembers(),
		client.fetchMe().catch(() => null),
		Db.orbatSectionMeta.find({}).toArray(),
	])
	const metaMap = new Map(metaDocs.map(m => [`${m.category}:${m.sectionTitle ?? ''}`, m]))

	// A category-level patch is the one stored with `sectionTitle: null` — the
	// platoon's own, as distinct from any of its callsigns'. Checking for the
	// null record matters: without it a section's patch would be served up as the
	// whole platoon's, which is what the route's own fallback would do.
	const categoryPatch = (category: string) =>
		metaDocs.some(m => m.category === category && !m.sectionTitle && m.patch)
			? `/api/orbat/patch?category=${category}`
			: undefined
	const canManageOrbat = !!me && client.hasRoles(me, PERMISSIONS.admin.manageOrbat)

	// One query for every card on the page. Depends on the member list, so it
	// cannot join the Promise.all above.
	const kitLines = await fetchDefaultKitLines(allMembers.map(m => m.id))

	// One readdir for the whole roster rather than an existsSync per card.
	const covers = coverIds()
	// Which of those are GIFs, so the card can serve a still and hold the
	// animation back until hover. One 6-byte read per cover, not per card.
	const animatedCovers = animatedCoverIds(covers)
	const coverUrl = (id: string) => covers.has(id) ? `/api/uploads/cover?id=${id}` : undefined

	// fetchAllMembers() returns raw Mongo documents — departmentRoleIds (ObjectId[])
	// can't cross the Server->Client Component boundary as-is (Card below is
	// 'use client'), so strip it down to a plain-JSON-safe shape first.
	const lookup = client.buildOrbatLookup(JSON.parse(JSON.stringify(allMembers)))

	// Link each card at the member's canonical URL rather than their username,
	// so the index does not send every click through a redirect. Built once for
	// the whole page — a claim can only be judged against the full roster.
	const slugIndex = buildSlugIndex(allMembers.map(toSlugCandidate))
	const milpacPaths = new Map<string, Route>(
		allMembers.map(m => [m.id, `/milpacs/${canonicalSegment(m, slugIndex)}` as Route]),
	)

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
			id: 'gamemasters',
			label: '1-0 Zulu',
			subs: [],
		},
		{
			id: 'reservists',
			label: 'Reservists',
			subs: [],
		},
	]

	return (
		<div className={shell.shell} style={{ minHeight: '100vh' }}>

			{/* The same masthead the About family and every other public page uses,
			    rather than the bespoke centred banner this page carried — same veil,
			    same drifting topo, same clamped height, same left-anchored lockup. */}
			<Masthead
				title='MILPACS'
				kicker='Personnel'
				lede='Military Personnel Accounting Centre — every member of the unit, their billet, and what they carry.'
				background={Banner}
				bannerHeight='md'
				actions={canManageOrbat
					? (
						<Link href='/dashboard/orbat' className={`${ui.btn} ${ui.btnGhost}`}>
							<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='1.7' strokeLinecap='round' strokeLinejoin='round' aria-hidden='true'>
								<circle cx='12' cy='12' r='3' />
								<path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z' />
							</svg>
							Manage ORBAT
						</Link>
					)
					: undefined}
			/>

			<MilpacsNav sections={navSections} />

			<div className={r.page}>

				{/* ── India Company HQ ──────────────────────────────────── */}
				<Section id='india-company' label='Command' title='India Company' rgb='219, 105, 105' patchUrl={categoryPatch('companyHQ')} count={1 + orbat.companyHQ.members.length}>
					<SubSection id='hq' title='Headquarters' count={1 + orbat.companyHQ.members.length}>
						<div className={r.grid}>
							{[orbat.companyHQ.senior, ...orbat.companyHQ.members].map(m => {
								const member = lookup(m.name)
								return member ? <Card key={member.id} member={member} href={milpacPaths.get(member.id)} role={m.role} kit={kitLines.get(member.id)} coverUrl={coverUrl(member.id)} coverAnimated={animatedCovers.has(member.id)} /> : null
							})}
						</div>
					</SubSection>
				</Section>

				{/* ── 1st Platoon — sections from ORBAT ───────────── */}
				<Section id='1st-platoon' label='Saturday' title='1st Platoon' rgb='173, 114, 4' patchUrl={categoryPatch('platoon11')} hexColor={metaMap.get('platoon11:')?.color} count={orbat.platoon11.reduce((n, sec) => n + sec.members.length, 0)}>
					{orbat.platoon11.map((section) => {
						const secMeta = metaMap.get(`platoon11:${section.title}`)
						const patchUrl = secMeta?.patch ? `/api/orbat/patch?category=platoon11&section=${encodeURIComponent(section.title)}` : undefined
						return (
							<SubSection key={section.title} id={slugify(section.title)} title={section.title} count={section.members.length} hexColor={secMeta?.color ?? metaMap.get('platoon11:')?.color} patchUrl={patchUrl}>
								<div className={r.grid}>
									{section.members.map(m => {
										const member = lookup(m.name)
										return member ? <Card key={member.id} member={member} href={milpacPaths.get(member.id)} role={m.role} kit={kitLines.get(member.id)} coverUrl={coverUrl(member.id)} coverAnimated={animatedCovers.has(member.id)} /> : null
									})}
								</div>
							</SubSection>
						)
					})}
				</Section>

				{/* ── 2nd Platoon — sections from ORBAT ───────────── */}
				<Section id='2nd-platoon' label='Sunday' title='2nd Platoon' rgb='29, 116, 85' patchUrl={categoryPatch('platoon12')} hexColor={metaMap.get('platoon12:')?.color} count={orbat.platoon12.reduce((n, sec) => n + sec.members.length, 0)}>
					{orbat.platoon12.map((section) => {
						const secMeta = metaMap.get(`platoon12:${section.title}`)
						const patchUrl = secMeta?.patch ? `/api/orbat/patch?category=platoon12&section=${encodeURIComponent(section.title)}` : undefined
						return (
							<SubSection key={section.title} id={slugify(section.title)} title={section.title} count={section.members.length} hexColor={secMeta?.color ?? metaMap.get('platoon12:')?.color} patchUrl={patchUrl}>
								<div className={r.grid}>
									{section.members.map(m => {
										const member = lookup(m.name)
										return member ? <Card key={member.id} member={member} href={milpacPaths.get(member.id)} role={m.role} kit={kitLines.get(member.id)} coverUrl={coverUrl(member.id)} coverAnimated={animatedCovers.has(member.id)} /> : null
									})}
								</div>
							</SubSection>
						)
					})}
				</Section>

				{/* ── Support Platoon (1-3) ─────────────────── */}
				<Section id='support-platoon' label='Saturday & Sunday' title='Support Platoon' rgb='32, 102, 148' patchUrl={categoryPatch('support')} hexColor={metaMap.get('support:')?.color} count={orbat.support.reduce((n, sec) => n + sec.members.length, 0)}>
					{orbat.support.map((section) => {
						const secMeta = metaMap.get(`support:${section.title}`)
						const patchUrl = secMeta?.patch ? `/api/orbat/patch?category=support&section=${encodeURIComponent(section.title)}` : undefined
						return (
							<SubSection key={section.title} id={slugify(section.title)} title={section.title} count={section.members.length} hexColor={secMeta?.color ?? metaMap.get('support:')?.color} patchUrl={patchUrl}>
								<div className={r.grid}>
									{section.members.map(m => {
										const member = lookup(m.name)
										return member ? <Card key={member.id} member={member} href={milpacPaths.get(member.id)} role={m.role} kit={kitLines.get(member.id)} coverUrl={coverUrl(member.id)} coverAnimated={animatedCovers.has(member.id)} /> : null
									})}
								</div>
							</SubSection>
						)
					})}
				</Section>

				{/* ── Gamemasters (1-0 Zulu) ─────────────── */}
				{/* `fetchORBAT()` has always returned `gamemasters` and /orbat has
				    always rendered it — this page just never read the key, which
				    is why Zeus was missing from the roster entirely. */}
				{orbat.gamemasters.length > 0 && (
					<Section id='gamemasters' label='Mission Control' title='1-0 Zulu — Gamemasters' rgb='139, 92, 246' patchUrl={categoryPatch('gamemaster')} hexColor={metaMap.get('gamemaster:')?.color} count={orbat.gamemasters.length}>
						<SubSection
							title='Gamemasters'
							count={orbat.gamemasters.length}
							hexColor={metaMap.get('gamemaster:')?.color}
						>
							<div className={r.grid}>
								{orbat.gamemasters.map(m => {
									const member = lookup(m.name)
									return member ? <Card key={member.id} member={member} href={milpacPaths.get(member.id)} role={m.role} kit={kitLines.get(member.id)} coverUrl={coverUrl(member.id)} coverAnimated={animatedCovers.has(member.id)} /> : null
								})}
							</div>
						</SubSection>
					</Section>
				)}

				{/* ── Reservists ─────────────────────────── */}
				<Section id='reservists' label='Reservists' title='Company Reservists' rgb='194, 8, 154' count={orbat.activeReservists.length + orbat.inactiveReservists.length}>
					{orbat.activeReservists.length > 0 && (
						<SubSection title='Active' count={orbat.activeReservists.length} patchUrl={categoryPatch('activeReservist')}>
							<div className={r.grid}>
								{orbat.activeReservists.map(name => {
									const member = lookup(name)
									return member ? <Card key={member.id} member={member} href={milpacPaths.get(member.id)} role='Active Reservist' kit={kitLines.get(member.id)} coverUrl={coverUrl(member.id)} coverAnimated={animatedCovers.has(member.id)} /> : null
								})}
							</div>
						</SubSection>
					)}
					{orbat.inactiveReservists.length > 0 && (
						<SubSection title='Inactive' count={orbat.inactiveReservists.length} patchUrl={categoryPatch('inactiveReservist')}>
							<div className={r.grid} style={{ opacity: 0.5 }}>
								{orbat.inactiveReservists.map(name => {
									const member = lookup(name)
									return member ? <Card key={member.id} member={member} href={milpacPaths.get(member.id)} role='Inactive Reservist' kit={kitLines.get(member.id)} coverUrl={coverUrl(member.id)} coverAnimated={animatedCovers.has(member.id)} /> : null
								})}
							</div>
						</SubSection>
					)}
				</Section>

			</div>
		</div>
	)
}


function Section({ id, label, title, children, rgb, hexColor, count, patchUrl }: { id?: string; label: string; title: string; children: React.ReactNode; rgb: string; hexColor?: string; count?: number; patchUrl?: string }) {
	const effectiveRgb = hexColor ? hexToRgb(hexColor) : rgb
	return (
		<section id={id} className={r.section} style={{ ['--sec-rgb' as string]: effectiveRgb }}>
			<div className={r.sectionHead}>
				<div className={r.sectionRule} />
				{patchUrl && <span className={r.sectionPlate}><img src={patchUrl} alt='' /></span>}
				<div className={r.sectionWho}>
					<div className={r.sectionLabel}>{label}</div>
					<h2 className={r.sectionTitle}>{title}</h2>
				</div>
				{count !== undefined && (
					<div className={r.sectionCount}>{count} Assigned</div>
				)}
			</div>
			{children}
		</section>
	)
}

function SubSection({ id, title, children, hexColor, patchUrl, count }: { id?: string; title: string; children: React.ReactNode; rgb?: string; hexColor?: string; patchUrl?: string; count?: number }) {
	return (
		<div id={id} className={r.sub}>
			<div className={r.subHead}>
				{patchUrl && <span className={r.subPlate}><img src={patchUrl} alt='' className={r.subPatch} /></span>}
				<h3 className={r.subTitle} style={hexColor ? { ['--sub-color' as string]: hexColor } : undefined}>{title}</h3>
				<div className={r.subLine} />
				{count !== undefined && <div className={r.subCount}>{count}</div>}
			</div>
			{children}
		</div>
	)
}
