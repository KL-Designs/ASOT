import { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import SectionHead from '@/components/ui/SectionHead'
import s from '@/styles/shell.module.css'

export const metadata: Metadata = {
	title: "Contact | Australian Special Operations Taskforce",
	description: "Get in touch with the Australian Special Operations Taskforce leadership and staff team.",
}

function Channel({ mark, title, accent, href, label, description, external }: {
	mark: string
	title: string
	accent: string
	href: string
	label: string
	description: string
	external?: boolean
}) {
	return (
		<Link
			href={href as any}
			target={external ? '_blank' : '_self'}
			className={s.channel}
			style={{ '--acc': accent } as React.CSSProperties}
		>
			<div className={s.channelH}><i>{mark}</i><b>{title}</b></div>
			<p>{description}</p>
			<span className={s.channelV}>{label}</span>
		</Link>
	)
}

export default function Tab() {
	return (
		<>
		<section>
			<SectionHead kicker='Get in touch' title='Contact us' />

			<div className={s.channels}>
				<Channel
					mark='TS'
					title='TeamSpeak'
					accent='#00bcd4'
					href='ts3server://ts.asotmilsim.com'
					label='ts.asotmilsim.com'
					description='Join our TeamSpeak server for real-time voice communications during operations.'
				/>
				<Channel
					mark='f'
					title='Facebook'
					accent='#1877F2'
					href='https://www.facebook.com/AustralianSpecialOperationsTaskforce'
					label='AustralianSpecialOperationsTaskforce'
					description='Follow us on Facebook for updates, event announcements, and community news.'
					external
				/>
				<Channel
					mark='@'
					title='Email'
					accent='rgb(219,0,29)'
					href='mailto:australianspecialoperationstaskforce@hotmail.com'
					label='australianspecialoperationstaskforce@hotmail.com'
					description='Send us a direct message for any inquiries, applications, or general questions.'
				/>
			</div>
		</section>

		<section className={s.widget}>
			<div className={s.channelH}>
				<i style={{ color: 'var(--discord)' }}>D</i>
				<div>
					<b>Discord</b>
					<p style={{ marginTop: 2 }}>Our primary community hub — join to connect with members, ask questions, and stay up to date.</p>
				</div>
			</div>
			<iframe
				title='ASOT Discord'
				src='https://discord.com/widget?id=744518510092484660&theme=dark'
			/>
		</section>
		</>
	)
}
