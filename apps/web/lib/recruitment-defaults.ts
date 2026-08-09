export interface RecruitRole {
    role: string
    qual: string[]
    specialist: string[]
}

export interface RecruitStep {
    id: string
    title: string
    intro: string           // opening paragraph (may contain basic HTML like <em>)
    bullets: string[]       // flat bullet list items
    gridItems: string[]     // grid items (steps 4 & 5); empty array if unused
    followText: string      // paragraph after bullets/grid; empty string if unused
    noteTitle: string       // note box title; empty string if no note
    noteBullets: string[]   // note box bullets; empty array if unused
    extraParagraphs: string[] // extra paragraphs (used by step 6 only)
}

export interface RecruitmentInfoContent {
    introText: string
    acknowledgeText: string
    // Three background images: [steps 1-2, steps 3-4, steps 5-6]
    sectionImages: [string, string, string]
    // background-position-y per image (0 = top, 50 = center, 100 = bottom)
    sectionImagePositions?: [number, number, number]
    steps: RecruitStep[]
    roles: RecruitRole[]
}

export const DEFAULT_RECRUITMENT_INFO: RecruitmentInfoContent = {
    introText: 'ASOT is a serious MILSIM unit. The recruitment and training process is designed to ensure new members are suitable for the unit, understand our standards, and are prepared to contribute effectively during operations.',
    acknowledgeText: 'I understand that ASOT is a serious MILSIM unit, I understand the recruitment and training process outlined above, and I wish to continue with my application.',
    sectionImages: ['', '', ''],
    sectionImagePositions: [50, 50, 50],
    steps: [
        {
            id: 'apply',
            title: 'Submit Your Application',
            intro: 'Submit your application through the ASOT website. As part of the application, you will be able to indicate the roles or call signs you are most interested in joining.',
            bullets: [],
            gridItems: [],
            followText: '',
            noteTitle: 'Please note:',
            noteBullets: [
                'Some roles may not be available if the relevant call sign is already full.',
                'Your preferred role is not guaranteed.',
                'Secondary or tertiary preferences may be used if required.',
            ],
            extraParagraphs: [],
        },
        {
            id: 'review',
            title: 'Application Review',
            intro: 'The recruitment team will review your application. If you are considered suitable to continue, a recruiter will contact you and advise:',
            bullets: ['that you have been approved to take part in Selection; and', 'the proposed Selection start date.'],
            gridItems: [],
            followText: 'Selection intakes are normally conducted every three months.',
            noteTitle: '',
            noteBullets: [],
            extraParagraphs: [],
        },
        {
            id: 'arc',
            title: 'Optional — Army Recruit Centre (ARC)',
            intro: 'Before Selection begins, approved applicants may attend the optional Army Recruit Centre (ARC). ARC is designed primarily for:',
            bullets: [
                'new or inexperienced Arma 3 players;',
                'players who want to refresh basic controls; and',
                'applicants who want to become familiar with ASOT-specific mods and systems.',
            ],
            gridItems: [],
            followText: 'ARC runs for approximately one week before Selection. Attendance is optional and does not form part of the Selection assessment.',
            noteTitle: '',
            noteBullets: [],
            extraParagraphs: [],
        },
        {
            id: 'selection',
            title: 'Selection',
            intro: 'Selection runs for three weeks, with two sessions per week. Selection is <em>not</em> a test of Arma 3 skill. It is used to assess whether an applicant demonstrates the personal qualities required within ASOT, including:',
            bullets: [],
            gridItems: ['Attitude', 'Trainability', 'Teamwork', 'Professionalism', 'Communication', 'Integrity', 'Other relevant personal traits'],
            followText: 'Applicants who successfully complete Selection may progress to the Reinforcement Cycle.',
            noteTitle: '',
            noteBullets: [],
            extraParagraphs: [],
        },
        {
            id: 'reinforcement',
            title: 'Reinforcement Cycle',
            intro: 'The Reinforcement Cycle runs for approximately eight weeks, with two training sessions per week. Its purpose is to bring new members up to the standard required to participate effectively in ASOT operations and formally integrate into the unit. Training includes:',
            bullets: [],
            gridItems: [
                'Navigation', 'Communications', 'Reconnaissance', 'Tactical Medicine',
                'Close Quarters Battle (CQB)', 'Military Operations in Urban Terrain (MOUT)',
                'Small Unit Tactics (SUT)', 'Vehicle Operations', 'Maritime Operations',
                'Hostage Rescue', 'Static Line Parachuting', 'HAHO / HALO Operations', 'And more',
            ],
            followText: '',
            noteTitle: '',
            noteBullets: [],
            extraParagraphs: [],
        },
        {
            id: 'callsign',
            title: 'Joining Your Call Sign / Qualification Training',
            intro: '',
            bullets: [],
            gridItems: [],
            followText: '',
            noteTitle: '',
            noteBullets: [],
            extraParagraphs: [
                'After successfully completing the Reinforcement Cycle, members will move into their assigned call sign where a suitable position remains available. Where possible, this will reflect the role preferences submitted during the application process.',
                'Your call sign will train you to the required standard for your assigned position. Once you complete the required qualification training, you will be considered fully qualified in that role and may become eligible to pursue additional specialist qualifications later.',
                'If you are unable to successfully complete the qualification requirements for your assigned role, you may be moved to another suitable call sign or role, including a secondary or tertiary preference where available.',
            ],
        },
    ],
    roles: [
        { role: 'Infantry', qual: ['Advanced CQB', 'Advanced small unit tactics', 'Advanced vehicles'], specialist: ['Breacher Course', 'CFA (Basic Medical)', 'Basic Drone Operator', 'Marksman', 'VIP and Asset Protection'] },
        { role: 'Combat Engineers', qual: ['RRR', 'CBRN', 'Construction', 'Demolitions'], specialist: ['K9 Handler'] },
        { role: 'Indirect Fire & Heavy Weapons', qual: ['Basic Comms and calcs (IDF)', 'Basic IDF', 'Basic DFSW', 'Basic Naval'], specialist: ['Advanced IDF', 'Battery Commander Course', 'Basic Drone Operator', 'Advanced Drone Operator', 'Marksman', 'Sniper'] },
        { role: 'Aviation', qual: ['Basic fixed wing (Airborne ops)', 'Basic Rotary Qualification (Basic + assessment)', 'Basic CAS', 'Basic Crewman'], specialist: ['Advanced CAS (Apache)', 'Advanced fixed-wing', 'Advanced Crewman', 'Expert Rotary', 'Expert Fixed-wing'] },
        { role: 'Medical Emergency Response Team', qual: ['CFA (Basic Medical)', 'Advanced Medical', 'Advanced CQB', 'Advanced small unit tactics', 'Advanced vehicles'], specialist: ['MERT Pilot', 'Expert Medical'] },
        { role: 'Cavalry', qual: ['Advanced vehicles', 'Basic armoured vehicle drivers', 'RRR', 'Cavalry Scout'], specialist: ['Gunners', 'Crew Commander', 'Patrol Commander', 'Troop Commander'] },
    ],
}
