import { Metadata } from 'next'

import SectionHead from '@/components/ui/SectionHead'
import Card, { CardGrid } from '@/components/ui/Card'
import List from '@/components/ui/List'
import AboutShell from '../shell'

export const metadata: Metadata = {
	title: "Rules | Australian Special Operations Taskforce",
	description: "The community rules and standards of conduct for all members of the Australian Special Operations Taskforce.",
}

export default function Tab() {
	return (
		<AboutShell page='rules'>
		<section>
			<SectionHead kicker='Conduct' title='What we expect' />

			<CardGrid columns={6}>
				<Card title='General' kicker='Section 1' ghost='01' span={3}>
					<List items={[
						'All members must treat everyone, including guests with the utmost respect.',
						'There is strictly no bullying, harassment or toxic behaviour allowed within the community.',
						'Members not associated with J1 are not to attempt to recruit or post recruitment content anywhere. Recommendations or invite links are acceptable to be passed onto potential new recruits.',
						'Members not associated with J3 are not to attempt to train new members.',
						'Be willing to assist all new members with any issues or concerns they may be experiencing.',
						"If you're not 15mins early, you're late!",
					]} />
				</Card>

				<Card title='Attendance' kicker='Section 2' ghost='02' span={3}>
					<List items={[
						'Members who are in a position within a call sign are expected to attend at least 3 of 4 weekends per month.',
						'Reservists are expected to attend at least 2 of 4 weekends per month.',
						"Members' expected attendance is to be tracked in the op-attendance channel on the discord each week.",
						'Not meeting the required level of attendance may result in removal from the community. We require keen and dedicated members.',
					]} />
				</Card>

				<Card title='TeamSpeak' kicker='Section 3' ghost='03' span={2}>
					<List items={[
						'Uphold a high level of seriousness and sensibility.',
						'Have their Teamspeak name set to the same as it would be when in-game on ArmA.',
						'Treat new and existing Teamspeak users with respect.',
						'Use Teamspeak permissions (Move/Ban/Kick) sensibly and not to the detriment of others.',
						"Point out teamspeak permission errors (IE a user has move/kick abilities when they shouldn't be able to)",
						'Ensure that, if they have channel admin in any channel, the channels name, topic and description is not vulgar, pornographic, racist or homophobic.',
					]} />
				</Card>

				<Card title='Operations & Missions' kicker='Section 4' ghost='04' span={4}>
					<List columns={2} items={[
						'All members are to set their in-game name with the following format – "PTE Name or CAPT Name".',
						'Listen to the orders of those with higher rank no matter which call sign they are from.',
						'Wait for permission/your turn to speak during briefings and debriefings.',
						"Use radio's or general voice for in-game/in character related chat.",
						'Posting in global chat is forbidden apart from admin related reasons.',
						'Use a legitimate, unhacked version of ARMA 3.',
						'Only use vehicles their role is permitted to use. (Eg: Only members in Hotel and Foxtrot may fly)',
						'Do not communicate about operation related matters on any out of game communication platform whilst in operations.',
						'Correctly use radio calls/call signs.',
						'Do not team kill other BLUFOR players or shoot at unarmed civilians.',
						'Ensure your mods are up to date at least 48 hours before the commencing of an operation or training.',
						'Provide constructive and respectful feedback on your experience during an operation.',
						"Leave FOB's, HQ's and the training server in a tidy state for other members to use.",
					]} />
				</Card>

				<Card title='Discord & Media' kicker='Section 5' ghost='05' span={6}>
					<List columns={3} items={[
						'DO NOT post, link to or otherwise reference vulgar, racist or sexual content.',
						'DO NOT post, link to or otherwise reference shit posting/flame baiting/troll or other bait related topics or replies.',
						'DO NOT Spam posts or replies.',
						'Be active and willing to assist new members with any issues or concerns they may be experiencing.',
						'Use the correct channels for the correct content.',
					]} />
				</Card>
			</CardGrid>
		</section>
		</AboutShell>
	)
}
