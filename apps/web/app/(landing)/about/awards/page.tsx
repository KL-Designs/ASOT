import { Metadata } from 'next'
import client from '@/lib/discord'

import SectionHead from '@/components/ui/SectionHead'
import Button from '@/components/ui/Button'
import { MedalIcon, ArrowIcon } from '@/components/ui/icons'
import AboutShell from '../shell'
import { AWARD_CATEGORIES, CAMPAIGN_LADDER, REVOCATION_REASONS, type AwardArt, type AwardEntry } from './awards-data'
import s from './awards.module.css'

export const metadata: Metadata = {
	title: 'Awards and Citations | Australian Special Operations Taskforce',
	description: 'Every award and citation an ASOT member can earn, who is eligible for each, and what it is awarded for.',
}

/**
 * `/about/awards` — the unit's awards and citations.
 *
 * Built from LTCOL Thomas's "ASOT Citations and Awards" document; the content
 * lives in `awards-data.ts`. The page leads with what the awards are for and
 * who can be nominated, puts the way to nominate somebody directly under that,
 * and then lays every award out by category with its ribbon — the same artwork
 * a member's milpac wears, so the page doubles as a key to reading a uniform.
 * The nomination section is for signed-in members only: the ticket form behind
 * it needs an account, so a visitor would only be sent to log in.
 */
export default async function Page() {
	const me = await client.fetchMe().catch(() => null)

	return (
		<AboutShell page='awards'>
			<section className={s.intro}>
				<div className={s.introCopy}>
					<SectionHead kicker='Outline' title='Recognising commitment' />
					<p>
						The ASOT awards and citations have been created to reward and acknowledge a member’s
						commitment, performance and involvement within the group. It is expected that all members
						hold a certain level of standard and dedication to the group, whilst some members pursue
						and exceed those standards.
					</p>
					<p>
						Each category relates to particular areas that are important to the group and its functioning.
					</p>
					<nav className={s.jump} aria-label='Award categories'>
						{AWARD_CATEGORIES.map(c => <a key={c.id} href={`#${c.id}`}>{c.title}</a>)}
						<a href='#campaign'>Operational Service Citations</a>
					</nav>
				</div>

				<aside className={s.eligibility}>
					<div className={s.k}>Eligibility</div>
					<p>To be eligible a member must;</p>
					<ul>
						<li>Be an active full-time or reservist member of ASOT.</li>
						<li>Not have any disputes or issues against them that are being investigated or currently being resolved.</li>
					</ul>
				</aside>
			</section>

			{/* The document's nomination and new-award sections are forms now.
			    This is where they went. */}
			{me && <section className={s.nominate}>
				<div>
					<div className={s.k}>Know someone who has earned one?</div>
					<h2>Nominate a member</h2>
					<p>
						Any full-time or reservist member can nominate another member at any time, whether or not
						they hold rank. Nominations go to J4 through the ticket system, which asks for everything
						a nomination needs.
					</p>
				</div>
				<div className={s.nominateBtns}>
					<Button variant='amber' href='/tickets/new?type=award-nomination'>
						<MedalIcon /> Nominate a member <ArrowIcon />
					</Button>
					<Button variant='ghost' href='/tickets/new?type=award-creation'>
						Propose a new award
					</Button>
				</div>
			</section>}

			{AWARD_CATEGORIES.map(category => (
				<section key={category.id} id={category.id} className={s.category}>
					<SectionHead kicker={category.kicker} title={category.title}>
						<p className={s.blurb}>{category.blurb}</p>
					</SectionHead>
					<div className={s.grid}>
						{category.awards.map(award => <AwardCard key={award.name} award={award} />)}
					</div>
				</section>
			))}

			<section id='campaign' className={s.category}>
				<SectionHead kicker='Campaigns attended' title='Operational Service Citations'>
					<p className={s.blurb}>
						Awarded to any ASOT full-time or reservist member for campaigns attended, where the member
						achieved a 70% attendance rate. The medallion comes at five campaigns, and a clasp is added
						for every five after that.
					</p>
				</SectionHead>
				<ol className={s.ladder}>
					{CAMPAIGN_LADDER.map(step => (
						<li key={step.name} className={s.rung}>
							<span className={s.rungArt}>
								{step.code && <Ribbon code={step.code} />}
							</span>
							<span className={s.rungName}>{step.name}</span>
							<span className={s.rungCount}><b>{step.campaigns}+</b> campaigns</span>
						</li>
					))}
				</ol>
			</section>

			<section className={s.notes}>
				<div className={s.note}>
					<div className={s.k}>Removal of awards</div>
					<p>
						Members can have awards and citations revoked in a few ways and under different
						circumstances. The revocation can only be completed by a J4 member and can be done at any time.
					</p>
					<ul>
						{REVOCATION_REASONS.map(r => <li key={r}>{r}</li>)}
					</ul>
				</div>
				<div className={s.note}>
					<div className={s.k}>Keeping your awards</div>
					<p>
						All awards, except period of service citations, will remain with discharged members apart
						from when dishonourably discharged.
					</p>
					<p>
						If you have any questions, queries or doubtful points regarding anything here, contact your
						chain of command or subsequently, a J4 member.
					</p>
				</div>
			</section>
		</AboutShell>
	)
}

function AwardCard({ award }: { award: AwardEntry }) {
	return (
		<article className={s.award}>
			<div className={s.awardArt}>
				{award.art ? <Art art={award.art} /> : <span className={s.noArt} aria-hidden='true'><MedalIcon /></span>}
			</div>
			<h3>{award.name}</h3>
			<dl>
				<dt>Eligibility</dt>
				<dd>{award.eligibility}</dd>
				<dt>Awarded for</dt>
				<dd>
					{award.intro && <p>{award.intro}</p>}
					{award.criteria.length === 1 && !award.intro
						? <p>{award.criteria[0]}</p>
						: <ul>{award.criteria.map(c => <li key={c}>{c}</li>)}</ul>}
				</dd>
			</dl>
		</article>
	)
}

function Art({ art }: { art: AwardArt }) {
	if (art.kind === 'ribbon') return <Ribbon code={art.code} />
	// A plain <img>: these are served from the milpac asset store, not /public.
	return <img className={s.medallion} src={`/milpac-assets/imge/Medallions/${art.file}.png`} alt='' loading='lazy' />
}

/** A ribbon bar, scaled up from its native few dozen pixels. Pixelated on
 *  purpose: the artwork is pixel art, and smoothing it turns it to mush. */
function Ribbon({ code }: { code: string }) {
	// A plain <img>: these are served from the milpac asset store, not /public.
	return <img className={s.ribbon} src={`/milpac-assets/imge/Ribbons/${code}.png`} alt='' loading='lazy' />
}
