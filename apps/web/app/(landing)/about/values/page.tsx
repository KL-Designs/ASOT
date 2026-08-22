import { Metadata } from 'next'

import SectionHead from '@/components/ui/SectionHead'
import Card, { CardGrid } from '@/components/ui/Card'
import AboutShell from '../shell'

export const metadata: Metadata = {
	title: "Principles and Values | Australian Special Operations Taskforce",
	description: "The core principles and values that guide every member of the Australian Special Operations Taskforce.",
}

const CORE = [
	{ title: 'Community', body: "ASOT exists first and foremost as a community. We value connection, camaraderie, and shared experiences both inside and outside Arma 3. Members are encouraged to engage beyond operations, whether that's playing other games, hanging out in voice, or just being part of the group." },
	{ title: 'Welcoming', body: 'We actively foster an environment where new and existing members feel welcome, respected, and comfortable being themselves. No one should feel like an outsider, regardless of gaming experience, personal background, or level of familiarity with milsim communities.' },
	{ title: 'Respect', body: 'We treat each other with respect at all times. This includes how we communicate, how we handle disagreements and discipline, and how we represent the unit publicly. Respect underpins trust, cohesion, and long-term community health.' },
	{ title: 'Enjoyment', body: 'At its core, ASOT exists so people can enjoy themselves. While we take our gameplay seriously, we never lose sight of the fact that this is a game and a shared hobby meant to be fun, engaging, and rewarding.' },
]

const OPERATING = [
	{ title: 'Professionalism', body: 'We approach missions, training, and leadership with professionalism. This means clear communication, preparation, accountability, and taking objectives seriously without unnecessary ego or toxicity.' },
	{ title: 'Competence', body: 'We strive to be skilled, capable, and reliable. Members are encouraged to improve their individual skills and teamwork so the unit functions effectively across a wide range of scenarios and roles.' },
	{ title: 'Realism with Purpose', body: 'We use realism to enhance immersion, decision-making, and teamwork, not to create frustration or gatekeeping. Realism exists to support enjoyable, believable gameplay rather than strict simulation for its own sake.' },
	{ title: 'Operational Flexibility', body: 'ASOT embraces a broad scope of operations. We are not limited to special operations forces and actively engage in conventional military roles, varied mission types, and diverse operational environments to keep gameplay fresh and challenging.' },
]

export default function Tab() {
	return (
		<AboutShell page='values'>
			<section>
				<SectionHead kicker='Core Values' title='Who we are as a community' />
				<CardGrid columns={4}>
					{CORE.map((v, i) => (
						<Card key={v.title} title={v.title} kicker='Core value' ghost={String(i + 1).padStart(2, '0')}>
							<p>{v.body}</p>
						</Card>
					))}
				</CardGrid>
			</section>

			<section>
				<SectionHead kicker='Operating Principles' title='How we play, train & conduct ourselves' />
				<CardGrid columns={4}>
					{OPERATING.map((v, i) => (
						<Card key={v.title} title={v.title} kicker='Operating principle' ghost={String(i + 1).padStart(2, '0')}>
							<p>{v.body}</p>
						</Card>
					))}
				</CardGrid>
			</section>
		</AboutShell>
	)
}
