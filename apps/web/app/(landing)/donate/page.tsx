import { Metadata } from 'next'
import Image from 'next/image'

import Button from '@/components/ui/Button'
import List from '@/components/ui/List'
import QaRow, { QaStack } from '@/components/ui/QaRow'
import SectionHead, { Kicker } from '@/components/ui/SectionHead'
import Topo from '@/components/ui/Topo'
import { CrateIcon } from '@/components/ui/icons'

import Banner from '@/public/images/home/Rooftopincert.jpg'
import s from '@/styles/donate.module.css'

export const metadata: Metadata = {
	title: 'Donate | Australian Special Operations Taskforce',
	description: 'Support the Australian Special Operations Taskforce — contributions help cover server and community infrastructure costs.',
}

/*
   The one page that asks for something.

   It does not render Container: see the note at the top of donate.module.css
   for why the shared masthead is the wrong shell for a page that is pitched at
   rather than read. Everything else on it is the standard vocabulary — the
   notched button, the Q&A rows the FAQ uses, the real list Rules uses.
*/

const PAYPAL = 'https://www.paypal.com/donate?business=JLAN3RDW9BEAJ&no_recurring=0&item_name=Thankyou from the bottom of our hearts for supporting ASOT. Every cents goes towards ASOT costs or other features.&currency_code=AUD'

/* Verbatim from the page this replaces. The five answers are the whole of what
   a donor needs before pressing the button, which is why they are the body of
   the page rather than a sidebar on it. */
const NOTES = [
	{
		q: 'How donations help',
		a: 'There are expenses for running a community such as ASOT which can add up quite a bit over the year. In no way do we expect members to donate — it is not a joining requirement.',
	},
	{
		q: 'What is a donation?',
		a: 'A donation is a gift given without return consideration. As the donator, you should expect no item or service to be given in return, now or in the future.',
	},
	{
		q: 'How ASOT uses donations',
		a: 'All donations enter an account used to pay for server-related bills such as the virtual server, ArmA clans, TeamSpeak licenses, and website domains.',
	},
	{
		q: 'Where do I donate?',
		a: 'Donate via the secure PayPal button above. This will take you off our site to PayPal, where your donation is securely processed.',
	},
	{
		q: 'What will you receive?',
		a: 'At this stage, due to the nature of our community and Bohemia\'s EULA regarding in-game rewards, nothing will be given to you as a donator on our servers.',
	},
]

const CONDITIONS = [
	'Under no circumstance will your donation be disputed or refunded.',
	'Any incentive for donation can be removed, edited or added without notice.',
	'Your donation does not in any way exempt you from following the SOPs and rules expected of other members.',
	'Your donation does not elevate any potential opportunity you may receive in the community.',
	'Any incentive given for your donation is a privilege and may be removed or amended at any time without notice.',
	'Your donation is a contribution to ASOT, held on behalf of thomasdean92@hotmail.com, used solely for server costs and operating expenses.',
]

export default function Page() {
	return (
		<div className={s.page}>

			<header className={s.band}>
				<div className={s.bandImg}>
					<Image src={Banner} alt='' fill priority placeholder='blur' style={{ objectFit: 'cover' }} />
				</div>

				{/* The mask shares its stops with the veil's ellipse. */}
				<Topo opacity={0.075} driftSeconds={900} mask='edges' />
				<div className={s.veil} />

				<div className={s.bandIn}>
					<Kicker centred>Support the unit</Kicker>
					<h1 className={s.title}>Keep it<br />running</h1>
					<p className={s.lede}>
						Every cent goes to the servers, the licences and the domains. Nothing on
						this site is behind a donation.
					</p>

					<Button variant='amber' href={PAYPAL} external className={s.cta}>
						<CrateIcon /> Donate with PayPal
					</Button>

					<div className={s.assure}>
						<span>Secure</span>
						<i />
						<span>AUD</span>
						<i />
						<span>Processed off-site by PayPal</span>
					</div>
				</div>

				<div className={s.cue} aria-hidden='true'>
					<span>What this means</span>
					<i />
				</div>
			</header>

			<div className={s.doc}>

				<section>
					<SectionHead kicker='Before you give' title='Five things, plainly' />
					<QaStack>
						{NOTES.map((note, i) => (
							<QaRow key={note.q} index={String(i + 1).padStart(2, '0')} question={note.q}>
								<p>{note.a}</p>
							</QaRow>
						))}
					</QaStack>
				</section>

				<section>
					<SectionHead kicker='Annex A' title='Conditions of donating' />
					<List items={CONDITIONS} />
				</section>

				<div className={s.close}>
					<p className={s.closeLine}>Now you know where it goes.</p>
					<Button variant='amber' href={PAYPAL} external>
						<CrateIcon /> Donate with PayPal
					</Button>
				</div>

			</div>
		</div>
	)
}
