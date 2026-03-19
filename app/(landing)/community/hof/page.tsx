import Image, { StaticImageData } from 'next/image'

import { Divider, Typography } from '@mui/material'
import { EmojiEvents, CalendarMonth, MilitaryTech } from '@mui/icons-material'

import FallbackPfp from '@/public/images/fallback_pfp.png'
import Img1 from '@/public/images/home/VicPose2.png'
import Img2 from '@/public/images/home/ADFField1.png'
import Img3 from '@/public/images/home/Gopro3.png'
import Img4 from '@/public/images/home/mikeretreat2.png'
import Img5 from '@/public/images/home/snowwalk1.png'


// ─── Data type ────────────────────────────────────────────────────────────────

type HofMember = {
	id: string
	name: string
	callsign: string
	rank: string
	bio: string
	joinedTimestamp: number
	portrait: StaticImageData | string
	avatar: StaticImageData | string
}


// ─── Example data (replace with DB query when ready) ─────────────────────────
// TODO: Swap this out for a real DB query:
//   const raw = await Db.users.find({ 'guild.roles': { $in: ['HOF_ROLE_ID'] } }).toArray()
//   const members: HofMember[] = raw.filter(u => u.bio?.name && ...).map(u => ({
//       id: u.id, name: u.bio!.name, callsign: u.bio!.callsign, rank: u.bio!.rank,
//       bio: u.bio!.content, joinedTimestamp: u.guild.joinedTimestamp,
//       portrait: `/api/uploads/bio?id=${u.id}`, avatar: u.avatarURL,
//   }))

const members: HofMember[] = [
	{
		id: '1',
		name: 'Thomas Mango',
		callsign: 'ALPHA-1',
		rank: 'Lieutenant Colonel',
		bio: 'A founding member of ASOT who has dedicated countless hours to building the unit from the ground up. His leadership during Operation IRON SPEAR set the benchmark for all future operations and established the tactical doctrine the unit still follows today.',
		joinedTimestamp: new Date('2019-03-15').getTime(),
		portrait: Img1,
		avatar: FallbackPfp,
	},
	{
		id: '2',
		name: 'James Hartley',
		callsign: 'BRAVO-2',
		rank: 'Sergeant Major',
		bio: 'Served as the backbone of 1 Platoon for over three years, mentoring dozens of new recruits and never missing a training cycle. Awarded the unit\'s first Distinguished Service commendation for his actions during Operation SOUTHERN CROSS.',
		joinedTimestamp: new Date('2020-07-04').getTime(),
		portrait: Img2,
		avatar: FallbackPfp,
	},
	{
		id: '3',
		name: 'Mitchell Clarke',
		callsign: 'CHARLIE-6',
		rank: 'Warrant Officer',
		bio: 'An exceptional marksman and section commander whose calm under fire has saved his element on more occasions than can be counted. Led the assault element during three consecutive campaign operations with zero friendly casualties.',
		joinedTimestamp: new Date('2020-11-22').getTime(),
		portrait: Img3,
		avatar: FallbackPfp,
	},
	{
		id: '4',
		name: 'Daniel Rivers',
		callsign: 'DELTA-3',
		rank: 'Staff Sergeant',
		bio: 'Responsible for establishing and running the ASOT training pipeline for two years, producing some of the most well-prepared operators the unit has ever seen. His contribution to standardising SOPs remains foundational to this day.',
		joinedTimestamp: new Date('2021-01-10').getTime(),
		portrait: Img4,
		avatar: FallbackPfp,
	},
	{
		id: '5',
		name: 'Ryan Nguyen',
		callsign: 'ECHO-4',
		rank: 'Corporal',
		bio: 'Despite his rank, Ryan\'s contributions to the unit\'s Zeus and scenario design have elevated the quality of every operation he has touched. His briefings are legendary and his attention to operational realism is unmatched.',
		joinedTimestamp: new Date('2021-06-30').getTime(),
		portrait: Img5,
		avatar: FallbackPfp,
	},
]


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function Page() {

	if (members.length === 0) {
		return (
			<div className='flex flex-col items-center gap-4 py-16' style={{ color: 'rgba(237,237,237,0.35)' }}>
				<EmojiEvents style={{ fontSize: 48, color: 'rgba(219,0,29,0.3)' }} />
				<Typography fontSize='0.85rem' letterSpacing={2} style={{ textTransform: 'uppercase' }}>
					No inductees yet
				</Typography>
			</div>
		)
	}

	return (
		<div className='w-full flex flex-col gap-14'>

			{/* Intro accent */}
			<div className='flex items-center gap-4'>
				<div style={{ height: 1, flex: 1, background: 'linear-gradient(to right, rgba(219,0,29,0.5), transparent)' }} />
				<EmojiEvents style={{ color: 'var(--red)', fontSize: 20, opacity: 0.7 }} />
				<div style={{ height: 1, flex: 1, background: 'linear-gradient(to left, rgba(219,0,29,0.5), transparent)' }} />
			</div>

			{/* Member grid */}
			<div className='w-full grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6'>
				{members.map((member, index) => (
					<HofCard key={member.id} member={member} index={index + 1} />
				))}
			</div>

		</div>
	)
}


