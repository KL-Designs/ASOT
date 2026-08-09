import { Metadata } from "next"
import Image, { StaticImageData } from 'next/image'

import { Typography } from '@mui/material'
import { Handshake, Public, MilitaryTech, SportsEsports } from '@mui/icons-material'

import Container from "@/components/container"
import InfoCard from '@/components/info-card'

import Banner from '@/public/images/home/snowwalk1.png'
import ImgACOM from '@/public/images/partners/ACOM.png'
import ImgAPCA from '@/public/images/partners/APCA.png'
import Img7CG from '@/public/images/partners/7Cav.png'
import Img2A from '@/public/images/partners/2AM.png'



export const metadata: Metadata = {
	title: "Partnerships | Australian Special Operations Taskforce",
	description: "Community partners and affiliated organisations of the Australian Special Operations Taskforce in the milsim community.",
}



function SectionHeader({ label, title }: { label: string, title: string }) {
	return (
		<div className='flex flex-col gap-4'>
			<div className='flex items-center gap-4'>
				<div style={{ width: 3, alignSelf: 'stretch', background: 'var(--red)', flexShrink: 0 }} />
				<div>
					<div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.8)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
					<h2 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.08em', margin: 0 }}>{title.toUpperCase()}</h2>
				</div>
			</div>
			<div style={{ height: 1, background: 'rgba(219,0,29,0.2)' }} />
		</div>
	)
}


function UnitCard({ name, branch, region, style, image, children }: {
	name: string
	branch: string
	region: string
	style: string
	image: StaticImageData
	children: React.ReactNode
}) {
	return (
		<div
			className='flex flex-col h-full'
			style={{
				border: '1px solid rgba(255,255,255,0.07)',
				borderTop: '2px solid var(--red)',
				background: 'rgba(255,255,255,0.02)',
			}}
		>
			<div
				className='w-full flex items-center justify-center'
				style={{ height: 180, padding: '24px 32px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}
			>
				<div className='relative w-full h-full'>
					<Image src={image} alt={name} fill className='object-contain object-center' />
				</div>
			</div>

			<div className='flex flex-col gap-4 p-5'>
				<span style={{ fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.95rem' }}>{name.toUpperCase()}</span>

				<div className='flex flex-wrap gap-2'>
					<span style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', padding: '3px 10px', background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(219,0,29,0.9)' }}>
						{branch.toUpperCase()}
					</span>
					<span style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', padding: '3px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.7)' }}>
						{region.toUpperCase()}
					</span>
					<span style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', padding: '3px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.7)' }}>
						{style.toUpperCase()}
					</span>
				</div>

				<div className='flex flex-col gap-3'>
					{children}
				</div>
			</div>
		</div>
	)
}



export default function Page() {
	return (
		<Container title="PARTNERSHIPS" background={Banner} sx={{ bannerHeight: 'md', maxWidth: 'max-w-md', gap: 'gap-12' }}>

			<div className='flex flex-col gap-4'>
				<SectionHeader label="Overview" title="It's About Community" />
				<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
					<InfoCard title='Open Relations' icon={<Handshake />}>
						<Typography>ASOT prides itself on being open and willing to work with like-minded gaming communities and ARMA units. With a lot of our members being a part of ARMA for a long time, we have built some wonderful and long lasting friendships.</Typography>
					</InfoCard>
					<InfoCard title='Global Reach' icon={<Public />}>
						<Typography>With continued growth comes new and continued relations with other communities. ASOT is proud to celebrate both our long-term partnerships and newly created ones across the globe.</Typography>
					</InfoCard>
					<InfoCard title='Shared Values' icon={<MilitaryTech />}>
						<Typography>We partner with units that share our commitment to professionalism, respect, and an enjoyable ARMA experience. Our partnerships are built on mutual trust and a passion for the game.</Typography>
					</InfoCard>
				</div>
			</div>

			<div className='flex flex-col gap-6'>
				<SectionHeader label="Partnerships" title="Sister Arma Units" />
				<Typography style={{ color: 'rgba(237,237,237,0.65)' }}>
					ASOT has some long standing relations with fellow ARMA units which we believe is important to create and maintain to allow everyone to enjoy the best online ARMA experience possible. This is our way of acknowledging and showing our appreciation to those fellow units as we continue with healthy, like-minded relationships.
				</Typography>
				<div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>

					<UnitCard name="Australian Combined Operations Milsim (ACOM)" branch="Australian Defence Force" region="Oceania" style="Casual Realism" image={ImgACOM}>
						<Typography>ACOM and ASOT have a long history stretching close to 8+ years. Similar to other sister units, ACOM and ASOT share common thoughts and ideas on how ARMA operations should be run. With a number of members from both units being part of each community at some point, the relationship between the two units is ongoing and stronger than ever.</Typography>
						<Typography>ACOM aims to simulate Australian Defence Force operations in a variety of theatres. They also create and run a wide variety of fictional and non-fictional missions. ACOM is a unit we can proudly recommend to both new and veteran players.</Typography>
					</UnitCard>

					<UnitCard name="Australia Pacific Combined Arms (APCA)" branch="Australian Defence Force" region="Oceania" style="Casual Realism" image={ImgAPCA}>
						<Typography>APCA and ASOT have a long and strong standing relationship that has continued to grow over the years. We have similar ideas on how ARMA operations should be run but with the execution being unique between the two units, APCA is one of the strongest relations that ASOT holds with another unit.</Typography>
						<Typography>Their attitude, behaviour and warm welcoming nature means that we see a long lasting relationship between the two units and a great place for like minded ARMA players looking for a great home. APCA is a unit we can proudly recommend.</Typography>
					</UnitCard>

					<UnitCard name="7th Cavalry Gaming" branch="Army" region="United States of America" style="Slow Tactful" image={Img7CG}>
						<Typography>7 Cav and ASOT have a long standing partnership more based around sharing of admin, website and community management idea sharing. 7 Cav motivated ASOT to create our own version of the MILPAC system which is now a treasured aspect of the unit.</Typography>
						<Typography>Operating since 2002, 7 Cav is one of the longest standing US gaming communities and has an impressive history with ARMA 3. 7 Cav operates as a combined armed Battalion with a wide variety of roles, trainings and options for its members.</Typography>
					</UnitCard>

					<div className='hidden xl:block' />

				<UnitCard name="2nd Airmobile" branch="Airmobile" region="Oceania" style="Semi Realistic" image={Img2A}>
						<Typography>2nd Airmobile is a relatively new unit but has long standing relationships with a number of ASOT members and the community. With 2nd Airmobile being a newly created unit, ASOT aims to continue building bonds and joining in on events and missions into the future.</Typography>
						<Typography>As their unit name eludes to, 2nd Airmobile is based around an air mobile company which aims to provide a challenging and immersive experience for all members. They focus on realistic tactics, communication, and teamwork — values that ASOT can closely relate to.</Typography>
					</UnitCard>

				</div>
			</div>

		</Container>
	)
}
