'use client'

import { usePathname } from 'next/navigation'
import { StaticImageData } from 'next/image'
import Link from "next/link"
import React from 'react'

import { InfoOutlined, Tag, ContactMail, Gavel, AutoAwesome, HelpOutline } from '@mui/icons-material'

import Container from "@/components/container"


import ImgAbout from '@/public/images/home/training2.png'
import ImgCallsigns from '@/public/images/home/Gopro3.png'
import ImgContact from '@/public/images/home/Mike1440.png'
import ImgRules from '@/public/images/home/ADFField1.png'
import ImgFAQ from '@/public/images/home/SPEAR_OVERCAST_Final.png'
import ImgValues from '@/public/images/home/1122.png'


const Pages: { href: string, title: string, icon: React.JSX.Element, background: StaticImageData, subtitle?: string }[] = [
	{
		href: '/about',
		title: 'About Us',
		icon: <InfoOutlined fontSize='small' />,
		background: ImgAbout,
	},
	{
		href: '/about/callsigns',
		title: 'Call Signs',
		icon: <Tag fontSize='small' />,
		subtitle: 'Here you can see the current call signs we have and some basic information on how they are utilised in missions.',
		background: ImgCallsigns,
	},
	{
		href: '/about/contact',
		title: 'Contact Us',
		icon: <ContactMail fontSize='small' />,
		subtitle: 'If you have any questions, queries, want to join or simply want to say hello, you can contact us any way you like. The best way is generally through our Discord but we are also active in all our media outlets.',
		background: ImgContact,
	},
	{
		href: '/about/rules',
		title: 'Rules & Expectations',
		icon: <Gavel fontSize='small' />,
		subtitle: 'These are some of the more basic rules and expectations we have for all members within the community. A more in depth version will be provided upon recruitment.',
		background: ImgRules,
	},
	{
		href: '/about/values',
		title: 'Principles & Values',
		icon: <AutoAwesome fontSize='small' />,
		background: ImgValues,
	},
	{
		href: '/about/faq',
		title: 'FAQ',
		icon: <HelpOutline fontSize='small' />,
		subtitle: 'If you cannot find the answer to your questions, please feel free to contact us to seek clarification.',
		background: ImgFAQ,
	}
]



export default function AboutLayout({ children }: Readonly<{ children: React.ReactNode }>) {

	const pathname = usePathname()
	const page = Pages.find(page => page.href === pathname)

	return (
		<Container title={page?.title.toUpperCase()} subtitle={page?.subtitle} background={page?.background} sx={{ bannerHeight: 'md', maxWidth: 'max-w-md' }}>

			<div className='w-full flex flex-row flex-wrap justify-center gap-[2px]' style={{ borderBottom: '1px solid rgba(219, 0, 29, 0.25)' }}>
				{Pages.map((p, i) => {
					const active = page?.href === p.href
					return (
						<Link key={i} href={p.href}>
							<div
								className='flex items-center gap-2 px-4 py-[10px] cursor-pointer transition-all duration-200'
								style={{
									borderBottom: active ? '2px solid var(--red)' : '2px solid transparent',
									marginBottom: -1,
									color: active ? 'var(--foreground)' : 'rgba(237,237,237,0.45)',
									background: active ? 'rgba(219, 0, 29, 0.06)' : 'transparent',
									fontSize: '0.78rem',
									fontWeight: active ? 600 : 500,
									letterSpacing: '0.08em',
									whiteSpace: 'nowrap',
								}}
							>
								<span style={{ display: 'flex', color: active ? 'var(--red)' : 'rgba(219, 0, 29, 0.45)', transition: 'color 0.2s' }}>
									{p.icon}
								</span>
								{p.title.toUpperCase()}
							</div>
						</Link>
					)
				})}
			</div>

			{children}

		</Container>
	)
}
