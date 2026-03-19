import { Metadata } from "next"
import Link from 'next/link'
import { Button } from '@mui/material'
import {
	OpenInNew, Shield, Engineering, GpsFixed, Flight,
	LocalHospital, DirectionsCar, Groups, SportsEsports,
	AccountBalance, MilitaryTech, Stars,
} from '@mui/icons-material'
import Container from "@/components/container"
import Banner from '@/public/images/home/3DMA_Final2.png'

export const metadata: Metadata = {
	title: "ORBAT | Australian Special Operations Taskforce"
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface Member { role: string; name: string }
interface UnitSection { title: string; members: Member[]; icon?: React.ReactNode }

// ─── Data ────────────────────────────────────────────────────────────────────

const companyHQ = {
	title: '0-A India Company Headquarters',
	senior: { role: 'Commanding Officer', name: 'LTGEN Thomas' },
	subTitle: '1-0 India Company Headquarters',
	members: [
		{ role: 'Officer Commanding',        name: 'MAJGEN Six'  },
		{ role: 'Adjutant',                  name: 'SCAPT Yoshi' },
		{ role: 'Regimental Sergeant Major', name: 'CSM Apex'    },
		{ role: 'Company Sergeant Major',    name: 'RSM Res'     },
	],
}

const platoon11: UnitSection[] = [
	{ title: '1-1-0 Platoon Headquarters', members: [
		{ role: 'Platoon Commander', name: 'OCDT Bants'        },
		{ role: 'Platoon Signaller', name: 'SIG(S) Animarchy'  },
		{ role: 'Platoon Sergeant',  name: 'SAM Brolof'        },
		{ role: 'Platoon Medic',     name: 'LCPL(P) Jayzee'   },
	]},
	{ title: '1-1-1 Alpha', members: [
		{ role: 'Section Commander', name: 'CPL(L) Hotshot'   },
		{ role: 'Rifleman (CFA)',    name: 'PTE Joey'          },
		{ role: 'Fireteam Leader',   name: 'LCPL(J) Danno'    },
		{ role: 'Medium Anti-Tank',  name: 'PTE(S) Nunn'      },
		{ role: 'Machinegunner',     name: 'PTE(S) Conway'    },
		{ role: 'Fireteam Leader',   name: 'LCPL(S) Nadric'   },
		{ role: 'Machinegunner',     name: 'PTE Jester'        },
		{ role: 'Rifleman',          name: ''                  },
	]},
	{ title: '1-1-2 Bravo', members: [
		{ role: 'Section Commander', name: 'CPL(P) Guardsman'  },
		{ role: 'Rifleman (CFA)',    name: 'PTE(L) Koda'       },
		{ role: 'Fireteam Leader',   name: 'LCPL(J) CJ'        },
		{ role: 'Medium Anti-Tank',  name: 'PTE(L) Vade'       },
		{ role: 'Machinegunner',     name: 'PTE(S) McDongle'   },
		{ role: 'Fireteam Leader',   name: 'LCPL(J) Oliver'    },
		{ role: 'Fireteam Leader',   name: 'PTE(SL) Zilo'      },
		{ role: 'Rifleman',          name: 'PTE(L) Nutpirom'   },
	]},
	{ title: '1-1-3 Charlie', members: [
		{ role: 'Section Commander', name: 'CPL(L) Pogo'       },
		{ role: 'Rifleman (CFA)',    name: 'PTE AnnoyingTaco'  },
		{ role: 'Fireteam Leader',   name: 'LCPL Gum'          },
		{ role: 'Medium Anti-Tank',  name: 'PTE Willum'        },
		{ role: 'Machinegunner',     name: ''                  },
		{ role: 'Fireteam Leader',   name: 'LCPL(P) Tatsyugo'  },
		{ role: 'Machinegunner',     name: 'PTE Southie'       },
		{ role: 'Rifleman',          name: 'PTE Iron'          },
	]},
]

const platoon12: UnitSection[] = [
	{ title: '1-2-0 Platoon Headquarters', members: [
		{ role: 'Platoon Commander', name: '2LT Talon'              },
		{ role: 'Platoon Signaller', name: 'SIG(S) Assassin'        },
		{ role: 'Platoon Sergeant',  name: 'SSAM Andrew'            },
		{ role: 'Platoon Medic',     name: 'LCPL(S) BadDragonRaz'   },
	]},
	{ title: '1-2-1 Alpha', members: [
		{ role: 'Section Commander', name: 'CPL(L) TheCheds'   },
		{ role: 'Rifleman (CFA)',    name: 'PTE(S) Pants'      },
		{ role: 'Fireteam Leader',   name: 'LCPL(J) Dawn'      },
		{ role: 'Medium Anti-Tank',  name: ''                  },
		{ role: 'Machinegunner',     name: 'PTE(P) Pegasus'    },
		{ role: 'Fireteam Leader',   name: 'LCPL(L) Nic'       },
		{ role: 'Machinegunner',     name: 'PTE(SL) Dempsey'   },
		{ role: 'Rifleman',          name: 'PTE(L) Wombat'     },
	]},
	{ title: '1-2-2 Bravo', members: [
		{ role: 'Section Commander', name: 'CPL(P) Rendez'      },
		{ role: 'Rifleman (CFA)',    name: 'PTE(S) Cheeseye'    },
		{ role: 'Fireteam Leader',   name: 'LCPL(P) Soundless'  },
		{ role: 'Medium Anti-Tank',  name: 'PTE Soapy'          },
		{ role: 'Machinegunner',     name: 'REC NakedSnake'     },
		{ role: 'Fireteam Leader',   name: ''                   },
		{ role: 'Machinegunner',     name: 'PTE(P) Iffy'        },
		{ role: 'Rifleman',          name: 'PTE(SL) Dennis'     },
	]},
	{ title: '1-2-3 Charlie', members: [
		{ role: 'Section Commander', name: 'CPL(P) Flurp'      },
		{ role: 'Rifleman (CFA)',    name: 'PTE(S) Phantom'    },
		{ role: 'Fireteam Leader',   name: 'LCPL(P) Osprey'    },
		{ role: 'Medium Anti-Tank',  name: 'PTE(S) Walshy'    },
		{ role: 'Machinegunner',     name: 'PTE(L) Noisy'      },
		{ role: 'Fireteam Leader',   name: 'LCPL Bones'        },
		{ role: 'Machinegunner',     name: 'PTE(L) J45un'      },
		{ role: 'Rifleman',          name: 'PTE(SL) Rox'       },
	]},
]

const support: UnitSection[] = [
	{ title: '1-3 Echo — Combat Engineers', icon: <Engineering sx={{ fontSize: 18 }} />, members: [
		{ role: 'Squadron Commander', name: 'CLT WhiteWolf'      },
		{ role: 'Squadron Commander', name: 'SGT Billy'          },
		{ role: 'Section Commander',  name: 'CPL(J) Violet'      },
		{ role: 'Sapper',             name: 'SAP(L) Slaydevil'   },
		{ role: 'Sapper',             name: 'SAP Gem'            },
		{ role: 'Section Commander',  name: 'CPL(J) Carl'        },
		{ role: 'Sapper',             name: 'SAP Sens'           },
		{ role: 'Fireteam Leader',    name: 'LCPL Lazypid'       },
		{ role: 'Sapper',             name: 'SAP(L) AgentDove'   },
		{ role: 'Sapper',             name: 'SAP Jewel'          },
	]},
	{ title: '1-3 Golf — Heavy Weapons', icon: <GpsFixed sx={{ fontSize: 18 }} />, members: [
		{ role: 'Troop Commander',   name: 'OCDT Trey'    },
		{ role: 'Troop Sergeant',    name: 'SSGT Jayden'  },
		{ role: 'Section Commander', name: 'BDR(S) Mold'  },
		{ role: 'Gunner',            name: 'GNR Bradford' },
		{ role: 'Gunner',            name: ''             },
		{ role: 'Fireteam Leader',   name: ''             },
		{ role: 'Gunner',            name: 'GNR(P) Ares'  },
	]},
	{ title: '1-3 Hotel — Rotary Wing (Flt 1)', icon: <Flight sx={{ fontSize: 18 }} />, members: [
		{ role: 'Squadron CO',      name: 'AVM BobittiHaxs'  },
		{ role: 'Squadron XO',      name: 'ACM Rauty'        },
		{ role: 'Flight Commander', name: 'WGCO Nova'        },
		{ role: 'Flight 2IC',       name: 'WGCO Brendo'      },
		{ role: 'Pilot',            name: 'FLT Jin'          },
		{ role: 'Pilot',            name: ''                 },
		{ role: 'Trainee Pilot',    name: 'OFFCDT Enfield'   },
		{ role: 'Crewman',          name: 'LAC Coffee'       },
	]},
	{ title: '1-3 Hotel — Rotary Wing (Flt 2)', icon: <Flight sx={{ fontSize: 18 }} />, members: [
		{ role: 'Flight Commander', name: 'FLL Chef'          },
		{ role: 'Flight 2IC',       name: 'GPCAPT MitchMash' },
		{ role: 'Pilot',            name: 'FLT(S) Lobo'      },
		{ role: 'Pilot',            name: 'FLL Maloney'      },
		{ role: 'Trainee Pilot',    name: 'OFFCDT Panther'   },
		{ role: 'Crewman',          name: 'AC Storm'         },
		{ role: 'Crewman',          name: 'REC Mundocrnoo'   },
	]},
	{ title: '1-3 Mike — Medical (MERT)', icon: <LocalHospital sx={{ fontSize: 18 }} />, members: [
		{ role: 'Medical Officer',   name: '2LT Fulcrum'       },
		{ role: 'Medical Sergeant',  name: 'SGT Boeing'        },
		{ role: 'Section Commander', name: 'CPL(J) Milcry'     },
		{ role: 'Medic',             name: 'PTE(P) Stevens'    },
		{ role: 'Fireteam Leader',   name: ''                  },
		{ role: 'Medic',             name: 'REC Sal'           },
		{ role: 'Medic',             name: 'PTE Tommy'         },
		{ role: 'Section Commander', name: 'CPL(J) Frankie'    },
		{ role: 'Medic',             name: 'PTE Bard'          },
		{ role: 'Fireteam Leader',   name: 'LCPL(J) Formula'   },
		{ role: 'Medic',             name: 'REC HackJack'      },
		{ role: 'Medic',             name: 'PTE(S) Duros'      },
	]},
	{ title: '1-3 Victor — Cavalry / Armour', icon: <DirectionsCar sx={{ fontSize: 18 }} />, members: [
		{ role: 'Troop Leader',    name: 'LT Conboy'       },
		{ role: 'Crewman',         name: 'TPR(SL) Trew'    },
		{ role: 'Crewman',         name: 'TPR(L) J.Cole'   },
		{ role: 'Troop Sergeant',  name: 'SGT Valinor'     },
		{ role: 'Crewman',         name: 'TRP(S) Pluto'    },
		{ role: 'Crewman',         name: 'TRP Gryphorim'   },
		{ role: 'Troop Corporal',  name: 'CPL(J) Rita'     },
		{ role: 'Crewman',         name: 'TRP Mango'       },
		{ role: 'Crewman',         name: 'TRP Seimsey'     },
		{ role: 'Crew Commander',  name: 'LCPL(J) Phox'    },
		{ role: 'Crewman',         name: 'TPR Rhino'       },
		{ role: 'Crewman',         name: 'TRP Omega'       },
	]},
]

const activeReservists = [
	'PTE(SL) Aqwaman', 'PTE Jesse',       'PTE(S) Arson',      'REC Happy',
	'PTE(P) Hord',     'REC Abuza',       'PTE(S) Jackal',     'PTE(P) Crimp',
	'PTE DamagedGoods','REC Thatcher',    'PTE Goose',         'PTE(P) Fry',
	'PTE Azza',        'REC Ryzza',       'PTE Wingman',       'PTE(S) Lest',
	'REC Vaalis',      'PTE(S) Jetz',     'PTE Xantenius',     'PTE(P) Odin',
	'PTE Nemo',        'REC Wrighty',     'REC Anomalie',      'REC Xia',
	'PTE(P) Petrov',   'PTE Racka',       'PTE Cyrus',         'REC Hectic',
	'PTE Bee',         'REC Spike',       'PTE BigBoss',       'PTE Henerse',
	'REC Zadori',      'PTE Bard',        'REC Riley',         'PTE Parko',
	'PTE Abdul',       'REC Llama',       'REC Berserker',     'PTE Ugly',
	'PTE(P) Battery',  'PTE(S) Dab',
]

const inactiveReservists = [
	'PTE(P) Tredrea', 'PTE Bunji', 'PTE Crow', 'PTE DaJame', 'REC Aztex',
]

const gamemasters: Member[] = [
	{ role: 'Zeus — Team Leader', name: 'GM(D) Slotter' },
	{ role: 'Zeus',               name: 'GM(P) Alexoe'  },
	{ role: 'Zeus',               name: ''              },
	{ role: 'Zeus',               name: ''              },
	{ role: 'Zeus',               name: ''              },
	{ role: 'Zeus',               name: ''              },
]

// ─── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({ children }: { children: React.ReactNode }) {
	return (
		<div style={{
			background: 'linear-gradient(90deg, rgba(219,0,29,0.9) 0%, rgba(160,0,20,0.85) 100%)',
			padding: '5px 10px',
			fontSize: '0.68rem',
			fontWeight: 700,
			letterSpacing: '0.1em',
			textTransform: 'uppercase',
			color: '#fff',
		}}>
			{children}
		</div>
	)
}

