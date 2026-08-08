import { Metadata } from "next"
import Link from 'next/link'
import React from 'react'

import { HeadsetMic, Groups, Email as EmailIcon, Forum, Launch } from '@mui/icons-material'


export const metadata: Metadata = {
	title: "Contact | Australian Special Operations Taskforce",
	description: "Get in touch with the Australian Special Operations Taskforce leadership and staff team.",
}


function ContactCard({ icon, title, accentColor, accentRgb, href, label, description, external }: {
	icon: React.ReactNode
	title: string
	accentColor: string
	accentRgb: string
	href: string
	label: string
	description: string
	external?: boolean
}) {
	return (
		<Link href={href as any} target={external ? '_blank' : '_self'}>
			<div
				className='h-full flex flex-col gap-4 p-5 cursor-pointer transition-all duration-200 hover:bg-white/[0.04]'
				style={{
					border: '1px solid rgba(255,255,255,0.07)',
					borderTop: `2px solid ${accentColor}`,
					background: 'rgba(255,255,255,0.02)',
				}}
			>
				<div className='flex items-center gap-3'>
					<div style={{ padding: 10, background: `rgba(${accentRgb}, 0.12)`, color: accentColor, display: 'flex', flexShrink: 0 }}>
						{icon}
					</div>
					<span style={{ fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.85rem' }}>
						{title.toUpperCase()}
					</span>
				</div>

				<p style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.45)', margin: 0 }}>
					{description}
				</p>

				<div className='flex items-center gap-2 mt-auto' style={{ color: accentColor, fontSize: '0.8rem', fontWeight: 500, wordBreak: 'break-all' }}>
					<span>{label}</span>
					{external && <Launch style={{ fontSize: 14, flexShrink: 0 }} />}
				</div>
			</div>
		</Link>
	)
}


export default function Tab() {
	return (
		<div className='flex flex-col gap-5'>

			<div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
				<ContactCard
					icon={<HeadsetMic />}
					title="TeamSpeak"
					accentColor="#00bcd4"
					accentRgb="0,188,212"
					href="ts3server://ts.asotmilsim.com"
					label="ts.asotmilsim.com"
					description="Join our TeamSpeak server for real-time voice communications during operations."
				/>
				<ContactCard
					icon={<Groups />}
					title="Facebook"
					accentColor="#1877F2"
					accentRgb="24,119,242"
					href="https://www.facebook.com/AustralianSpecialOperationsTaskforce"
					label="AustralianSpecialOperationsTaskforce"
					description="Follow us on Facebook for updates, event announcements, and community news."
					external
				/>
				<ContactCard
					icon={<EmailIcon />}
					title="Email"
					accentColor="rgb(219,0,29)"
					accentRgb="219,0,29"
					href="mailto:australianspecialoperationstaskforce@hotmail.com"
					label="australianspecialoperationstaskforce@hotmail.com"
					description="Send us a direct message for any inquiries, applications, or general questions."
				/>
			</div>

			<div
				className='flex flex-col gap-4 p-5'
				style={{
					border: '1px solid rgba(88,101,242,0.25)',
					borderTop: '2px solid #5865F2',
					background: 'rgba(88,101,242,0.04)',
				}}
			>
				<div className='flex items-center gap-3'>
					<div style={{ padding: 10, background: 'rgba(88,101,242,0.15)', color: '#5865F2', display: 'flex' }}>
						<Forum />
					</div>
					<div>
						<div style={{ fontWeight: 700, letterSpacing: '0.1em', fontSize: '0.85rem' }}>DISCORD</div>
						<div style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.45)', marginTop: 2 }}>
							Our primary community hub — join to connect with members, ask questions, and stay up to date.
						</div>
					</div>
				</div>
				<iframe
					className='w-full'
					style={{ height: 500, border: 'none' }}
					src='https://discord.com/widget?id=744518510092484660&theme=dark'
				/>
			</div>

		</div>
	)
}
