import { Metadata } from "next"
import Link from 'next/link'

import { Typography, Button, Divider } from '@mui/material'
import { VolunteerActivism, FavoriteBorder, InfoOutlined, AccountBalance, HelpOutline, CardGiftcard, Gavel } from '@mui/icons-material'

import Container from "@/components/container"

import Banner from '@/public/images/home/Rooftopincert.jpg'



export const metadata: Metadata = {
	title: "Donate | Australian Special Operations Taskforce",
}

const infoCards = [
	{
		icon: <FavoriteBorder />,
		title: 'How Donations Help',
		body: 'There are expenses for running a community such as ASOT which can add up quite a bit over the year. In no way do we expect members to donate — it is not a joining requirement.'
	},
	{
		icon: <InfoOutlined />,
		title: 'What is a Donation?',
		body: 'A donation is a gift given without return consideration. As the donator, you should expect no item or service to be given in return, now or in the future.'
	},
	{
		icon: <AccountBalance />,
		title: 'How ASOT Uses Donations',
		body: 'All donations enter an account used to pay for server-related bills such as the virtual server, ArmA clans, TeamSpeak licenses, and website domains.'
	},
	{
		icon: <HelpOutline />,
		title: 'Where Do I Donate?',
		body: 'Donate via the secure PayPal button above. This will take you off our site to PayPal, where your donation is securely processed.'
	},
	{
		icon: <CardGiftcard />,
		title: 'What Will You Receive?',
		body: 'At this stage, due to the nature of our community and Bohemia\'s EULA regarding in-game rewards, nothing will be given to you as a donator on our servers.'
	},
]

const conditions = [
	'Under no circumstance will your donation be disputed or refunded.',
	'Any incentive for donation can be removed, edited or added without notice.',
	'Your donation does not in any way exempt you from following the SOPs and rules expected of other members.',
	'Your donation does not elevate any potential opportunity you may receive in the community.',
	'Any incentive given for your donation is a privilege and may be removed or amended at any time without notice.',
	'Your donation is a contribution to ASOT, held on behalf of thomasdean92@hotmail.com, used solely for server costs and operating expenses.',
]



export default function Page() {
	return (
		<Container title="DONATE TO ASOT" subtitle="Any donations are appreciated and will entirely go towards covering the costs of the community." background={Banner} sx={{ bannerHeight: 'md', maxWidth: 'max-w-6xl' }}>

			{/* PayPal CTA */}
			<div style={{
				border: '1px solid rgba(34,112,221,0.25)',
				borderTop: '2px solid #2270dd',
				background: 'rgba(34,112,221,0.04)',
				padding: '2rem',
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: '1rem',
				textAlign: 'center',
			}}>
				<VolunteerActivism style={{ fontSize: 40, color: '#2270dd', opacity: 0.85 }} />
				<div>
					<Typography variant='h5' fontWeight={700} letterSpacing={2} align="center" style={{ textTransform: 'uppercase' }}>Support ASOT</Typography>
					<Typography style={{ color: 'rgba(237,237,237,0.55)', marginTop: 4, fontSize: '0.9rem' }}>
						Every cent goes directly to keeping ASOT running.
					</Typography>
				</div>
				<Link href="https://www.paypal.com/donate?business=JLAN3RDW9BEAJ&no_recurring=0&item_name=Thankyou from the bottom of our hearts for supporting ASOT. Every cents goes towards ASOT costs or other features.&currency_code=AUD" target='_blank'>
					<Button
						variant='contained'
						size='large'
						startIcon={<VolunteerActivism />}
						style={{ background: '#2270dd', paddingLeft: 32, paddingRight: 32, letterSpacing: 1 }}
					>
						Donate with PayPal
					</Button>
				</Link>
			</div>

			{/* Info Cards */}
			<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4'>
				{infoCards.map((card, i) => {
					const lgCol = ['lg:[grid-column:1/3]', 'lg:[grid-column:3/5]', 'lg:[grid-column:5/7]', 'lg:[grid-column:2/4]', 'lg:[grid-column:4/6]']
					return (
					<div key={card.title} className={lgCol[i]} style={{
						border: '1px solid rgba(219,0,29,0.15)',
						borderTop: '2px solid var(--red)',
						background: 'rgba(219,0,29,0.03)',
						padding: '1.25rem',
						display: 'flex',
						flexDirection: 'column',
						gap: '0.75rem',
					}}>
						<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
							<span style={{ color: 'var(--red)', display: 'flex', opacity: 0.85 }}>{card.icon}</span>
							<Typography fontWeight={600} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase' }}>
								{card.title}
							</Typography>
						</div>
						<Divider style={{ borderColor: 'rgba(219,0,29,0.15)' }} />
						<Typography style={{ color: 'rgba(237,237,237,0.6)', fontSize: '0.875rem', lineHeight: 1.6 }}>
							{card.body}
						</Typography>
					</div>
				)})}
			</div>

			{/* Conditions */}
			<div style={{
				border: '1px solid rgba(255,255,255,0.08)',
				borderLeft: '3px solid rgba(219,0,29,0.5)',
				background: 'rgba(255,255,255,0.02)',
				padding: '1.5rem',
				display: 'flex',
				flexDirection: 'column',
				gap: '1rem',
			}}>
				<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
					<Gavel style={{ color: 'var(--red)', fontSize: 20, opacity: 0.8 }} />
					<Typography fontWeight={600} fontSize='0.8rem' letterSpacing={2} style={{ textTransform: 'uppercase' }}>
						Conditions of Donating
					</Typography>
				</div>
				<Divider style={{ borderColor: 'rgba(255,255,255,0.08)' }} />
				<div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
					{conditions.map((condition, i) => (
						<div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
							<span style={{ color: 'var(--red)', fontSize: '0.75rem', marginTop: 3, flexShrink: 0 }}>▸</span>
							<Typography style={{ color: 'rgba(237,237,237,0.5)', fontSize: '0.825rem', lineHeight: 1.6 }}>
								{condition}
							</Typography>
						</div>
					))}
				</div>
			</div>

		</Container>
	)
}
