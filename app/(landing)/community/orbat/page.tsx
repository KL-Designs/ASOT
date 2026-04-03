import { Metadata } from "next"
import {
	Shield, Engineering, GpsFixed, Flight,
	LocalHospital, DirectionsCar, Groups, SportsEsports,
	AccountBalance, MilitaryTech, Stars,
} from '@mui/icons-material'
import Link from 'next/link'
import { connection } from 'next/server'
import Container from "@/components/container"
import Banner from '@/public/images/home/3DMA_Final2.png'
import { fetchORBAT, type Member, type RawSection } from '@/lib/orbat'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'
import Db from '@/lib/mongo'

export const metadata: Metadata = {
	title: "ORBAT | Australian Special Operations Taskforce"
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface UnitSection extends RawSection { icon?: React.ReactNode }

function getSupportIcon(title: string): React.ReactNode {
	const t = title.toUpperCase()
	if (t.includes('ECHO') || t.includes('ENGINEER')) return <Engineering sx={{ fontSize: 18 }} />
	if (t.includes('GOLF') || t.includes('WEAPON'))   return <GpsFixed sx={{ fontSize: 18 }} />
	if (t.includes('HOTEL') || t.includes('ROTARY'))  return <Flight sx={{ fontSize: 18 }} />
	if (t.includes('MIKE') || t.includes('MEDICAL'))  return <LocalHospital sx={{ fontSize: 18 }} />
	if (t.includes('VICTOR') || t.includes('CAVALRY') || t.includes('ARMOUR')) return <DirectionsCar sx={{ fontSize: 18 }} />
	return null
}

// ─── Data ────────────────────────────────────────────────────────────────────


// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ children, color, patchUrl }: { children: React.ReactNode; color?: string; patchUrl?: string }) {
	const bgStyle = color
		? { background: color }
		: { background: 'linear-gradient(90deg, rgba(219,0,29,0.9) 0%, rgba(160,0,20,0.85) 100%)' }
	return (
		<div style={{
			...bgStyle,
			padding: '5px 10px',
			fontSize: '0.68rem',
			fontWeight: 700,
			letterSpacing: '0.1em',
			textTransform: 'uppercase',
			color: '#fff',
			display: 'flex',
			alignItems: 'center',
			gap: 6,
		}}>
			{/* eslint-disable-next-line @next/next/no-img-element */}
			{patchUrl && <img src={patchUrl} alt='' style={{ width: 16, height: 16, objectFit: 'contain', flexShrink: 0 }} />}
			{children}
		</div>
	)
}

function MemberRow({ role, name, index }: { role: string; name: string; index: number }) {
	const isVacant = !name
	return (
		<div style={{
			display: 'grid',
			gridTemplateColumns: '1fr 1fr',
			padding: '3px 8px',
			background: index % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)',
			borderBottom: '1px solid rgba(219,0,29,0.06)',
			minHeight: 22,
			alignItems: 'center',
		}}>
			<span style={{ fontSize: '0.67rem', color: 'rgba(237,237,237,0.55)', letterSpacing: '0.02em' }}>
				{role}
			</span>
			<span style={{
				fontSize: '0.67rem',
				fontWeight: isVacant ? 400 : 600,
				color: isVacant ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.9)',
				fontStyle: isVacant ? 'italic' : 'normal',
				letterSpacing: '0.02em',
			}}>
				{isVacant ? '— Vacant —' : name}
			</span>
		</div>
	)
}

const iconStrip = (icon: React.ReactNode) => (
	<div style={{
		width: 34,
		flexShrink: 0,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		background: 'rgba(219,0,29,0.07)',
		borderRight: '1px solid rgba(219,0,29,0.15)',
		color: 'rgba(219,0,29,0.65)',
	}}>
		{icon}
	</div>
)