function MemberRow({ role, name, index }: { role: string; name: string; index: number }) {
	const isVacant = !name
	return (
		<div style={{
			display: 'grid',
			gridTemplateColumns: '1fr 1fr',
			padding: '3px 8px',
			background: index % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)',
			borderBottom: '1px solid rgba(219,0,29,0.06)',
			minHeight: 22,
			alignItems: 'center',
		}}>
			<span style={{ fontSize: '0.67rem', color: 'rgba(237,237,237,0.55)', letterSpacing: '0.02em' }}>
				{role}
			</span>
			<span style={{
				fontSize: '0.67rem',
				fontWeight: isVacant ? 400 : 600,
				color: isVacant ? 'rgba(237,237,237,0.2)' : 'rgba(237,237,237,0.9)',
				fontStyle: isVacant ? 'italic' : 'normal',
				letterSpacing: '0.02em',
			}}>
				{isVacant ? '— Vacant —' : name}
			</span>
		</div>
	)
}

const iconStrip = (icon: React.ReactNode) => (
	<div style={{
		width: 34,
		flexShrink: 0,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		background: 'rgba(219,0,29,0.07)',
		borderRight: '1px solid rgba(219,0,29,0.15)',
		color: 'rgba(219,0,29,0.65)',
	}}>
		{icon}
	</div>
)

