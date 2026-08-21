import { Metadata } from 'next'
import Image from 'next/image'

import SectionHead from '@/components/ui/SectionHead'
import Card, { CardGrid } from '@/components/ui/Card'
import { MedalIcon, TargetIcon } from '@/components/ui/icons'
import TimeZones from './timezones'
import s from '@/styles/shell.module.css'

import LeadImg from '@/public/images/home/training2.png'
import AboutShell from './shell'

export const metadata: Metadata = {
	title: "About Us | Australian Special Operations Taskforce",
	description: "Learn about the Australian Special Operations Taskforce — our history, structure, and mission in the ARMA 3 milsim community.",
}

export default function Tab() {
	return (
		<AboutShell page='index'>
		<section>
			<SectionHead kicker='The unit' title='Who we are' more={{ href: '/orbat', label: 'Full ORBAT' }} />

			<CardGrid columns={4}>
				<article className={s.lead}>
					<div className={s.leadImg}>
						<Image src={LeadImg} alt='' fill style={{ objectFit: 'cover' }} />
					</div>
					<div className={s.leadBody}>
						<h3>Who Are We?</h3>
						<p>We are an ARMA 3 community that aims to achieve realistic yet enjoyable game play in what we call a semi-hardcore game style. What this means is we use real to life military tactics, procedures and structure whilst still maintaining a relaxed approach. We do not expect members to address staff by rank or 'Sir/Ma'am'.</p>
						<p>With many years experience and tens of thousands of hours of experience throughout the group, our knowledge is vast. We have a number of previous and currently serving members of the armed forces who have helped develop our game play into a good balance of realism and playability.</p>
					</div>
				</article>

				<Card title='Who We Play As' kicker='Identity' ghost='02' icon={<MedalIcon />}>
					<p>We are based on a fictional department/corps of the Australian Defence Force (ADF). Our ORBAT, procedures and structure are created to resemble closely to the ADF. Being fictional has allowed us to create a flexible and varied ORBAT including many vehicles, air frames and weapons used by other countries. Essentially, it allows us to use what we want, when we want.</p>
				</Card>

				<Card title='Mission Types and Styles' kicker='Gameplay' ghost='03' icon={<TargetIcon />}>
					<p>Our missions are created by our highly skilled mission creation team and lead by our dedicated Zeus team. This allows for well balanced, challenging yet enjoyable game play.</p>
					<p>Although primarily focused on the modern era ADF/military, we also run missions based throughout the ages for both our main operations and mid-week missions/events. One week it could be WWII, next could be futuristic. The same ORBAT, structure and procedures are kept relatively the same, but this allows us to play as ASOT during any period of humanity. Fictional missions are also an option.</p>
				</Card>

				<Card title='When Do We Run Missions?' kicker='Schedule' ghost='04' span={2}>
					<TimeZones />
				</Card>
			</CardGrid>
		</section>
		</AboutShell>
	)
}
