import React from 'react'

// ── Primary statuses (3 values — new structure) ───────────────────────────────

export type TicketStatus = CommunityTicketStatus

export const PRIMARY_STATUS_META: Record<string, { label: string; color: string; border: string; bg: string }> = {
    open:      { label: 'Open',      color: 'rgba(237,237,237,0.65)',  border: 'rgba(255,255,255,0.2)',  bg: 'rgba(255,255,255,0.02)' },
    in_review: { label: 'In Review', color: 'rgba(0,195,255,0.9)',     border: 'rgba(0,195,255,0.65)',   bg: 'rgba(0,195,255,0.05)'   },
    closed:    { label: 'Closed',    color: 'rgba(237,237,237,0.32)',  border: 'rgba(255,255,255,0.09)', bg: 'rgba(0,0,0,0.08)'       },
}
export const PRIMARY_STATUSES = Object.keys(PRIMARY_STATUS_META) as string[]

// ── Tags / sub-statuses (multi-select) ────────────────────────────────────────

export const TAG_META: Record<string, { label: string; color: string }> = {
    in_review:          { label: 'In Review',          color: 'rgba(0,195,255,0.9)'    },
    implementing:       { label: 'Implementing',        color: 'rgba(167,139,250,0.9)'  },
    implemented:        { label: 'Implemented',         color: 'rgba(74,222,128,0.9)'   },
    broken:             { label: 'Broken',              color: 'rgba(255,140,0,0.9)'    },
    resolved:           { label: 'Resolved',            color: 'rgba(74,222,128,0.8)'   },
    denied:             { label: 'Denied',              color: 'rgba(219,0,29,0.85)'    },
    no_action_required: { label: 'No Action Required',  color: 'rgba(237,237,237,0.45)' },
}
export const ALL_TAGS = Object.keys(TAG_META)

// ── Legacy status meta (backwards compat for old stored statuses) ─────────────

export const STATUS_META: Record<string, { label: string; color: string; border: string; bg: string }> = {
    ...PRIMARY_STATUS_META,
    implementing:       { label: 'Implementing',        color: 'rgba(167,139,250,0.9)',   border: 'rgba(167,139,250,0.6)',  bg: 'rgba(167,139,250,0.05)' },
    implemented:        { label: 'Implemented',         color: 'rgba(74,222,128,0.9)',    border: 'rgba(74,222,128,0.6)',   bg: 'rgba(74,222,128,0.05)'  },
    broken_mod:         { label: 'Broken',              color: 'rgba(255,140,0,0.9)',     border: 'rgba(255,140,0,0.6)',    bg: 'rgba(255,140,0,0.05)'   },
    resolved:           { label: 'Resolved',            color: 'rgba(74,222,128,0.8)',    border: 'rgba(74,222,128,0.55)',  bg: 'rgba(74,222,128,0.04)'  },
    denied:             { label: 'Denied',              color: 'rgba(219,0,29,0.85)',     border: 'rgba(219,0,29,0.55)',    bg: 'rgba(219,0,29,0.05)'    },
    no_action_required: { label: 'No Action Required',  color: 'rgba(237,237,237,0.45)', border: 'rgba(255,255,255,0.12)', bg: 'rgba(0,0,0,0.1)'        },
}

export const ALL_STATUSES = Object.keys(STATUS_META) as CommunityTicketStatus[]
export const ACTIVE_STATUSES: string[] = ['open', 'in_review']
export const CLOSED_STATUSES: string[] = ['closed', 'implementing', 'implemented', 'broken_mod', 'resolved', 'denied', 'no_action_required']

export function getStatus(s: string) {
    return STATUS_META[s] ?? PRIMARY_STATUS_META.open
}

/** Returns true if the ticket should be shown in the closed section. */
export function isTicketClosed(t: { status: string; statuses?: string[] }): boolean {
    const all = t.statuses?.length ? t.statuses : [t.status]
    return all.includes('closed') || (!all.some(s => PRIMARY_STATUSES.includes(s)) && CLOSED_STATUSES.includes(t.status))
}

