import { Metadata } from "next"

import { Typography } from '@mui/material'
import { MilitaryTech, Schedule, Map, InfoOutlined } from '@mui/icons-material'

import InfoCard from '@/components/info-card'
import TimeZones from './timezones'


export const metadata: Metadata = {
	title: "About Us | Australian Special Operations Taskforce",
	description: "Learn about the Australian Special Operations Taskforce — our history, structure, and mission in the ARMA 3 milsim community.",
}



export default function Tab() {
	return (
		<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>

			<InfoCard title='Who Are We?' icon={<InfoOutlined />}>
				<Typography>We are an ARMA 3 community that aims to achieve realistic yet enjoyable game play in what we call a semi-hardcore game style. What this means is we use real to life military tactics, procedures and structure whilst still maintaining a relaxed approach. We do not expect members to address staff by rank or 'Sir/Ma'am'.</Typography>
				<br />
				<Typography>With many years experience and tens of thousands of hours of experience throughout the group, our knowledge is vast. We have a number of previous and currently serving members of the armed forces who have helped develop our game play into a good balance of realism and playability.</Typography>
			</InfoCard>

			<InfoCard title='Who We Play As' icon={<MilitaryTech />}>
				<Typography>We are based on a fictional department/corps of the Australian Defence Force (ADF). Our ORBAT, procedures and structure are created to resemble closely to the ADF. Being fictional has allowed us to create a flexible and varied ORBAT including many vehicles, air frames and weapons used by other countries. Essentially, it allows us to use what we want, when we want.</Typography>
			</InfoCard>

			<InfoCard title='When Do We Run Missions?' icon={<Schedule />}>
				<TimeZones />
			</InfoCard>

			<InfoCard title='Mission Types and Styles' icon={<Map />}>
				<Typography>Our missions are created by our highly skilled mission creation team and lead by our dedicated Zeus team. This allows for well balanced, challenging yet enjoyable game play.</Typography>
				<br />
				<Typography>Although primarily focused on the modern era ADF/military, we also run missions based throughout the ages for both our main operations and mid-week missions/events. One week it could be WWII, next could be futuristic. The same ORBAT, structure and procedures are kept relatively the same, but this allows us to play as ASOT during any period of humanity. Fictional missions are also an option.</Typography>
			</InfoCard>

		</div>
	)
}