function UnitCard({ section }: { section: UnitSection }) {
	return (
		<div style={{ border: '1px solid rgba(219,0,29,0.15)', overflow: 'hidden', marginBottom: 6 }}>
			{section.icon ? (
				<div className='flex items-stretch'>
					{iconStrip(section.icon)}
					<div className='flex-1 min-w-0'>
						<SectionHeader>{section.title}</SectionHeader>
						{section.members.map((m, i) => (
							<MemberRow key={i} role={m.role} name={m.name} index={i} />
						))}
					</div>
				</div>
			) : (
				<>
					<SectionHeader>{section.title}</SectionHeader>
					{section.members.map((m, i) => (
						<MemberRow key={i} role={m.role} name={m.name} index={i} />
					))}
				</>
			)}
		</div>
	)
}

function PlatoonColumn({ name, icon, sections }: { name: string; icon: React.ReactNode; sections: UnitSection[] }) {
	return (
		<div className='flex flex-col'>
			<div style={{
				background: 'rgba(219,0,29,0.08)',
				borderTop: '2px solid var(--red)',
				border: '1px solid rgba(219,0,29,0.2)',
				borderTopWidth: 2,
				borderTopColor: 'var(--red)',
				marginBottom: 6,
				display: 'flex',
				alignItems: 'center',
				gap: 10,
				padding: '7px 10px',
				color: 'rgba(219,0,29,0.85)',
			}}>
				{icon}
				<span style={{
					fontSize: '0.72rem',
					fontWeight: 700,
					letterSpacing: '0.1em',
					textTransform: 'uppercase',
					color: 'rgba(219,0,29,0.9)',
				}}>
					{name}
				</span>
			</div>
			{sections.map((s, i) => (
				<UnitCard key={i} section={s} />
			))}
		</div>
	)
}

