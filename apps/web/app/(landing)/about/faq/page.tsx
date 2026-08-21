import { Metadata } from 'next'
import Link from 'next/link'

import SectionHead from '@/components/ui/SectionHead'
import Card, { CardGrid } from '@/components/ui/Card'
import QaRow, { QaStack } from '@/components/ui/QaRow'
import List from '@/components/ui/List'
import AboutShell from '../shell'

export const metadata: Metadata = {
	title: "FAQ | Australian Special Operations Taskforce",
	description: "Frequently asked questions about the Australian Special Operations Taskforce — joining, operations, and community life.",
}

export default function Tab() {
	return (
		<AboutShell page='faq'>
		<section>
			<SectionHead kicker='Common questions' title='Before you apply' more={{ href: '/about/contact', label: 'Still stuck? Contact us' }} />

			<CardGrid columns={6}>
				<Card title='Joining ASOT' kicker='Eligibility' ghost='01' span={3}>
					<QaStack>
						<QaRow index='1.1' question='Is there an age requirement to join ASOT?'>
							<p>You must be 17+ in order to join our group or be vouched for by a current member. We will consider mature younger players.</p>
						</QaRow>
						<QaRow index='1.2' question='Are there player location restrictions?'>
							<p>If you are from Australia or New Zealand, there will be no issues for you. If you are not in these countries, please let us know alongside your SteamID64 and we can advise you if joining is a possibility.</p>
						</QaRow>
						<QaRow index='1.3' question='Do I need a microphone to join ASOT?'>
							<p>Yes. All members require a working microphone.</p>
						</QaRow>
						<QaRow index='1.4' question='Can I be part of another ARMA 3 MILSIM community?'>
							<p>Being a member of other MILSIM/REALISM groups similar or different to ASOT regardless of times of play are not permitted. If you are, or wish to get involved in a RP community or other group, you are welcome to do so.</p>
							<p>Please confirm with our staff if your alternate group conflicts.</p>
						</QaRow>
					</QaStack>
				</Card>

				<Card title='Game & setup' kicker='Requirements' ghost='02' span={3}>
					<QaStack>
						<QaRow index='2.1' question='Do you force first person?'>
							<p>Yes.</p>
						</QaRow>
						<QaRow index='2.2' question='Do I need a paid version of ARMA 3?'>
							<p>Yes. You must have a legitimate copy of ARMA 3 as our servers use Battleye anti-cheat software. If it is discovered you are using an illegal copy or using cheats of any kind, you will be banned from the community immediately.</p>
						</QaRow>
						<QaRow index='2.3' question='Do I need ARMA 3 DLC to play?'>
							<p>Although encouraged, you will not require them to join our servers. Although, you will not be able to use certain vehicles and equipment without getting the annoying watermark appear on your screen. We recommend picking them up when they go on sale.</p>
						</QaRow>
						<QaRow index='2.4' question='What mods do you use?'>
							<p>We currently have 1 mod list that we use for our missions and on our training server.</p>
							<p>Main Modlist: <Link href='https://steamcommunity.com/sharedfiles/filedetails/?id=2461898157' target='_blank'>Steam Workshop</Link></p>
							<p>Any other mission mod lists will be posted in the discord noticeboard channel.</p>
						</QaRow>
					</QaStack>
				</Card>

				<Card title='Playing with us' kicker='Life in the unit' ghost='03' span={6}>
					<QaStack columns={2}>
						<QaRow index='3.1' question='Do you ever do PvP events?'>
							<p>Occasionally PvP events are hosted in house but our main focus is PvE. These events are optional for members and will generally not interfere with our weekend night missions.</p>
						</QaRow>
						<QaRow index='3.2' question='Does it cost money to play?'>
							<p>No, however, running the community does carry some costs that are mostly paid for by LTGEN Thomas and his head staff. Any donations are truly appreciated and will significantly help with covering those bills each month. All donations only go towards the community costs, no personal profits are kept, ever!</p>
						</QaRow>
						<QaRow index='3.3' question='How often do you play?'>
							<p>Our main operations are run weekly on Saturdays and Sundays. Once you become a member, you will be given the opportunity to join 1 Platoon, 2 Platoon or 3 Platoon.</p>
							<List columns={1} items={[
								'1 Platoon conducts missions on Saturday',
								'2 Platoon conducts missions on Sunday',
								'3 Platoon (support assets) support both Saturday and Sunday',
							]} />
							<p>We also run mid-week missions and trainings but these are optional.</p>
						</QaRow>
						<QaRow index='3.4' question='How many members do you have?'>
							<p>To see our current strength and manning, please refer to the ORBAT tab located at the top of the page.</p>
						</QaRow>
						<QaRow index='3.5' question='Do you allow non-members to join operations?'>
							<p>Unfortunately not. Generally we do not allow members of the public or from other communities to join in our operations. If you are a representative of another community or smaller group, please speak to a member of HQ about attending.</p>
						</QaRow>
						<QaRow index='3.6' question='Do you do joint operations with other units?'>
							<p>Generally not but there have been instances where we have conducted joint operations with other MILSIM groups.</p>
							<p>If you wish to conduct a joint operation with our community and you are a representative of a community, please approach a member of ASOT Staff or HQ about this in our Discord.</p>
						</QaRow>
					</QaStack>
				</Card>
			</CardGrid>
		</section>
		</AboutShell>
	)
}
