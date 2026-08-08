export interface SessionEventDef {
    key: string
    title: string
    sessionNumber: number
}

export const SESSION_EVENTS: SessionEventDef[] = [
    // Session 1
    { key: 's1_radio',       title: 'Radio Assessment',               sessionNumber: 1 },
    { key: 's1_medical',     title: 'Basic Medical Assessment',       sessionNumber: 1 },
    { key: 's1_navigation',  title: 'Land Navigation',                sessionNumber: 1 },
    { key: 's1_rifle',       title: 'Rifle Marksmanship Evaluation',  sessionNumber: 1 },
    // Session 2
    { key: 's2_break',       title: 'Break Contact / Team Peeling',   sessionNumber: 2 },
    { key: 's2_at',          title: 'Anti-Tank Launcher Evaluation',  sessionNumber: 2 },
    { key: 's2_mg',          title: 'Machine Gun Evaluation',         sessionNumber: 2 },
    { key: 's2_cqb',         title: 'Team CQB Assessment',           sessionNumber: 2 },
    // Session 3
    { key: 's3_patrol',      title: 'Patrol & Navigation',            sessionNumber: 3 },
    { key: 's3_ambush',      title: 'Ambush Drills',                  sessionNumber: 3 },
    { key: 's3_breaching',   title: 'Breaching Techniques',           sessionNumber: 3 },
    // Session 4
    { key: 's4_command',     title: 'Command & Control',              sessionNumber: 4 },
    { key: 's4_section',     title: 'Section Attack',                 sessionNumber: 4 },
    { key: 's4_vehicle',     title: 'Vehicle Tactics',                sessionNumber: 4 },
    // Session 5 (catch-up)
    { key: 's5_review',      title: 'Skills Review',                  sessionNumber: 5 },
    { key: 's5_remediation', title: 'Remediation Drills',             sessionNumber: 5 },
    // Session 6 (catch-up)
    { key: 's6_assessment',  title: 'Final Assessment',               sessionNumber: 6 },
    { key: 's6_debrief',     title: 'Course Debrief',                 sessionNumber: 6 },
]

export function getSessionEvents(sessionNumber: number): SessionEventDef[] {
    return SESSION_EVENTS.filter(e => e.sessionNumber === sessionNumber)
}
