import Db from '@/lib/mongo'
import Card from './card'



export default async function Page() {

	const members = await Db.milpacs.find({}).toArray()

	return (
		<div style={{ background: 'rgb(10,10,10)', minHeight: '100vh' }}>
			<div className='m-auto max-w-[1400px]' style={{ padding: '3rem 2rem', display: 'flex', flexDirection: 'column', gap: '3rem' }}>

				{/* ── India Company HQ ──────────────────────────────────── */}
				<Section label='Command' title='India Company Headquarters'>
					<div className='flex flex-wrap gap-4'>
						<Card milpac={members.find(m => m._id === '224086573560365057')} />
						<Card milpac={members.find(m => m._id === '325502946781691916')} />
						<Card milpac={members.find(m => m._id === '166798494424760320')} />
						<Card milpac={members.find(m => m._id === '1344770342006034595')} />
						<Card milpac={members.find(m => m._id === '256691919969714176')} />
					</div>
				</Section>

				<RedDivider />

				{/* ── 1st Platoon ───────────────────────────────────────── */}
				<Section label='1st Platoon' title='1st Platoon Headquarters'>
					<CardGrid members={members} section='1-1' />
				</Section>

				<SubSection title='1-1 Alpha'>
					<CardGrid members={members} section='1-1-1' />
				</SubSection>

				<SubSection title='1-1 Bravo'>
					<CardGrid members={members} section='1-1-2' />
				</SubSection>

				<SubSection title='1-1 Charlie'>
					<CardGrid members={members} section='1-1-3' />
				</SubSection>

				<RedDivider />

				{/* ── 2nd Platoon ───────────────────────────────────────── */}
				<Section label='2nd Platoon' title='2nd Platoon Headquarters'>
					<CardGrid members={members} section='1-2' />
				</Section>

				<SubSection title='1-2 Alpha'>
					<CardGrid members={members} section='1-2-1' />
				</SubSection>

				<SubSection title='1-2 Bravo'>
					<CardGrid members={members} section='1-2-2' />
				</SubSection>

				<SubSection title='1-2 Charlie'>
					<CardGrid members={members} section='1-2-3' />
				</SubSection>

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


function CardGrid({ members, section }: { members: Milpac[]; section: string }) {
	return (
		<div className='flex flex-wrap gap-4'>
			{members.filter(m => m.section === section).map(m => (
				<Card key={m._id} milpac={m} />
			))}
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
