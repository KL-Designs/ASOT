import { Metadata } from "next"

import { Typography } from '@mui/material'
import { Gavel, Event, HeadsetMic, MilitaryTech, Forum } from '@mui/icons-material'

import InfoCard from '@/components/info-card'


export const metadata: Metadata = {
	title: "Rules | Australian Special Operations Taskforce"
}



export default function Tab() {
	return (
		<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>

			<InfoCard title='Section 1 — General' icon={<Gavel />}>
				<div className='flex flex-col gap-2'>
					<Typography>- All members must treat everyone, including guests with the utmost respect.</Typography>
					<Typography>- There is strictly no bullying, harassment or toxic behaviour allowed within the community.</Typography>
					<Typography>- Members not associated with J1 are not to attempt to recruit or post recruitment content anywhere. Recommendations or invite links are acceptable to be passed onto potential new recruits.</Typography>
					<Typography>- Members not associated with J3 are not to attempt to train new members.</Typography>
					<Typography>- Be willing to assist all new members with any issues or concerns they may be experiencing.</Typography>
					<Typography>- If you're not 15mins early, you're late!</Typography>
				</div>
			</InfoCard>

			<InfoCard title='Section 2 — Attendance' icon={<Event />}>
				<div className='flex flex-col gap-2'>
					<Typography>- Members who are in a position within a call sign are expected to attend at least 3 of 4 weekends per month.</Typography>
					<Typography>- Reservists are expected to attend at least 2 of 4 weekends per month.</Typography>
					<Typography>- Members' expected attendance is to be tracked in the op-attendance channel on the discord each week.</Typography>
					<Typography>- Not meeting the required level of attendance may result in removal from the community. We require keen and dedicated members.</Typography>
				</div>
			</InfoCard>

			<InfoCard title='Section 3 — TeamSpeak' icon={<HeadsetMic />}>
				<div className='flex flex-col gap-2'>
					<Typography>- Uphold a high level of seriousness and sensibility.</Typography>
					<Typography>- Have their Teamspeak name set to the same as it would be when in-game on ArmA.</Typography>
					<Typography>- Treat new and existing Teamspeak users with respect.</Typography>
					<Typography>- Use Teamspeak permissions (Move/Ban/Kick) sensibly and not to the detriment of others.</Typography>
					<Typography>- Point out teamspeak permission errors (IE a user has move/kick abilities when they shouldn't be able to)</Typography>
					<Typography>- Ensure that, if they have channel admin in any channel, the channels name, topic and description is not vulgar, pornographic, racist or homophobic.</Typography>
				</div>
			</InfoCard>

			<InfoCard title='Section 4 — Operations & Missions' icon={<MilitaryTech />}>
				<div className='flex flex-col gap-2'>
					<Typography>- All members are to set their in-game name with the following format – "PTE Name or CAPT Name".</Typography>
					<Typography>- Listen to the orders of those with higher rank no matter which call sign they are from.</Typography>
					<Typography>- Wait for permission/your turn to speak during briefings and debriefings.</Typography>
					<Typography>- Use radio's or general voice for in-game/in character related chat.</Typography>
					<Typography>- Posting in global chat is forbidden apart from admin related reasons.</Typography>
					<Typography>- Use a legitimate, unhacked version of ARMA 3.</Typography>
					<Typography>- Only use vehicles their role is permitted to use. (Eg: Only members in Hotel and Foxtrot may fly)</Typography>
					<Typography>- Do not communicate about operation related matters on any out of game communication platform whilst in operations.</Typography>
					<Typography>- Correctly use radio calls/call signs.</Typography>
					<Typography>- Do not team kill other BLUFOR players or shoot at unarmed civilians.</Typography>
					<Typography>- Ensure your mods are up to date at least 48 hours before the commencing of an operation or training.</Typography>
					<Typography>- Provide constructive and respectful feedback on your experience during an operation.</Typography>
					<Typography>- Leave FOB's, HQ's and the training server in a tidy state for other members to use.</Typography>
				</div>
			</InfoCard>

			<InfoCard title='Section 5 — Discord & Media' icon={<Forum />}>
				<div className='flex flex-col gap-2'>
					<Typography>- DO NOT post, link to or otherwise reference vulgar, racist or sexual content.</Typography>
					<Typography>- DO NOT post, link to or otherwise reference shit posting/flame baiting/troll or other bait related topics or replies.</Typography>
					<Typography>- DO NOT Spam posts or replies.</Typography>
					<Typography>- Be active and willing to assist new members with any issues or concerns they may be experiencing.</Typography>
					<Typography>- Use the correct channels for the correct content.</Typography>
				</div>
			</InfoCard>

		</div>
	)
}
