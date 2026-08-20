import { Metadata } from "next"

import { CallsignCard } from '@/components/callsign-card'
import List from '@/components/ui/List'
import SectionHead from '@/components/ui/SectionHead'
import s from '@/styles/shell.module.css'

import Image_0A from '@/public/images/home/callsigns/0A.jpg'
import Image_10 from '@/public/images/home/callsigns/10.jpg'
import Image_11 from '@/public/images/home/callsigns/11.jpg'
import Image_12 from '@/public/images/home/callsigns/12.jpg'
import Image_130 from '@/public/images/home/callsigns/130.jpg'
import Image_13E from '@/public/images/home/callsigns/13E.jpg'
import Image_13G from '@/public/images/home/callsigns/13G.jpg'
import Image_13H1 from '@/public/images/home/callsigns/13H1.jpg'
import Image_13H2 from '@/public/images/home/callsigns/13H2.jpg'
import Image_13M from '@/public/images/home/callsigns/13M.jpg'
import Image_13V from '@/public/images/home/callsigns/13V.jpg'
import Image_GM from '@/public/images/home/callsigns/GM.jpg'
import Image_R from '@/public/images/home/callsigns/R.jpg'


export const metadata: Metadata = {
	title: "Callsigns | Australian Special Operations Taskforce",
	description: "Browse the callsign registry of the Australian Special Operations Taskforce — designations and roles within our unit.",
}