/** Get effective primary status (Open/In Review/Closed) */
export function getPrimaryStatus(t: { status: string; statuses?: string[] }): string {
    const all = t.statuses?.length ? t.statuses : [t.status]
    const primary = all.find(s => PRIMARY_STATUSES.includes(s))
    return primary ?? (isTicketClosed(t) ? 'closed' : 'open')
}

// ── Categories ────────────────────────────────────────────────────────────────

export const PUBLIC_CATEGORIES: CommunityTicketCategory[] = ['request', 'bug', 'mission', 'campaign']
export const PRIVATE_CATEGORIES: CommunityTicketCategory[] = ['unit-feedback', 'complaint', 'award']

export const CAT_META: Record<string, { label: string; color: string; borderColor: string }> = {
    request:         { label: 'Requests',           color: 'rgba(255,160,0,0.85)',   borderColor: 'rgba(255,160,0,0.3)'   },
    bug:             { label: 'Bug Reports',         color: 'rgba(219,0,29,0.85)',    borderColor: 'rgba(219,0,29,0.3)'    },
    mission:         { label: 'Missions',            color: 'rgba(0,195,255,0.85)',   borderColor: 'rgba(0,195,255,0.3)'   },
    campaign:        { label: 'Campaigns',           color: 'rgba(167,139,250,0.9)', borderColor: 'rgba(167,139,250,0.3)' },
    'unit-feedback': { label: 'Unit Feedback',       color: 'rgba(74,222,128,0.85)', borderColor: 'rgba(74,222,128,0.28)' },
    complaint:       { label: 'Complaints',          color: 'rgba(255,80,80,0.85)',   borderColor: 'rgba(255,80,80,0.28)'  },
    award:           { label: 'Awards & Citations',  color: 'rgba(255,200,0,0.9)',    borderColor: 'rgba(255,200,0,0.28)'  },
}

export const SUBTYPE_LABELS: Record<string, string> = {
    'mod-request':          'Mod Request',
    'feature-request':      'Feature Request',
    'bug-arma':             'Bug — Arma 3',
    'bug-discord':          'Bug — Discord',
    'bug-website':          'Bug — Website',
    'bug-milpac':           'Bug — MILPAC',
    'bug-milpack':          'Bug — MILPAC',        // legacy alias
    'bug-teamspeak':        'Bug — TeamSpeak',
    'bug-other-game':       'Bug — Other Game',
    'bug-other':            'Bug — Other',
    'mission':              'Mission Idea',
    'campaign':             'Campaign Idea',
    'unit-feedback':        'Unit Feedback',
    'complaint-individual': 'Complaint — Individual',
    'complaint-group':      'Complaint — Group',
    'complaint-department': 'Complaint — Callsign / Department',
    'award-nomination':     'Award Nomination',
    'award-creation':       'Award & Citation Idea',
}

// ── Departments ───────────────────────────────────────────────────────────────

export const DEPT_META: Record<string, { label: string; short: string }> = {
    j1: { label: 'J1 — Recruitment',    short: 'J1' },
    j2: { label: 'J2 — Mission Making', short: 'J2' },
    j3: { label: 'J3 — Training',       short: 'J3' },
    j4: { label: 'J4 — Administration', short: 'J4' },
    j5: { label: 'J5 — Media',          short: 'J5' },
    j6: { label: 'J6 — Game Masters',   short: 'J6' },
    j7: { label: 'J7 — Development',    short: 'J7' },
}

// ── Severity ──────────────────────────────────────────────────────────────────

export const SEV_META: Record<string, { color: string }> = {
    low:      { color: 'rgba(74,222,128,0.8)'  },
    medium:   { color: 'rgba(255,160,0,0.85)'  },
    high:     { color: 'rgba(219,0,29,0.85)'   },
    critical: { color: 'rgba(255,0,0,0.95)'    },
}