function ReservistsCard() {
	const rows: string[][] = []
	for (let i = 0; i < activeReservists.length; i += 2) {
		rows.push([activeReservists[i], activeReservists[i + 1] ?? ''])
	}
	return (
		<div style={{ border: '1px solid rgba(219,0,29,0.15)', overflow: 'hidden', marginBottom: 6 }}>
			<div className='flex items-stretch'>
				{iconStrip(<Groups sx={{ fontSize: 18 }} />)}
				<div className='flex-1 min-w-0'>
					<SectionHeader>Company Reservists (Active)</SectionHeader>
					{rows.map(([a, b], i) => (
						<div key={i} style={{
							display: 'grid',
							gridTemplateColumns: '1fr 1fr',
							background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)',
							borderBottom: '1px solid rgba(219,0,29,0.06)',
						}}>
							{[a, b].map((name, j) => (
								<span key={j} style={{
									padding: '3px 8px',
									fontSize: '0.66rem',
									color: name ? 'rgba(237,237,237,0.82)' : 'transparent',
									borderLeft: j === 1 ? '1px solid rgba(219,0,29,0.08)' : 'none',
								}}>
									{name || '.'}
								</span>
							))}
						</div>
					))}
				</div>
			</div>
		</div>
	)
}

function InactiveReservistsCard() {
	return (
		<div style={{ border: '1px solid rgba(219,0,29,0.15)', overflow: 'hidden', marginBottom: 6 }}>
			<SectionHeader>Company Reservists (Inactive)</SectionHeader>
			{inactiveReservists.map((name, i) => (
				<div key={i} style={{
					padding: '3px 8px',
					fontSize: '0.67rem',
					color: 'rgba(237,237,237,0.4)',
					fontStyle: 'italic',
					background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.18)',
					borderBottom: '1px solid rgba(219,0,29,0.06)',
				}}>
					{name}
				</div>
			))}
		</div>
	)
}