function UnitCard({ section, meta }: { section: UnitSection; meta?: { color?: string; patchUrl?: string } }) {
	return (
		<div style={{ border: '1px solid rgba(219,0,29,0.15)', overflow: 'hidden', marginBottom: 6 }}>
			{section.icon && !meta?.patchUrl ? (
				<div className='flex items-stretch'>
					{iconStrip(section.icon)}
					<div className='flex-1 min-w-0'>
						<SectionHeader color={meta?.color} patchUrl={meta?.patchUrl}>{section.title}</SectionHeader>
						{section.members.map((m, i) => (
							<MemberRow key={i} role={m.role} name={m.name} index={i} />
						))}
					</div>
				</div>
			) : (
				<>
					<SectionHeader color={meta?.color} patchUrl={meta?.patchUrl}>{section.title}</SectionHeader>
					{section.members.map((m, i) => (
						<MemberRow key={i} role={m.role} name={m.name} index={i} />
					))}
				</>
			)}
		</div>
	)
}

function PlatoonColumn({ name, icon, sections, category, metaMap }: {
	name: string
	icon: React.ReactNode
	sections: UnitSection[]
	category: string
	metaMap: Map<string, OrbatSectionMeta>
}) {
	const catMeta = metaMap.get(`${category}:`)
	const catColor = catMeta?.color ?? 'var(--red)'
	const catColorFaint = catMeta?.color ? `${catMeta.color}14` : 'rgba(219,0,29,0.08)'
	const catColorBorder = catMeta?.color ? `${catMeta.color}33` : 'rgba(219,0,29,0.2)'

	return (
		<div className='flex flex-col'>
			<div style={{
				background: catColorFaint,
				borderTop: `2px solid ${catColor}`,
				border: `1px solid ${catColorBorder}`,
				borderTopWidth: 2,
				borderTopColor: catColor,
				marginBottom: 6,
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				padding: '7px 10px',
				color: catColor,
			}}>
				{icon}
				<span style={{
					fontSize: '0.72rem',
					fontWeight: 700,
					letterSpacing: '0.1em',
					textTransform: 'uppercase',
					color: catColor,
				}}>
					{name}
				</span>
			</div>
			{sections.map((s, i) => {
				const secMeta = metaMap.get(`${category}:${s.title}`)
				const patchUrl = secMeta?.patch
					? `/api/orbat/patch?category=${category}&section=${encodeURIComponent(s.title)}`
					: undefined
				return <UnitCard key={i} section={s} meta={{ color: secMeta?.color, patchUrl }} />
			})}
		</div>
	)
}