// ── Feedback type ─────────────────────────────────────────────────────────────

export const FB_TYPE_META: Record<string, { color: string; label: string }> = {
    positive: { color: 'rgba(74,222,128,0.85)', label: 'Positive' },
    neutral:  { color: 'rgba(237,237,237,0.6)', label: 'Neutral'  },
    negative: { color: 'rgba(219,0,29,0.85)',   label: 'Negative' },
}

// ── Awards categories ─────────────────────────────────────────────────────────

export const AWARD_CATEGORIES = [
    'Period of Service Citations',
    'Non-operational Awards',
    'Operational Awards',
    'Leadership Awards',
    'Member Skill Awards',
    'Operational Service Citations',
    'Suggest New Category',
]

// ── Games list (alphabetical) ─────────────────────────────────────────────────

export const ASOT_GAMES = [
    'Arma 3',
    'Arma Reforger',
    'ARK Survival Evolved',
    'Assetto Corsa',
    'Assetto Corsa Competizione',
    'Barotrauma',
    'DayZ Standalone',
    'DCS Olympus',
    'DCS World',
    'Farming Simulator 22',
    'Ground Branch',
    'Hell Let Loose',
    'Minecraft',
    'Palworld',
    'Project Zomboid',
    'Rust',
    'SCUM',
    'Space Engineers',
    'Squad',
    'Stormworks',
    'Valheim',
    '7 Days to Die',
    'Other',
]

// ── Feature categories ────────────────────────────────────────────────────────

export const FEATURE_CATEGORIES = ['Arma', 'Discord', 'Website', 'MILPAC', 'TeamSpeak', 'Other Game', 'Other']

// ── Unit Feedback subcategories ───────────────────────────────────────────────

export const UNIT_FEEDBACK_CATS = [
    'Recruitment', 'BCT', 'Training', 'Discord', 'TeamSpeak',
    'ORBAT / Callsigns', 'Mods', 'Gameplay', 'Planning',
    'Medical', 'Operations', 'Midweek', 'Chaplain', 'Other',
]

// ── Discord issue types ───────────────────────────────────────────────────────

export const DISCORD_ISSUE_TYPES = [
    { value: 'roles',          label: 'Roles'          },
    { value: 'permissions',    label: 'Permissions'    },
    { value: 'channel-access', label: 'Channel Access' },
    { value: 'layout',         label: 'Layout / Display' },
    { value: 'other',          label: 'Other'          },
]

// ── TeamSpeak issue types ─────────────────────────────────────────────────────

export const TS_ISSUE_TYPES = [
    { value: 'permissions', label: 'Permissions' },
    { value: 'channels',    label: 'Channels'    },
    { value: 'access',      label: 'Access'      },
    { value: 'other',       label: 'Other'       },
]

// ── Mission types ─────────────────────────────────────────────────────────────

export const MISSION_TYPES = [
    { value: 'midweek', label: 'Midweek Operation' },
    { value: 'weekend', label: 'Weekend Operation'  },
]

// ── Guidance text colour (high contrast) ─────────────────────────────────────

export const GUIDANCE_TEXT_COLOR = 'rgba(237,237,237,0.55)'
export const GUIDANCE_NUMBER_COLOR = 'rgba(219,0,29,0.65)'

// ── Shared styles ─────────────────────────────────────────────────────────────

export const INPUT_STYLE: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderBottom: '1px solid rgba(255,255,255,0.18)',
    color: 'rgba(237,237,237,0.9)',
    fontSize: '0.875rem',
    outline: 'none',
    boxSizing: 'border-box' as const,
    borderRadius: 0,
    fontFamily: 'inherit',
}

export const SELECT_STYLE: React.CSSProperties = {
    ...INPUT_STYLE,
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='rgba(237,237,237,0.5)' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 32,
}

export const TA_STYLE: React.CSSProperties = {
    ...INPUT_STYLE,
    resize: 'vertical' as const,
    minHeight: 100,
    lineHeight: 1.65,
}