function GamemastersCard() {
	return (
		<div style={{ border: '1px solid rgba(219,0,29,0.15)', overflow: 'hidden', marginBottom: 6 }}>
			<div className='flex items-stretch'>
				{iconStrip(<SportsEsports sx={{ fontSize: 18 }} />)}
				<div className='flex-1 min-w-0'>
					<SectionHeader>1-0 Zulu — Gamemasters</SectionHeader>
					{gamemasters.map((m, i) => (
						<MemberRow key={i} role={m.role} name={m.name} index={i} />
					))}
				</div>
			</div>
		</div>
	)
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Page() {
	return (
		<Container
			title="OUR ORBAT"
			subtitle="Our order of battle (ORBAT) is based around the current Australian Defense Force (ADF) structure with some custom changes that suit our style of game play and desires."
			background={Banner}
			sx={{ bannerHeight: 'sm', maxWidth: 'max-w-[1400px]', padding: '2rem', gap: 'gap-5' }}
		>
			{/* External link */}
			<div className="flex justify-end">
				<Link href='https://docs.google.com/spreadsheets/d/1rkzQSPimBYV3UDp-CFHUfQo59yww_xbj9UTPGWBzSL0/edit?usp=sharing' target="_blank">
					<Button
						variant="outlined"
						size="small"
						endIcon={<OpenInNew />}
						style={{ borderColor: 'rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.7)', fontSize: '0.72rem' }}
					>
						Open Full ORBAT
					</Button>
				</Link>
			</div>

			{/* Company HQ */}
			<div style={{ border: '1px solid rgba(219,0,29,0.3)', borderTop: '3px solid var(--red)', overflow: 'hidden' }}>

				{/* Banner */}
				<div style={{
					background: 'linear-gradient(135deg, rgba(219,0,29,0.95) 0%, rgba(130,0,18,0.92) 60%, rgba(60,0,8,0.9) 100%)',
					padding: '9px 20px',
					display: 'flex',
					alignItems: 'center',
					gap: 12,
					borderBottom: '1px solid rgba(255,255,255,0.08)',
				}}>
					<AccountBalance style={{ fontSize: 20, color: 'rgba(255,255,255,0.85)' }} />
					<div>
						<div style={{ fontSize: '0.58rem', fontWeight: 600, letterSpacing: '0.22em', color: 'rgba(255,255,255,0.55)', textTransform: 'uppercase' }}>
							0-A India Company
						</div>
						<div style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff', lineHeight: 1.1 }}>
							Company Headquarters
						</div>
					</div>
				</div>

				{/* Commanding Officer hero */}
				<div style={{
					position: 'relative',
					overflow: 'hidden',
					padding: '28px 32px',
					background: 'linear-gradient(135deg, rgba(219,0,29,0.1) 0%, rgba(0,0,0,0.35) 100%)',
					borderBottom: '1px solid rgba(219,0,29,0.2)',
					display: 'flex',
					alignItems: 'center',
					gap: 28,
				}}>
					{/* Watermark */}
					<div style={{
						position: 'absolute',
						right: 24,
						top: '50%',
						transform: 'translateY(-50%)',
						fontSize: '7rem',
						fontWeight: 900,
						color: 'rgba(219,0,29,0.05)',
						letterSpacing: '0.04em',
						userSelect: 'none',
						pointerEvents: 'none',
						lineHeight: 1,
					}}>
						CO
					</div>

					{/* Icon badge */}
					<div style={{
						width: 72,
						height: 72,
						borderRadius: '50%',
						border: '2px solid rgba(219,0,29,0.45)',
						background: 'radial-gradient(circle, rgba(219,0,29,0.15) 0%, rgba(0,0,0,0.3) 100%)',
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						flexShrink: 0,
						boxShadow: '0 0 24px rgba(219,0,29,0.15)',
					}}>
						<Stars style={{ fontSize: 36, color: 'rgba(219,0,29,0.85)' }} />
					</div>

					{/* Name block */}
					<div>
						<div style={{
							fontSize: '0.62rem',
							fontWeight: 700,
							letterSpacing: '0.25em',
							color: 'rgba(219,0,29,0.75)',
							textTransform: 'uppercase',
							marginBottom: 6,
						}}>
							{companyHQ.senior.role}
						</div>
						<div style={{
							fontSize: '2rem',
							fontWeight: 800,
							letterSpacing: '0.06em',
							color: '#fff',
							textTransform: 'uppercase',
							lineHeight: 1,
							textShadow: '0 2px 20px rgba(219,0,29,0.3)',
						}}>
							{companyHQ.senior.name}
						</div>
						<div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
							<div style={{ height: 2, width: 40, background: 'var(--red)' }} />
							<div style={{ height: 1, width: 20, background: 'rgba(219,0,29,0.35)' }} />
						</div>
					</div>
				</div>

				{/* Sub-HQ label */}
				<div style={{
					padding: '5px 20px',
					fontSize: '0.65rem',
					fontWeight: 700,
					letterSpacing: '0.15em',
					textTransform: 'uppercase',
					color: 'rgba(219,0,29,0.65)',
					background: 'rgba(219,0,29,0.04)',
					borderBottom: '1px solid rgba(219,0,29,0.12)',
					display: 'flex',
					alignItems: 'center',
					gap: 10,
				}}>
					<div style={{ height: 1, width: 16, background: 'rgba(219,0,29,0.3)', flexShrink: 0 }} />
					{companyHQ.subTitle}
					<div style={{ height: 1, flex: 1, background: 'rgba(219,0,29,0.1)' }} />
				</div>

				{/* HQ members grid */}
				<div className='grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'>
					{companyHQ.members.map((m, i) => (
						<div key={i} style={{
							padding: '12px 20px',
							borderRight: i < 3 ? '1px solid rgba(219,0,29,0.1)' : 'none',
							borderBottom: '1px solid rgba(219,0,29,0.06)',
							background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.15)',
						}}>
							<div style={{ fontSize: '0.6rem', color: 'rgba(237,237,237,0.38)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>
								{m.role}
							</div>
							<div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.92)' }}>
								{m.name}
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Main 4-column layout */}
			<div className='grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start'>
				<PlatoonColumn name='1-1 Infantry Platoon' icon={<Shield sx={{ fontSize: 20 }} />} sections={platoon11} />
				<PlatoonColumn name='1-2 Infantry Platoon' icon={<Shield sx={{ fontSize: 20 }} />} sections={platoon12} />
				<PlatoonColumn name='1-3 Support Platoon'  icon={<MilitaryTech sx={{ fontSize: 20 }} />} sections={support} />
				<div>
					<GamemastersCard />
					<ReservistsCard />
					<InactiveReservistsCard />
				</div>
			</div>
		</Container>
	)
}
