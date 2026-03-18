import { Metadata } from "next"
import Link from 'next/link'

import { Typography } from '@mui/material'
import { Cake, Language, Mic, Block, Visibility, Paid, Extension, Build, EmojiEvents, MoneyOff, Schedule, PeopleAlt, PersonOff, Handshake } from '@mui/icons-material'

import InfoCard from '@/components/info-card'


export const metadata: Metadata = {
	title: "FAQ | Australian Special Operations Taskforce"
}



export default function Tab() {
	return (
		<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>

			<InfoCard title='Is there an age requirement to join ASOT?' icon={<Cake />}>
				<Typography>You must be 17+ in order to join our group or be vouched for by a current member. We will consider mature younger players.</Typography>
			</InfoCard>

			<InfoCard title='Are there player location restrictions?' icon={<Language />}>
				<Typography>If you are from Australia or New Zealand, there will be no issues for you. If you are not in these countries, please let us know alongside your SteamID64 and we can advise you if joining is a possibility.</Typography>
			</InfoCard>

			<InfoCard title='Do I need a microphone to join ASOT?' icon={<Mic />}>
				<Typography>Yes. All members require a working microphone.</Typography>
			</InfoCard>

			<InfoCard title='Can I be part of another ARMA 3 MILSIM community?' icon={<Block />}>
				<Typography>Being a member of other MILSIM/REALISM groups similar or different to ASOT regardless of times of play are not permitted. If you are, or wish to get involved in a RP community or other group, you are welcome to do so.</Typography>
				<br />
				<Typography>Please confirm with our staff if your alternate group conflicts.</Typography>
			</InfoCard>

			<InfoCard title='Do you force first person?' icon={<Visibility />}>
				<Typography>Yes.</Typography>
			</InfoCard>

			<InfoCard title='Do I need a paid version of ARMA 3?' icon={<Paid />}>
				<Typography>Yes. You must have a legitimate copy of ARMA 3 as our servers use Battleye anti-cheat software. If it is discovered you are using an illegal copy or using cheats of any kind, you will be banned from the community immediately.</Typography>
			</InfoCard>

			<InfoCard title='Do I need ARMA 3 DLC to play?' icon={<Extension />}>
				<Typography>Although encouraged, you will not require them to join our servers. Although, you will not be able to use certain vehicles and equipment without getting the annoying watermark appear on your screen. We recommend picking them up when they go on sale.</Typography>
			</InfoCard>

			<InfoCard title='What mods do you use?' icon={<Build />}>
				<Typography>We currently have 1 mod list that we use for our missions and on our training server.</Typography>
				<br />
				<Typography>Main Modlist: <Link className='underline break-words' href='https://steamcommunity.com/sharedfiles/filedetails/?id=2461898157' target='_blank'>Steam Workshop</Link></Typography>
				<br />
				<Typography>Any other mission mod lists will be posted in the discord noticeboard channel.</Typography>
			</InfoCard>

			<InfoCard title='Do you ever do PvP events?' icon={<EmojiEvents />}>
				<Typography>Occasionally PvP events are hosted in house but our main focus is PvE. These events are optional for members and will generally not interfere with our weekend night missions.</Typography>
			</InfoCard>

			<InfoCard title='Does it cost money to play?' icon={<MoneyOff />}>
				<Typography>No, however, running the community does carry some costs that are mostly paid for by LTGEN Thomas and his head staff. Any donations are truly appreciated and will significantly help with covering those bills each month. All donations only go towards the community costs, no personal profits are kept, ever!</Typography>
			</InfoCard>

			<InfoCard title='How often do you play?' icon={<Schedule />}>
				<Typography>Our main operations are run weekly on Saturdays and Sundays. Once you become a member, you will be given the opportunity to join 1 Platoon, 2 Platoon or 3 Platoon.</Typography>
				<br />
				<Typography>- 1 Platoon conducts missions on Saturday</Typography>
				<Typography>- 2 Platoon conducts missions on Sunday</Typography>
				<Typography>- 3 Platoon (support assets) support both Saturday and Sunday</Typography>
				<br />
				<Typography>We also run mid-week missions and trainings but these are optional.</Typography>
			</InfoCard>

			<InfoCard title='How many members do you have?' icon={<PeopleAlt />}>
				<Typography>To see our current strength and manning, please refer to the ORBAT tab located at the top of the page.</Typography>
			</InfoCard>

			<InfoCard title='Do you allow non-members to join operations?' icon={<PersonOff />}>
				<Typography>Unfortunately not. Generally we do not allow members of the public or from other communities to join in our operations. If you are a representative of another community or smaller group, please speak to a member of HQ about attending.</Typography>
			</InfoCard>

			<InfoCard title='Do you do joint operations with other units?' icon={<Handshake />}>
				<Typography>Generally not but there have been instances where we have conducted joint operations with other MILSIM groups.</Typography>
				<Typography>If you wish to conduct a joint operation with our community and you are a representative of a community, please approach a member of ASOT Staff or HQ about this in our Discord.</Typography>
			</InfoCard>

		</div>
	)
}