export default function Tab() {
	return (
		<section>
			<SectionHead kicker='Registry' title='Callsigns' />
			<div className={s.csGrid}>

				<CallsignCard title='India 0A' images={[Image_0A]}>
					<p>India 0A is the commanding officer and unit owner callsign that oversees management and operation of the entire unit.</p>
					<List items={[
						'Overall command of all assets and call signs in game.',
						'Admin related to the community. (Mods, documentation and development)',
						'Management of all group departments and staff.',
						'Oversees all staff and unit management.',
					]} />
					<p>If not operating on the ground as a HQ element, 0A assists call signs by filling empty staff slots for missions, helping out Zeus's when required and then simply filling empty spots in other call signs.</p>
					<p>0A is comprised of the commanding officer.</p>
				</CallsignCard>

				<CallsignCard title='India 1-0' images={[Image_10]}>
					<p>India 1-0 is the lead call sign and HQ of the group that manages all other call signs both in and out of game.</p>
					<List items={[
						'Majority of command of all assets and call signs in game.',
						'Admin related to the community. (Mods, documentation and development)',
						'Management of all group departments and staff.',
					]} />
					<p>If not operating on the ground as a HQ element, 1-0 assists call signs by filling empty staff slots for missions, helping out Zeus's when required and then simply filling empty spots in other call signs.</p>
					<p>1-0 is comprised of a 4 man team which includes the company XO, ADJ, RSM and CSM.</p>
				</CallsignCard>

				<CallsignCard title='1-0 Zulu / Game Masters' images={[Image_GM]}>
					<p>Game masters are our Zeus team who provide a capability that is critical to the running and experience of our missions.</p>
					<List items={[
						'Control and placement of enemy, civilian and independent forces for the duration of the mission.',
						'Setting up of objectives and events relating to the missions story line.',
						'Ensuring members experience a well-balanced, active and enjoyable mission.',
						'Maintaining and adjusting mission flow to ensure a steady pace, preventing long periods of inactivity while keeping the mission challenging from start to finish.',
					]} />
					<p>Game Masters is a team comprised of 6 permanent members and a pool of part time members.</p>
				</CallsignCard>

				<CallsignCard title='India 1-1' images={[Image_11]}>
					<p>India 1-1 is one of our infantry platoons which are the main fighting force of the unit.</p>
					<List items={[
						'Providing the main fighting capability to the task force.',
						'Utilising a variety weapons, vehicles and equipment to provide a diverse capability to the unit.',
					]} />
					<p>1-1 is a platoon comprising of 3 x 8 man sections and a 4 man platoon headquarters.</p>
				</CallsignCard>

				<CallsignCard title='India 1-2' images={[Image_12]}>
					<p>India 1-2 is one of our infantry platoons which are the main fighting force of the unit.</p>
					<List items={[
						'Providing the main fighting capability to the task force.',
						'Utilising a variety weapons, vehicles and equipment to provide a diverse capability to the unit.',
					]} />
					<p>1-2 is a platoon comprising of 3 x 8 man sections and a 4 man platoon headquarters.</p>
				</CallsignCard>

				<CallsignCard title='India 1-3-0' images={[Image_130]}>
					<p>India 1-3-0 is the HQ element of the 1-3 support platoon.</p>
					<List items={[
						'Command of all assets in 1-3 both in and out of game.',
						'Admin related to 1-3 platoon.',
					]} />
					<p>If not operating on the ground as a HQ element, 1-3 HQ assists call signs by filling empty 1-3 slots for missions and filling empty slots in other call signs.</p>
					<p>1-3-0 is comprised of a 5 man section including the Group Captain, Troop Commander, Battery Commander, Sapper Sergeant and a Medical Sergeant.</p>
				</CallsignCard>

				<CallsignCard title='1-3 Echo' images={[Image_13E]}>
					<p>1-3 Echo is our combat engineers asset that provides the unit with a wide variety of capabilities.</p>
					<List items={[
						'Providing explosive detection, disposal and demolitions.',
						'Providing CBRN protection equipment and decontamination.',
						"Constructing FOB's, defenses and other required structures.",
						'Providing ground based logistical support (Repair, Refuel, Rearm)',
						"Managing and providing transport for prisoners, high value targets and VIP's.",
					]} />
					<p>Echo is comprised of 2x 5 man sections.</p>
				</CallsignCard>

				<CallsignCard title='1-3 Golf' images={[Image_13G]}>
					<p>1-3 Golf is our indirect fire (IDF) and direct fire support weapons (DFSW) capability while allowing us having AA and IDF Detection for defensive postures.</p>
					<List items={[
						'Supporting ground forces with the use of indirect fires including mortars, fixed and mobile artillery.',
						'Providing an increased anti-tank and anti-air capability with the use of mobile launchers.',
						'Supporting ground forces with the use of direct fires including HMG, MMG and GMG static weaponry.',
					]} />
					<p>Golf is comprised of a 6 man section.</p>
				</CallsignCard>

				<CallsignCard title='1-3 Hotel' images={[Image_13H2]}>
					<p>1-3 Hotel is our rotary air support wing / asset that provides the task force with a variety of logistical and close air support capability.</p>
					<List items={[
						'Providing air lift capability of personnel and vehicles into the area of operations.',
						'Providing an air logistical capability by conducting supply drops.',
						"Providing battlefield commentary to FO's and Command via observation.",
						'Providing close air support to ground units.',
					]} />
					<p>Hotel is comprised of 2x 6 man flights.</p>
				</CallsignCard>

				<CallsignCard title='1-3 Mike' images={[Image_13M]}>
					<p>1-3 Mike is our medical emergency response team (MERT) who provide rapid and increased medical support to mass casualty incidents and other medical situations.</p>
					<List items={[
						'Providing all call signs with a rapid responding and effective medical team when a call sign cannot manage it independently.',
						'Providing resupply of medical equipment and supplies to call signs.',
						"Conducting handling and backloading of severely wounded and/or deceased members, civilians, HVT's and VIP's.",
					]} />
					<p>Mike is comprised of 2x 4 man sections.</p>
				</CallsignCard>

				<CallsignCard title='1-3 Victor' images={[Image_13V]}>
					<p>Victor 1-3 is the cavalry and armoured support call sign for the company.</p>
					<List items={[
						"Providing heavy firepower to call signs and increasing the company's anti-vehicle capability.",
						'Providing reconnaissance capability to headquarters and other call signs.',
						'Providing armoured transport capability to dismounted units.',
					]} />
					<p>The Victor call sign usually operates in a mounted role utilising APC's, tanks, IFV's and other vehicles, but crews can dismount and operate as teams when required.</p>
					<p>Victor is comprised of 4x 3 man crews.</p>
				</CallsignCard>

				<CallsignCard title='Reservists' images={[Image_R]}>
					<p>Reservists are our members who are awaiting a position to open in another call sign or who cannot commit to the expected attendance requirements.</p>
					<List items={[
						'Filling in positions where members may be away for a Sunday mission.',
						'Providing the ability to bolster call sign strengths when required for particular missions.',
						'Allowing members to maintain a lower attendance rate due to real life commitments or events whilst still being able to be apart of the community.',
					]} />
					<p>We have a flexible number of reservist slots.</p>
				</CallsignCard>

			</div>
		</section>
	)
}