function ReservistsCard({ names }: { names: string[] }) {
	const rows: string[][] = []
	for (let i = 0; i < names.length; i += 2) {
		rows.push([names[i], names[i + 1] ?? ''])
	}
	return (
		<div style={{ border: '1px solid rgba(219,0,29,0.15)', overflow: 'hidden', marginBottom: 6 }}>
			<div className='flex items-stretch'>
				{iconStrip(<Groups sx={{ fontSize: 18 }} />)}
				<div className='flex-1 min-w-0'>
					<SectionHeader>Company Reservists (Active)</SectionHeader>
					{rows.map(([a, b], i) => (
						<div key={i} style={{
							display: 'grid',
							gridTemplateColumns: '1fr 1fr',
							background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)',
							borderBottom: '1px solid rgba(219,0,29,0.06)',
						}}>
							{[a, b].map((name, j) => (
								<span key={j} style={{
									padding: '3px 8px',
									fontSize: '0.66rem',
									color: name ? 'rgba(237,237,237,0.82)' : 'transparent',
									borderLeft: j === 1 ? '1px solid rgba(219,0,29,0.08)' : 'none',
								}}>
									{name || '.'}
								</span>
							))}
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

function InactiveReservistsCard({ names }: { names: string[] }) {
	return (
		<div style={{ border: '1px solid rgba(219,0,29,0.15)', overflow: 'hidden', marginBottom: 6 }}>
			<SectionHeader>Company Reservists (Inactive)</SectionHeader>
			{names.map((name, i) => (
				<div key={i} style={{
					padding: '3px 8px',
					fontSize: '0.67rem',
					color: 'rgba(237,237,237,0.4)',
					fontStyle: 'italic',
					background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)',
					borderBottom: '1px solid rgba(219,0,29,0.06)',
				}}>
					{name}
				</div>
			))}
		</div>
	)
}

function GamemastersCard({ members }: { members: Member[] }) {
	return (
		<div style={{ border: '1px solid rgba(219,0,29,0.15)', overflow: 'hidden', marginBottom: 6 }}>
			<div className='flex items-stretch'>
				{iconStrip(<SportsEsports sx={{ fontSize: 18 }} />)}
				<div className='flex-1 min-w-0'>
					<SectionHeader>1-0 Zulu — Gamemasters</SectionHeader>
					{members.map((m, i) => (
						<MemberRow key={i} role={m.role} name={m.name} index={i} />
					))}
				</div>
			</div>
		</div>
	)
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default async function Page() {
	await connection()
	const [orbat, me, metaDocs] = await Promise.all([
		fetchORBAT(),
		client.fetchMe().catch(() => null),
		Db.orbatSectionMeta.find({}).toArray(),
	])
	const canManageOrbat = !!me && client.hasRoles(me, PERMISSIONS.admin.manageOrbat)
	const support: UnitSection[] = orbat.support.map(s => ({ ...s, icon: getSupportIcon(s.title) }))

	// Build lookup: `${category}:${sectionTitle ?? ''}` → meta doc
	const metaMap = new Map(metaDocs.map(m => [`${m.category}:${m.sectionTitle ?? ''}`, m]))
	return (
		<Container
			title="OUR ORBAT"
			subtitle="Our order of battle (ORBAT) is based around the current Australian Defense Force (ADF) structure with some custom changes that suit our style of game play and desires."
			background={Banner}
			sx={{ bannerHeight: 'sm', maxWidth: 'max-w-[1400px]', padding: '2rem', gap: 'gap-5' }}
		>
			{canManageOrbat && (
				<div style={{ display: 'flex', justifyContent: 'flex-end' }}>
					<Link href='/admin/orbat' style={{
						fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
						color: 'rgba(219,0,29,0.85)', background: 'rgba(219,0,29,0.08)',
						border: '1px solid rgba(219,0,29,0.3)', padding: '6px 16px', textDecoration: 'none',
						display: 'inline-flex', alignItems: 'center', gap: 6,
					}}>
						⚙ Manage ORBAT
					</Link>
				</div>
			)}

			{/* Company HQ */}
			<div style={{ border: '1px solid rgba(219,0,29,0.3)', borderTop: '3px solid var(--red)', overflow: 'hidden' }}>

				{/* Banner */}
				<div style={{
					background: 'linear-gradient(135deg, rgba(219,0,29,0.95) 0%, rgba(130,0,18,0.92) 60%, rgba(60,0,8,0.9) 100%)',
					padding: '9px 20px',
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					borderBottom: '1px solid rgba(255,255,255,0.08)',
				}}>
					<AccountBalance style={{ fontSize: 20, color: 'rgba(255,255,255,0.85)' }} />
					<div>
						<div style={{ fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
							0-A India Company
						</div>
						<div style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff', lineHeight: 1.1 }}>
							Company Headquarters
						</div>
					</div>
				</div>

				{/* Commanding Officer hero */}
				<div style={{
					position: 'relative',
					overflow: 'hidden',
					padding: '28px 32px',
					background: 'linear-gradient(135deg, rgba(219,0,29,0.1) 0%, rgba(0,0,0,0.35) 100%)',
					borderBottom: '1px solid rgba(219,0,29,0.2)',
					display: 'flex',
					alignItems: 'center',
					gap: 28,
				}}>
					{/* Watermark */}
					<div style={{
						position: 'absolute',
						right: 24,
						top: '50%',
						transform: 'translateY(-50%)',
						fontSize: '7rem',
						fontWeight: 900,
						color: 'rgba(219,0,29,0.05)',
						letterSpacing: '0.04em',
						userSelect: 'none',
						pointerEvents: 'none',
						lineHeight: 1,
					}}>
						CO
					</div>

					{/* Icon badge */}
					<div style={{
						width: 72,
						height: 72,
						borderRadius: '50%',
						border: '2px solid rgba(219,0,29,0.45)',
						background: 'radial-gradient(circle, rgba(219,0,29,0.15) 0%, rgba(0,0,0,0.3) 100%)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0,
						boxShadow: '0 0 24px rgba(219,0,29,0.15)',
					}}>
						<Stars style={{ fontSize: 36, color: 'rgba(219,0,29,0.85)' }} />
					</div>

					{/* Name block */}
					<div>
						<div style={{
							fontSize: '0.62rem',
							fontWeight: 700,
							letterSpacing: '0.25em',
							color: 'rgba(219,0,29,0.75)',
							textTransform: 'uppercase',
							marginBottom: 6,
						}}>
							{orbat.companyHQ.senior.role}
						</div>
						<div style={{
							fontSize: '2rem',
							fontWeight: 800,
							letterSpacing: '0.06em',
							color: '#fff',
							textTransform: 'uppercase',
							lineHeight: 1,
							textShadow: '0 2px 20px rgba(219,0,29,0.3)',
						}}>
							{orbat.companyHQ.senior.name}
						</div>
						<div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
							<div style={{ height: 2, width: 40, background: 'var(--red)' }} />
							<div style={{ height: 1, width: 20, background: 'rgba(219,0,29,0.35)' }} />
						</div>
					</div>
				</div>

				{/* Sub-HQ label */}
				<div style={{
					padding: '5px 20px',
					fontSize: '0.65rem',
					fontWeight: 700,
					letterSpacing: '0.15em',
					textTransform: 'uppercase',
					color: 'rgba(219,0,29,0.65)',
					background: 'rgba(219,0,29,0.04)',
					borderBottom: '1px solid rgba(219,0,29,0.12)',
					display: 'flex',
					alignItems: 'center',
					gap: 10,
				}}>
					<div style={{ height: 1, width: 16, background: 'rgba(219,0,29,0.3)', flexShrink: 0 }} />
					{orbat.companyHQ.subTitle}
					<div style={{ height: 1, flex: 1, background: 'rgba(219,0,29,0.1)' }} />
				</div>

				{/* HQ members grid */}
				<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'>
					{orbat.companyHQ.members.map((m, i) => (
						<div key={i} style={{
							padding: '12px 20px',
							borderRight: i < 3 ? '1px solid rgba(219,0,29,0.1)' : 'none',
							borderBottom: '1px solid rgba(219,0,29,0.06)',
							background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.15)',
						}}>
							<div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
								{m.role}
							</div>
							<div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.92)' }}>
								{m.name}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Main 4-column layout */}
			<div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start'>
				<PlatoonColumn name='1-1 Infantry Platoon' icon={<Shield sx={{ fontSize: 20 }} />} sections={orbat.platoon11} category='platoon11' metaMap={metaMap} />
				<PlatoonColumn name='1-2 Infantry Platoon' icon={<Shield sx={{ fontSize: 20 }} />} sections={orbat.platoon12} category='platoon12' metaMap={metaMap} />
				<PlatoonColumn name='1-3 Support Platoon'  icon={<MilitaryTech sx={{ fontSize: 20 }} />} sections={support} category='support' metaMap={metaMap} />
				<div>
					<GamemastersCard members={orbat.gamemasters} />
					<ReservistsCard names={orbat.activeReservists} />
					<InactiveReservistsCard names={orbat.inactiveReservists} />
				</div>
			</div>
		</Container>
	)
}
