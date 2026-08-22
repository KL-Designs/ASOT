import { Metadata } from "next"
import Link from 'next/link'
import Image, { StaticImageData } from 'next/image'

import { Typography } from '@mui/material'
import { Favorite, Groups, SupportAgent, HelpOutline, Accessible, Phone, OpenInNew } from '@mui/icons-material'

import Container from "@/components/container"
import InfoCard from '@/components/info-card'

import Banner from '@/public/images/home/mikeretreat2.png'
import ImgEmergency from '@/public/images/support/tripleZero.jpg'
import ImgLifeline from '@/public/images/support/lifeline.png'
import ImgBeyondBlue from '@/public/images/support/BeyondBlue.png'
import ImgSLV from '@/public/images/support/SLV.png'
import ImgMHWH from '@/public/images/support/MentalHealthWellbeingHub.png'
import ImgNOC from '@/public/images/support/NurseOnCall.png'
import Img13Health from '@/public/images/support/13health.jpg'
import ImgHealthline from '@/public/images/support/healthline.png'
import ImgLifeline2 from '@/public/images/support/lifeline2.png'
import ImgYouthline from '@/public/images/support/youthline.png'


export const metadata: Metadata = {
	title: "Support | Australian Special Operations Taskforce",
	description: "Submit a support request or get help from the Australian Special Operations Taskforce staff team.",
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


function SupportCard({ name, phone, link, available, location, image, children }: {
	name: string
	phone: string
	link?: string
	available: string
	location?: string
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
				style={{ height: 160, padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}
			>
				<div className='relative w-full h-full'>
					<Image src={image} alt={name} fill className='object-contain object-center' loading='eager' />
				</div>
			</div>

			<div className='flex flex-col gap-4 p-5'>
				<span style={{ fontWeight: 700, letterSpacing: '0.08em', fontSize: '0.95rem' }}>{name.toUpperCase()}</span>

				<div className='flex flex-col gap-1'>
					<div className='flex items-center gap-2' style={{ color: 'rgba(219,0,29,0.9)', fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.06em' }}>
						<Phone style={{ fontSize: '1rem' }} />
						{phone}
					</div>
					{link && (
						<Link href={link as any} target='_blank' className='flex items-center gap-1' style={{ color: 'rgba(237,237,237,0.5)', fontSize: '0.78rem', letterSpacing: '0.04em' }}>
							<OpenInNew style={{ fontSize: '0.85rem' }} />
							{link.replace(/^https?:\/\//, '')}
						</Link>
					)}
				</div>

				<div className='flex flex-wrap gap-2'>
					<span style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', padding: '3px 10px', background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(219,0,29,0.9)' }}>
						{available}
					</span>
					{location && (
						<span style={{ fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.06em', padding: '3px 10px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.7)' }}>
							{location.toUpperCase()}
						</span>
					)}
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
		<Container title="ASOT SUPPORT" kicker="Wellbeing" background={Banner} sx={{ bannerHeight: 'md', maxWidth: 'max-w-md', gap: 'gap-12' }}>

			<div className='flex flex-col gap-4'>
				<SectionHeader label="Mental Health" title="You're Not Alone" />
				<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
					<InfoCard title="We Understand" icon={<Favorite />}>
						<Typography>ASOT and its members understand that everyone, no matter your lifestyle, history or current situation, goes through hard times in life. Mental and physical health is extremely important and we can often find ourselves struggling from time to time — and that is completely fine.</Typography>
					</InfoCard>
					<InfoCard title="ASOT Community" icon={<Groups />}>
						<Typography>We aim to provide a community where everyone is welcome, comfortable and feels accepted — persons from all walks of life, across multiple countries, all sorts of sexualities, genders and religious beliefs. The community we've built is the first step in providing a safe and enjoyable environment for all.</Typography>
					</InfoCard>
					<InfoCard title="ASOT Chaplains" icon={<SupportAgent />}>
						<Typography>ASOT proudly had the first dedicated chaplain roles of any Australian ARMA 3 milsim unit. Bound to strict confidentiality, our chaplains offer all current and ex-ASOT members an ear to talk to, a shoulder to cry on, or simply an outlet to vent to.</Typography>
						<Typography>Find our chaplains on the <Link href='/orbat' target='_blank' className='underline'>ASOT ORBAT</Link> — available any time, any day.</Typography>
					</InfoCard>
				</div>
			</div>

			<div className='flex flex-col gap-4'>
				<SectionHeader label="Guidance" title="What Do I Do?" />
				<Typography style={{ color: 'rgba(237,237,237,0.65)' }}>
					Self harm and suicide can be a difficult topic to talk about and can be even more difficult when you or someone close to you experiences difficulties. If someone confides in you about considering self-harm or suicide, here are some things you can do to help.
				</Typography>
				<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
					<InfoCard title="If You Are Comfortable Discussing It" icon={<HelpOutline />}>
						<div className='flex flex-col gap-2'>
							<Typography>- Listen to them without judgement and encourage them to talk about their situation.</Typography>
							<Typography>- Show empathy for their situation and take them seriously.</Typography>
							<Typography>- Although hard to do online, do not leave them alone until someone can be with them in person or until they have contacted a health professional.</Typography>
							<Typography>- Discuss the ways that you can get them help and if they agree, follow it up regularly.</Typography>
						</div>
					</InfoCard>
					<InfoCard title="If You Are Not Comfortable Discussing It" icon={<Accessible />}>
						<div className='flex flex-col gap-2'>
							<Typography>- Tell them you are willing and wanting to assist but are unable to provide the required level of assistance they may require.</Typography>
							<Typography>- If able and with the person's permission, contact someone who may be able to assist or provide details on the next step.</Typography>
							<Typography>- Attempt to have the person contact a health professional so they may take over the situation and provide the assistance required.</Typography>
						</div>
					</InfoCard>
				</div>
			</div>

			<div className='flex flex-col gap-6'>
				<SectionHeader label="Resources" title="Who Can Help?" />
				<Typography style={{ color: 'rgba(237,237,237,0.65)' }}>
					There are a large number of resources, hotlines and programs who can provide immediate guidance and help for a multitude of circumstances. If you are struggling personally, or you are in contact with someone who may be struggling, the resources below may be able to assist.
				</Typography>
				<div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4'>

					<SupportCard name="000" phone="112 (If you have no reception)" available="24/7" image={ImgEmergency}>
						<Typography>If at any time you require immediate, emergency assistance, we recommend calling triple zero. Even without ambulance cover, it's free to have an ambulance or police come out to your location to provide care on site.</Typography>
					</SupportCard>

					<SupportCard name="Lifeline Australia" phone="13 11 14" link="https://www.lifeline.org.au" available="24/7" image={ImgLifeline}>
						<Typography>A national charity providing all Australians experiencing emotional distress with access to 24 hour crisis support and suicide prevention services. They exist so that no person in Australia has to face their darkest moments alone.</Typography>
					</SupportCard>

					<SupportCard name="Beyond Blue" phone="1300 224 636" link="https://www.beyondblue.org.au" available="24/7" image={ImgBeyondBlue}>
						<Typography>Your mental health is important. Some days are better than others and we all need a helping hand from time to time. Wherever you are in your mental health journey, Beyond Blue will be here to help.</Typography>
					</SupportCard>

					<SupportCard name="SuicideLine" phone="1300 651 251" link="https://suicideline.org.au" available="24/7" image={ImgSLV}>
						<Typography>Discovering that someone you care about has tried to end their life can be a devastating experience. SuicideLine provides support and guidance on what to say to someone who has attempted or is considering suicide.</Typography>
					</SupportCard>

					<SupportCard name="Mental Health and Wellbeing Hubs" phone="1300 375 330" link="https://www.betterhealth.vic.gov.au" available="9am–10pm weekdays | 9am–5pm weekends" image={ImgMHWH}>
						<Typography>Mental Health & Wellbeing Hubs can help with a range of issues including lowered mood, anxiety, substance use or addiction, and life stressors such as homelessness, financial difficulties and social isolation.</Typography>
					</SupportCard>

					<SupportCard name="NURSE-ON-CALL" phone="1300 60 60 24" link="https://www.health.vic.gov.au" available="24/7" location="Victoria" image={ImgNOC}>
						<Typography>NURSE-ON-CALL puts you directly in touch with a registered nurse for caring, professional health advice around the clock. If your situation is an emergency, always call 000 or go to an emergency department.</Typography>
					</SupportCard>

					<SupportCard name="13 Health" phone="13 43 25 84" link="https://www.qld.gov.au/health" available="24/7" location="Queensland" image={Img13Health}>
						<Typography>13 HEALTH is a confidential phone service that provides health advice to Queenslanders. You can phone and talk to a registered nurse 24 hours a day, 7 days a week for the cost of a local call.</Typography>
					</SupportCard>

					<SupportCard name="Healthline" phone="0800 611 116" link="https://www.healthy.org.nz" available="24/7" location="New Zealand" image={ImgHealthline}>
						<Typography>Trusted health advice available 24/7. Nurses, paramedics, advisors and doctors can help with treatment information and prescriptions. Māori clinician available 8am–8pm. Interpreter services and NZ Relay support available.</Typography>
					</SupportCard>

					<SupportCard name="Lifeline" phone="0508 828 865" link="https://www.lifeline.org.nz" available="24/7" location="New Zealand" image={ImgLifeline2}>
						<Typography>TAUTOKO is operated by trained and experienced social service practitioners who have undergone suicide prevention training. If you think you or someone you know may be thinking about suicide, call for support.</Typography>
					</SupportCard>

					<div className='hidden xl:block' />

					<SupportCard name="Youthline" phone="0800 376 633" link="https://www.youthline.co.nz" available="24/7" location="New Zealand" image={ImgYouthline}>
						<Typography>Youthline supports young people throughout Aotearoa New Zealand — those struggling with mental health as well as those who want to learn, grow and give back. Offers free helpline services, face-to-face counselling, and youth mentoring programmes.</Typography>
					</SupportCard>

				</div>
			</div>

		</Container>
	)
}
