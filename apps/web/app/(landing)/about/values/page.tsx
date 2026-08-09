import { Metadata } from "next"

import { Typography } from '@mui/material'
import { Groups, Handshake, VolunteerActivism, SportsEsports, MilitaryTech, Psychology, Explore, Tune } from '@mui/icons-material'

import InfoCard from '@/components/info-card'


export const metadata: Metadata = {
	title: "Principles and Values | Australian Special Operations Taskforce",
	description: "The core principles and values that guide every member of the Australian Special Operations Taskforce.",
}



export default function Tab() {
	return (
		<div className="flex flex-col gap-10">

			<div className="flex flex-col gap-4">
				<div className='flex items-center gap-4'>
					<div style={{ width: 3, alignSelf: 'stretch', background: 'var(--red)', flexShrink: 0 }} />
					<div>
						<div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.8)', textTransform: 'uppercase', marginBottom: 4 }}>Core Values</div>
						<h2 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.08em', margin: 0 }}>WHO WE ARE AS A COMMUNITY</h2>
					</div>
				</div>
				<div style={{ height: 1, background: 'rgba(219,0,29,0.2)' }} />
				<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
					<InfoCard title='Community' icon={<Groups />}>
						<Typography>ASOT exists first and foremost as a community. We value connection, camaraderie, and shared experiences both inside and outside Arma 3. Members are encouraged to engage beyond operations, whether that's playing other games, hanging out in voice, or just being part of the group.</Typography>
					</InfoCard>

					<InfoCard title='Welcoming' icon={<Handshake />}>
						<Typography>We actively foster an environment where new and existing members feel welcome, respected, and comfortable being themselves. No one should feel like an outsider, regardless of gaming experience, personal background, or level of familiarity with milsim communities.</Typography>
					</InfoCard>

					<InfoCard title='Respect' icon={<VolunteerActivism />}>
						<Typography>We treat each other with respect at all times. This includes how we communicate, how we handle disagreements and discipline, and how we represent the unit publicly. Respect underpins trust, cohesion, and long-term community health.</Typography>
					</InfoCard>

					<InfoCard title='Enjoyment' icon={<SportsEsports />}>
						<Typography>At its core, ASOT exists so people can enjoy themselves. While we take our gameplay seriously, we never lose sight of the fact that this is a game and a shared hobby meant to be fun, engaging, and rewarding.</Typography>
					</InfoCard>
				</div>
			</div>

			<div className="flex flex-col gap-4">
				<div className='flex items-center gap-4'>
					<div style={{ width: 3, alignSelf: 'stretch', background: 'var(--red)', flexShrink: 0 }} />
					<div>
						<div style={{ fontSize: '0.7rem', fontWeight: 600, letterSpacing: '0.18em', color: 'rgba(219,0,29,0.8)', textTransform: 'uppercase', marginBottom: 4 }}>Operating Principles</div>
						<h2 style={{ fontSize: '1.6rem', fontWeight: 700, letterSpacing: '0.08em', margin: 0 }}>HOW WE PLAY, TRAIN & CONDUCT OURSELVES</h2>
					</div>
				</div>
				<div style={{ height: 1, background: 'rgba(219,0,29,0.2)' }} />
				<div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
					<InfoCard title='Professionalism' icon={<MilitaryTech />}>
						<Typography>We approach missions, training, and leadership with professionalism. This means clear communication, preparation, accountability, and taking objectives seriously without unnecessary ego or toxicity.</Typography>
					</InfoCard>

					<InfoCard title='Competence' icon={<Psychology />}>
						<Typography>We strive to be skilled, capable, and reliable. Members are encouraged to improve their individual skills and teamwork so the unit functions effectively across a wide range of scenarios and roles.</Typography>
					</InfoCard>

					<InfoCard title='Realism with Purpose' icon={<Explore />}>
						<Typography>We use realism to enhance immersion, decision-making, and teamwork, not to create frustration or gatekeeping. Realism exists to support enjoyable, believable gameplay rather than strict simulation for its own sake.</Typography>
					</InfoCard>

					<InfoCard title='Operational Flexibility' icon={<Tune />}>
						<Typography>ASOT embraces a broad scope of operations. We are not limited to special operations forces and actively engage in conventional military roles, varied mission types, and diverse operational environments to keep gameplay fresh and challenging.</Typography>
					</InfoCard>
				</div>
			</div>

		</div>
	)
}
