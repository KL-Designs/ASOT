import { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import SectionHead from '@/components/ui/SectionHead'
import Topo from '@/components/ui/Topo'
import Pulse from '@/components/ui/Pulse'
import { DiscordIcon } from '@/components/ui/icons'
import { formatUntil } from '@/lib/contact/countdown'
import { getFeaturedOp, getRosterCount } from '@/lib/landing'
import { getOnlineCache } from '@/lib/teamspeak/cache'
import s from '@/styles/shell.module.css'
import AboutShell from '../shell'
import NextOpFigure from './next-op-figure'

export const metadata: Metadata = {
	title: 'Contact | Australian Special Operations Taskforce',
	description: 'Get in touch with the Australian Special Operations Taskforce leadership and staff team.',
}

/*
   The page opened on an embedded Discord widget: a third-party iframe carrying
   Discord's blurple, Discord's type, Discord's button and a scrolling list of
   our members' display names, published to anyone who loaded the page. It was
   also the only element doing any visual work, which is why everything around
   it read as thin.

   What it genuinely provided was proof the place is alive, and that is worth
   keeping — so it is replaced by the same proof told in our own numbers. All
   three already exist for the navbar rail (app/api/nav/status), and this page
   is a server component, so it reads the loaders directly rather than going
   back out through the route.
*/

export const dynamic = 'force-dynamic'

export default async function Tab() {
	const [nextOp, roster] = await Promise.all([
		getFeaturedOp().catch(() => null),
		getRosterCount().catch(() => null),
	])

	// In-process cache filled by the teamspeak-cache cron. Cold on a fresh boot,
	// which is a different thing from "nobody is connected" — null renders the
	// tile as unknown rather than as an honest-looking zero.
	const online = getOnlineCache()?.clients.length ?? null

	const until = nextOp ? formatUntil(nextOp.date, Date.now()) : null

	return (
		<AboutShell page='contact'>

			<section>
				<div className={s.presence}>
					<Topo opacity={0.06} driftSeconds={900} mask='fade' />

					<div className={s.presenceH}>
						<Pulse tone={online ? 'live' : 'idle'} />
						<span>Right now</span>
						<b>Live from our own servers</b>
					</div>

					<div className={s.presenceGrid}>
						<div className={s.presenceCell}>
							<div className={s.presenceK}>On TeamSpeak</div>
							<div className={`${s.presenceN} ${online ? s.presenceNLive : s.presenceNIdle}`}>
								{online ?? '—'}
							</div>
							<p>
								{online
									? 'Members in voice as you read this. Anyone can drop in and listen.'
									: 'Nobody in voice at the moment. Post in the Discord — someone picks it up.'}
							</p>
						</div>

						<div className={s.presenceCell}>
							<div className={s.presenceK}>Active roster</div>
							<div className={s.presenceN}>{roster ?? '—'}</div>
							<p>Members holding a posting in the ORBAT, reservists excluded.</p>
						</div>

						<div className={s.presenceCell}>
							<div className={s.presenceK}>Next operation</div>
							<div className={`${s.presenceN} ${until ? s.presenceNAmber : s.presenceNIdle}`}>
								{nextOp && until
									? <NextOpFigure target={nextOp.date} initial={until} />
									: '—'}
							</div>
							<p>
								{nextOp
									? <>{nextOp.title} — <Link href={`/operations/${nextOp.id}` as any}>see the board</Link>.</>
									: 'Nothing on the board yet. Two run most weeks, posted a few days out.'}
							</p>
						</div>
					</div>
				</div>

				<p className={s.presenceLede}>
					There is almost always someone about. The fastest way to reach us is to walk in
					and say hello — and if it is about joining, <Link href='/join'>J1 would rather
					have your application</Link> than a message.
				</p>
			</section>

			<section>
				<SectionHead kicker='Ways in' title='Walk in anywhere' />

				<div className={s.channels}>
					<Link href='https://discord.gg/asot' target='_blank' className={s.channel} style={{ '--acc': 'var(--discord)' } as React.CSSProperties}>
						<div className={s.channelH}>
							<i aria-hidden='true'><DiscordIcon /></i>
							<b>Discord</b>
							<em>Start here</em>
						</div>
						<p>Our primary community hub — join to connect with members, ask questions, and stay up to date.</p>
						<span className={s.channelV}>discord.gg/asot</span>
					</Link>

					<Link href={'ts3server://ts.asotmilsim.com' as any} className={s.channel} style={{ '--acc': '#00bcd4' } as React.CSSProperties}>
						<div className={s.channelH}>
							<i aria-hidden='true'>TS</i>
							<b>TeamSpeak</b>
							{online != null && online > 0 && (
								<em className={s.channelLive}><Pulse />{online} online</em>
							)}
						</div>
						<p>Join our TeamSpeak server for real-time voice communications during operations.</p>
						<span className={s.channelV}>ts.asotmilsim.com</span>
					</Link>

					<Link href='mailto:australianspecialoperationstaskforce@hotmail.com' className={s.channel} style={{ '--acc': 'var(--red)' } as React.CSSProperties}>
						<div className={s.channelH}>
							<i aria-hidden='true'>@</i>
							<b>Email</b>
						</div>
						<p>Send us a direct message for any inquiries, applications, or general questions.</p>
						<span className={s.channelV}>australianspecialoperationstaskforce@hotmail.com</span>
					</Link>

					<Link href='https://www.facebook.com/AustralianSpecialOperationsTaskforce' target='_blank' className={s.channel} style={{ '--acc': 'var(--line-2)' } as React.CSSProperties}>
						<div className={s.channelH}>
							<i aria-hidden='true'>f</i>
							<b>Facebook</b>
						</div>
						<p>Follow us on Facebook for updates, event announcements, and community news.</p>
						<span className={s.channelV}>AustralianSpecialOperationsTaskforce</span>
					</Link>
				</div>
			</section>

		</AboutShell>
	)
}