// ─── Card ─────────────────────────────────────────────────────────────────────

function HofCard({ member, index }: { member: HofMember, index: number }) {

	const joinDate = new Date(member.joinedTimestamp).toLocaleDateString('en-AU', {
		year: 'numeric', month: 'long', day: 'numeric',
	})

	return (
		<div
			className='flex flex-col overflow-hidden'
			style={{
				border: '1px solid rgba(219,0,29,0.2)',
				borderTop: '2px solid var(--red)',
				background: 'rgba(255,255,255,0.02)',
			}}
		>

			{/* Portrait image */}
			<div className='relative w-full overflow-hidden' style={{ aspectRatio: '4/3' }}>
				<Image
					src={member.portrait}
					alt={member.name}
					fill
					className='object-cover object-top'
				/>
				{/* Bottom gradient fade into card body */}
				<div className='absolute inset-0' style={{
					background: 'linear-gradient(to bottom, transparent 40%, rgba(10,10,10,0.7) 80%, #0a0a0a 100%)'
				}} />

				{/* Induction index badge */}
				<div
					className='absolute top-3 left-3 flex items-center justify-center'
					style={{
						width: 32, height: 32,
						border: '1px solid rgba(219,0,29,0.5)',
						background: 'rgba(10,10,10,0.75)',
						backdropFilter: 'blur(6px)',
						fontSize: '0.7rem',
						fontWeight: 700,
						letterSpacing: '0.06em',
						color: 'var(--red)',
					}}
				>
					#{index.toString().padStart(2, '0')}
				</div>

				{/* Avatar — bottom right of image */}
				<div
					className='absolute bottom-3 right-3'
					style={{
						width: 44, height: 44,
						borderRadius: '50%',
						border: '2px solid rgba(219,0,29,0.5)',
						overflow: 'hidden',
						boxShadow: '0 2px 10px rgba(0,0,0,0.6)',
						position: 'relative',
					}}
				>
					<Image src={member.avatar} alt={member.name} fill className='object-cover' />
				</div>
			</div>

			{/* Card body */}
			<div className='flex flex-col gap-4 p-5'>

				{/* Name / rank / callsign */}
				<div>
					<div className='flex items-start justify-between gap-2'>
						<Typography
							variant='h6'
							fontWeight={700}
							letterSpacing={2}
							style={{ textTransform: 'uppercase', lineHeight: 1.2 }}
						>
							{member.name}
						</Typography>
						<Typography
							fontWeight={600}
							letterSpacing={2}
							fontSize='0.75rem'
							style={{ textTransform: 'uppercase', color: 'var(--red)', whiteSpace: 'nowrap', paddingTop: 4 }}
						>
							{member.callsign}
						</Typography>
					</div>

					<div className='flex items-center gap-2 mt-1'>
						<MilitaryTech style={{ fontSize: 14, color: 'rgba(219,0,29,0.6)' }} />
						<Typography fontSize='0.75rem' letterSpacing={1} style={{ textTransform: 'uppercase', color: 'rgba(237,237,237,0.45)' }}>
							{member.rank}
						</Typography>
					</div>
				</div>

				<Divider style={{ borderColor: 'rgba(219,0,29,0.15)' }} />

				{/* Bio */}
				<Typography style={{ color: 'rgba(237,237,237,0.6)', fontSize: '0.875rem', lineHeight: 1.7 }}>
					{member.bio}
				</Typography>

				{/* Footer */}
				<div
					className='flex items-center gap-2 mt-auto pt-2'
					style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
				>
					<CalendarMonth style={{ fontSize: 13, color: 'rgba(219,0,29,0.5)' }} />
					<Typography fontSize='0.72rem' letterSpacing={1} style={{ color: 'rgba(237,237,237,0.3)', textTransform: 'uppercase' }}>
						Joined {joinDate}
					</Typography>
				</div>

			</div>
		</div>
	)
}
