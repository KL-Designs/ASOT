'use client'

import { lazy, Suspense } from 'react'
import OrbatOnboarding from './OrbatOnboarding'

const BCTAvailabilityCalendar = lazy(() => import('@/app/dashboard/j1/tabs/BCTAvailabilityCalendar'))

// ── Shared types ──────────────────────────────────────────────────────────────

export interface IntroProgress {
    warmWelcome: boolean
    processExplained: boolean
    backgroundExplained: boolean
    valuesExplained: boolean
}

export interface BgProgress {
    ageConfirmed: boolean
    regionDiscussed: boolean
    armaOwnershipConfirmed: boolean
    milsimDiscussed: boolean
    unitsDiscussed: boolean
    communityIssuesCompleted: boolean
}

export interface BCTSlotPreview {
    id: string
    date: string
    periods: string[]
    label: string
}

export interface LivePreview {
    namePreview?: string
    nameStatus?: 'idle' | 'checking' | 'available' | 'taken'
    nameOffensive?: boolean
    nameSimilar?: string[]
    bgProgress?: BgProgress
    region?: string
    previousUnits?: string
    currentUnit?: string
    experience?: string
    availableNights?: string
    opsPerMonth?: string
    primaryRole?: string
    additionalRoles?: string[]
    departmentInterest?: string[]
    rulesQuestionIndex?: number
    orbatHighlight?: string | null
    orbatSubView?: 'main' | 'attendance' | 'loa' | null
    tsLinkStatus?: 'idle' | 'pending' | 'linked' | 'failed'
    bctSlots?: BCTSlotPreview[]
    recruiterCursorX?: number
    recruiterCursorY?: number
    isQuiz?: boolean
}

// ── Section mapping ───────────────────────────────────────────────────────────

export const SECTION_MAP: Record<number, { num: number; title: string } | null> = {
    1: null,
    2: { num: 1, title: 'Personal Details & Experience' },
    3: { num: 1, title: 'Personal Details & Experience' },
    4: { num: 1, title: 'Personal Details & Experience' },
    5: { num: 1, title: 'Personal Details & Experience' },
    6: { num: 1, title: 'Personal Details & Experience' },
    7: { num: 1, title: 'Personal Details & Experience' },
    8: { num: 2, title: 'Basic Combat Trainings' },
    9: { num: 2, title: 'BCT Availability' },
    10: { num: 2, title: 'Operation Details' },
    11: { num: 3, title: 'Rules & Expectations' },
    12: { num: 3, title: 'Joining Agreement' },
    13: { num: 4, title: 'Processing Into The Unit' },
    14: { num: 4, title: 'Processing Into The Unit' },
}

// ── Joining agreement questions (step 12 — shown one at a time to applicant) ──
// Mixed YES/NO answers deliberately. Recruiter sees explanation; applicant sees question only.

export const RULES_QUESTIONS = [
    {
        question: 'Do you agree to uphold a certain degree of seriousness that is demonstrated and displayed by the rest of the group?',
        recruiterNote: 'Expected answer: YES.',
        fullExplanation: 'ASOT is a semi-serious milsim community. During operations, we ask all members to maintain a professional attitude — stay in role, follow the scenario, and avoid disrupting the immersion for others. Off-duty, things are more relaxed. We are not asking for perfection — just a reasonable level of seriousness when it counts.',
        correct: true,
    },
    {
        question: 'Do you agree to obey the chain of command?',
        recruiterNote: 'Expected answer: YES.',
        fullExplanation: 'Following the chain of command during operations ensures the mission runs smoothly and safely for everyone. Orders from section leaders, platoon commanders, and higher command are to be followed during operations. Outside of operations, the chain of command still applies when it comes to unit administration.',
        correct: true,
    },
    {
        question: 'Will you spread rumours or malicious comments about other members of the unit that could cause hostility within the group?',
        recruiterNote: 'Expected answer: NO.',
        fullExplanation: 'Toxic behaviour damages communities. Spreading rumours, making malicious comments, or attempting to cause division within the group is not acceptable. If you have a genuine concern, bring it to a J4 or J1 staff member through the proper channels. This rule exists to protect everyone — including you.',
        correct: false,
    },
    {
        question: 'Do you agree to respect our current members no matter what their rank, age, gender, race and/or sexual preferences?',
        recruiterNote: 'Expected answer: YES.',
        fullExplanation: 'ASOT has a diverse membership. All members must be treated with respect regardless of their background, rank, experience level, age, gender, or identity. In-game rank does not entitle anyone to treat others poorly. Everyone starts as a recruit — respect is expected from day one.',
        correct: true,
    },
    {
        question: 'Are you allowed to be a part of another Arma 3 modern warfare MILSIM group whilst you are a member of ASOT?',
        recruiterNote: 'Expected answer: NO.',
        fullExplanation: 'Dual-clanning with other modern warfare MILSIM groups is not permitted. This is to prevent conflicts of interest, scheduling conflicts, and divided loyalty. Fantasy groups — such as Star Wars, Halo, 40K, or Altis Life communities — are completely fine. The restriction only applies to other Arma 3 modern warfare MILSIM groups.',
        correct: false,
    },
    {
        question: 'If you wish to leave ASOT or require an LOA, can you just disappear?',
        recruiterNote: 'Expected answer: NO.',
        fullExplanation: 'Going AWOL without communication is not acceptable. If you need time off, apply for a Leave of Absence through your section lead. If you decide to leave the unit, let us know rather than simply disappearing. We understand life gets busy — a short message is all it takes. Members who disappear without notice may be removed.',
        correct: false,
    },
    {
        question: 'Do you agree to represent ASOT in a positive manner in all other servers?',
        recruiterNote: 'Expected answer: YES.',
        fullExplanation: 'Your conduct in other communities — other Discord servers, other games, and public spaces — reflects on ASOT. Behaving poorly elsewhere while holding an ASOT affiliation is not acceptable. We expect members to treat others with the same respect they would show within the unit.',
        correct: true,
    },
    {
        question: 'Are you allowed to tell Sunday night what happened on Saturday night to give them time to plan and prepare?',
        recruiterNote: 'Expected answer: NO.',
        fullExplanation: 'This is our anti-meta-gaming rule. ASOT operates on Saturday and Sunday nights. If you attend Saturday\'s operation, you are not allowed to share details of what happened — mission outcomes, areas explored, threats encountered — with Sunday night players. Each night\'s operation should be experienced fresh. The same applies in reverse.',
        correct: false,
    },
]

// ── Operation times (Unix seconds) ───────────────────────────────────────────

export const OPS_STANDARD = [
    { name: 'Staff Load In',         ts: 1830321900 },
    { name: 'Staff Briefing',        ts: 1830322200 },
    { name: 'All Members Load In',   ts: 1830322800 },
    { name: 'Step Off',              ts: 1830323400 },
    { name: 'Mission End (approx.)', ts: 1830331800, tsEnd: 1830335400 },
]
export const OPS_DST = [
    { name: 'Staff Load In',         ts: 1853997300 },
    { name: 'Staff Briefing',        ts: 1853997600 },
    { name: 'All Members Load In',   ts: 1853998200 },
    { name: 'Step Off',              ts: 1853998800 },
    { name: 'Mission End (approx.)', ts: 1854007200, tsEnd: 1854010800 },
]

export function fmtTime(ts: number): string {
    return new Date(ts * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const DEPT_LIST = [
    'J1 — Recruitment', 'J2 — Mission Making', 'J3 — Training',
    'J4 — Company Headquarters', 'J5 — Media',
    'J6 — Gamemasters (Zeus)', 'J7 — Community Development',
]

// ── Helper components ─────────────────────────────────────────────────────────

export function BulletList({ items }: { items: string[] }) {
    return (
        <ul style={{ margin: '10px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
            {items.map((item, i) => (
                <li key={i} style={{ fontSize: '0.88rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.8 }}>{item}</li>
            ))}
        </ul>
    )
}

export function SubHead({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.65)', margin: '16px 0 6px' }}>
            {children}
        </div>
    )
}

export function InfoBox({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ margin: '14px 0 0', padding: '10px 14px', background: 'rgba(219,0,29,0.05)', borderLeft: '2px solid rgba(219,0,29,0.35)', fontSize: '0.8rem', color: 'rgba(237,237,237,0.4)', lineHeight: 1.65 }}>
            {children}
        </div>
    )
}

export function OpsTable({ events, label }: { events: typeof OPS_STANDARD, label: string }) {
    return (
        <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 6 }}>{label}</div>
            <div style={{ border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
                {events.map((ev, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 12px', background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent', borderBottom: i < events.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <span style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.55)' }}>{ev.name}</span>
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'rgba(237,237,237,0.75)', fontFamily: 'monospace' }}>
                            {fmtTime(ev.ts)}{ev.tsEnd ? ` – ${fmtTime(ev.tsEnd)}` : ''}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

function OpsSchedule() {
    return (
        <div>
            <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', marginBottom: 10, lineHeight: 1.5 }}>
                All times shown in your local time zone.
            </div>
            <OpsTable events={OPS_STANDARD} label='Standard Time (AEST)' />
            <OpsTable events={OPS_DST} label='Daylight Saving (AEDT)' />
        </div>
    )
}

// ── Region-based estimated latency ───────────────────────────────────────────

const REGION_LATENCY: Record<string, number> = {
    'Oceania':        20,
    'Asia':          120,
    'North America':  200,
    'Europe':         270,
    'Middle East':    230,
    'South America':  330,
    'Africa':         370,
}

function RegionLatencyBadge({ region }: { region?: string }) {
    const ms = region ? (REGION_LATENCY[region] ?? null) : null

    const quality = ms === null ? null
        : ms < 80  ? { label: 'Excellent', color: '#00c364' }
        : ms < 150 ? { label: 'Good',      color: '#a3e635' }
        : ms < 250 ? { label: 'Fair',      color: '#f59e0b' }
        :            { label: 'High ping',  color: '#ef4444' }

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', marginBottom: 14 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: quality ? quality.color : 'rgba(255,255,255,0.15)', flexShrink: 0, transition: 'background 0.3s' }} />
            <div>
                <div style={{ fontSize: '0.72rem', fontWeight: 700, color: quality ? quality.color : 'rgba(237,237,237,0.25)' }}>
                    {quality ? quality.label : 'Awaiting region…'}
                </div>
                {ms !== null && (
                    <div style={{ fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)', marginTop: 1 }}>~{ms}ms estimated to server</div>
                )}
            </div>
        </div>
    )
}

function PageHeading({ children }: { children: React.ReactNode }) {
    return (
        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)', marginBottom: 14, marginTop: 0 }}>
            {children}
        </h2>
    )
}

// ── Introduction content (step 2) ─────────────────────────────────────────────

export function IntroContent({ ip }: { ip: IntroProgress }) {
    const base: React.CSSProperties = { fontSize: '0.88rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.8 }

    if (!ip.warmWelcome) return (
        <div>
            <PageHeading>Welcome to ASOT</PageHeading>
            <p style={base}>Your recruiter is about to introduce themselves and welcome you to the community.</p>
            <InfoBox>If you have questions at any time, use the Raise Hand button below. Your recruiter will pause and answer.</InfoBox>
        </div>
    )
    if (!ip.processExplained) return (
        <div>
            <PageHeading>How the Interview Works</PageHeading>
            <p style={base}>Your recruiter is explaining how the interview is structured. It covers:</p>
            <SubHead>Section 1</SubHead><p style={base}>Personal details, previous experience, availability, and interests.</p>
            <SubHead>Section 2</SubHead><p style={base}>Basic Combat Trainings and Operation Details.</p>
            <SubHead>Section 3</SubHead><p style={base}>Rules and expectations for all joining members.</p>
            <SubHead>Section 4</SubHead><p style={base}>Processing into the group if you still wish to join.</p>
        </div>
    )
    if (!ip.backgroundExplained) return (
        <div>
            <PageHeading>About ASOT</PageHeading>
            <p style={base}>Your recruiter is covering ASOT&apos;s background and history.</p>
            <BulletList items={[
                'ASOT opened in August 2020.',
                'We are based on a fictional ADF-style unit.',
                'Our ORBAT, procedures, and hierarchy are structured to resemble the ADF.',
                'Because we are fictional, we can use a wide range of vehicles, airframes, and weapons.',
                'We aim to be warm, welcoming, and professional in a semi-serious milsim environment.',
            ]} />
        </div>
    )
    if (!ip.valuesExplained) return (
        <div>
            <PageHeading>Our Values</PageHeading>
            <p style={base}>Your recruiter is explaining what ASOT stands for.</p>
            <SubHead>Core Values</SubHead>
            <BulletList items={['Community', 'Welcoming', 'Respect', 'Enjoyment']} />
            <SubHead>Operating Principles</SubHead>
            <BulletList items={['Professionalism', 'Competence', 'Realism with Purpose', 'Operational Flexibility']} />
        </div>
    )
    return (
        <div>
            <PageHeading>Introduction Complete</PageHeading>
            <p style={base}>Your recruiter has finished the introduction. The next step covers your Steam profile.</p>
            <InfoBox>You can still raise your hand at any time if you have a question.</InfoBox>
        </div>
    )
}

// ── Background content (step 5) ───────────────────────────────────────────────

function BgContent({ bp, lp }: { bp: BgProgress, lp: LivePreview }) {
    const base: React.CSSProperties = { fontSize: '0.88rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.8 }

    if (!bp.ageConfirmed) return (
        <div>
            <PageHeading>Background</PageHeading>
            <p style={base}>Your recruiter is gathering some background information. There are no wrong answers — this helps place you correctly.</p>
            <BulletList items={[
                'Age — we generally require members to be 17 or older.',
                'If you are 16 or younger, you must be vouched for by a current member to continue.',
                'Region — helps us understand your time zone and potential connection latency.',
            ]} />
        </div>
    )

    if (!bp.regionDiscussed) return (
        <div>
            <PageHeading>Region &amp; Connection</PageHeading>
            <p style={base}>Your recruiter is discussing your region and time zone.</p>
            <SubHead>Your Connection Quality</SubHead>
            <RegionLatencyBadge region={lp.region} />
            <InfoBox>Operation times are covered in the Availability section later in this interview.</InfoBox>
        </div>
    )

    if (!bp.armaOwnershipConfirmed) return (
        <div>
            <PageHeading>Arma 3 Ownership</PageHeading>
            <p style={base}>Your recruiter is confirming whether you own Arma 3.</p>
            <BulletList items={[
                'Arma 3 is required to participate in ASOT operations.',
                'If you do not currently own it, the application can continue but will be marked as pending at the end.',
                'You will need to purchase Arma 3 before officially joining and attending operations.',
            ]} />
            <InfoBox>Arma 3 is available on Steam. It regularly goes on sale at significant discounts.</InfoBox>
        </div>
    )

    if (!bp.milsimDiscussed) return (
        <div>
            <PageHeading>Your Milsim Experience</PageHeading>
            <p style={base}>Your recruiter is asking about your previous milsim and gaming experience.</p>
            <BulletList items={[
                'Previous milsim experience helps us understand your starting point.',
                'No prior experience is required — we have BCT training to get you up to speed.',
                'If you have played in other units, your recruiter may ask about those experiences.',
            ]} />
        </div>
    )

    if (!bp.unitsDiscussed) return (
        <div>
            <PageHeading>Previous Units &amp; Groups</PageHeading>
            <p style={base}>Your recruiter is asking about any previous or current milsim communities you have been part of.</p>
            {lp.previousUnits && (
                <div style={{ margin: '12px 0', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '2px solid rgba(219,0,29,0.4)' }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 6 }}>Previous Units (confirm with recruiter)</div>
                    <div style={{ fontSize: '0.88rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.7 }}>{lp.previousUnits}</div>
                </div>
            )}
            {lp.currentUnit && (
                <div style={{ margin: '12px 0', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '2px solid rgba(219,0,29,0.4)' }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 6 }}>Current Unit (confirm with recruiter)</div>
                    <div style={{ fontSize: '0.88rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.7 }}>{lp.currentUnit}</div>
                </div>
            )}
            <InfoBox>You cannot be part of another modern warfare milsim group while a member of ASOT. Fantasy groups are allowed.</InfoBox>
        </div>
    )

    if (!bp.communityIssuesCompleted) return (
        <div>
            <PageHeading>Community Standards</PageHeading>
            <p style={base}>Your recruiter is asking about any past community issues or bans.</p>
            <BulletList items={[
                'ASOT takes community conduct seriously.',
                'Be honest — prior issues do not automatically disqualify you.',
                'Your recruiter will note anything relevant for the J1 team.',
            ]} />
        </div>
    )

    return (
        <div>
            <PageHeading>Background Complete</PageHeading>
            <p style={base}>Your recruiter has covered your background. The next step confirms your operation availability.</p>
            {lp.experience && (
                <div style={{ margin: '16px 0 0', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '2px solid rgba(219,0,29,0.4)' }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 6 }}>Experience / Background (confirm wording with recruiter)</div>
                    <div style={{ fontSize: '0.85rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{lp.experience}</div>
                </div>
            )}
        </div>
    )
}

// ── ORBAT diagram ─────────────────────────────────────────────────────────────
// Visual structure mirrors the community ORBAT page at /community/orbat.
// Four platoon columns with colored headers, section cards, and highlight/zoom.
// Zoom anchors to the selected column using transform-origin.

const ORBAT_COLUMNS = [
    {
        id: '1P',
        label: '1-1 Infantry Platoon',
        abbr: '1 PLT',
        nights: 'Saturday nights',
        color: '#3b82f6',
        sections: [
            { title: 'Platoon HQ', roles: ['Platoon Commander', '2IC / Sergeant', 'RTO / Signaller'] },
            { title: 'Alpha Section', roles: ['Section Commander', '2IC', 'Rifleman ×4'] },
            { title: 'Bravo Section', roles: ['Section Commander', '2IC', 'Rifleman ×4'] },
        ],
    },
    {
        id: '2P',
        label: '1-2 Infantry Platoon',
        abbr: '2 PLT',
        nights: 'Sunday nights',
        color: '#8b5cf6',
        sections: [
            { title: 'Platoon HQ', roles: ['Platoon Commander', '2IC / Sergeant', 'RTO / Signaller'] },
            { title: 'Alpha Section', roles: ['Section Commander', '2IC', 'Rifleman ×4'] },
            { title: 'Bravo Section', roles: ['Section Commander', '2IC', 'Rifleman ×4'] },
        ],
    },
    {
        id: '3P',
        label: '1-3 Support Platoon',
        abbr: '3 PLT',
        nights: 'Sat & Sun support',
        color: '#10b981',
        sections: [
            { title: 'Platoon HQ', roles: ['Platoon Commander', '2IC / Sergeant'] },
            { title: 'Combat Support', roles: ['Machine Gunner', 'Anti-Tank', 'Engineer', 'Sniper'] },
            { title: 'Aviation / CSS', roles: ['Rotary Pilot', 'Logistics', 'Medic', 'Indirect Fire'] },
        ],
    },
    {
        id: 'RES',
        label: 'Reservists',
        abbr: 'RES',
        nights: 'Both nights as needed',
        color: '#f59e0b',
        sections: [
            { title: 'Active Reservists', roles: ['Attached across platoons as available', 'Minimum 2 weekends/month'] },
            { title: 'Gamemasters (Zeus)', roles: ['Game Master', 'Assistant GM', 'Mission Support'] },
        ],
    },
]

const ZOOM_ORIGINS: Record<string, string> = {
    '1P':  '12% 50%',
    '2P':  '37% 50%',
    '3P':  '63% 50%',
    'RES': '88% 50%',
}

export function OrbatDiagram({ highlight, compact = false }: { highlight?: string | null; compact?: boolean }) {
    const zoomed = !!highlight
    const transformOrigin = highlight ? ZOOM_ORIGINS[highlight] ?? '50% 50%' : '50% 50%'

    return (
        <div style={{ marginTop: compact ? 6 : 12, overflow: 'hidden' }}>
            <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.45)', marginBottom: compact ? 8 : 12, fontFamily: 'monospace', textAlign: 'center' }}>
                {'// ORBAT — ASOT UNIT STRUCTURE'}
            </div>

            {/* Company HQ banner (compact: just a label; full: styled banner) */}
            {!compact && (
                <div style={{ marginBottom: 10, padding: '8px 16px', background: 'linear-gradient(90deg, rgba(219,0,29,0.15) 0%, rgba(219,0,29,0.06) 100%)', borderTop: '2px solid rgba(219,0,29,0.6)', border: '1px solid rgba(219,0,29,0.25)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.75)' }}>0-A India Company</div>
                    <div style={{ height: 1, flex: 1, background: 'rgba(219,0,29,0.15)' }} />
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.35)' }}>Company Headquarters</div>
                </div>
            )}

            {/* 4-column grid — zoom anchored to selected column */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: compact ? 4 : 8,
                transform: zoomed ? 'scale(1.09)' : 'scale(1)',
                transformOrigin,
                transition: 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), transform-origin 0.45s ease',
            }}>
                {ORBAT_COLUMNS.map(col => {
                    const active = highlight === col.id
                    const borderColor = `${col.color}${active ? '99' : '33'}`
                    const headerBg = active
                        ? `linear-gradient(90deg, ${col.color}dd 0%, ${col.color}aa 100%)`
                        : `linear-gradient(90deg, ${col.color}55 0%, ${col.color}33 100%)`

                    return (
                        <div key={col.id} style={{
                            display: 'flex', flexDirection: 'column',
                            border: `1px solid ${borderColor}`,
                            borderTop: `2px solid ${active ? col.color : `${col.color}66`}`,
                            boxShadow: active ? `0 0 20px ${col.color}22, inset 0 0 0 1px ${col.color}22` : 'none',
                            transition: 'all 0.35s ease',
                            overflow: 'hidden',
                        }}>
                            {/* Column header */}
                            <div style={{ background: headerBg, padding: compact ? '6px 8px' : '7px 10px', display: 'flex', alignItems: 'center', gap: 6, transition: 'background 0.35s' }}>
                                <div>
                                    <div style={{ fontSize: compact ? '0.6rem' : '0.68rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fff', lineHeight: 1.2 }}>{compact ? col.abbr : col.label}</div>
                                    <div style={{ fontSize: compact ? '0.52rem' : '0.58rem', color: 'rgba(255,255,255,0.65)', marginTop: 1, letterSpacing: '0.04em' }}>{col.nights}</div>
                                </div>
                            </div>

                            {/* Section cards */}
                            {!compact && col.sections.map((sec, si) => (
                                <div key={si} style={{ borderTop: `1px solid ${col.color}22`, overflow: 'hidden' }}>
                                    <div style={{ padding: '4px 8px 3px', background: active ? `${col.color}18` : 'rgba(255,255,255,0.02)', fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: active ? col.color : `${col.color}bb`, transition: 'all 0.3s' }}>
                                        {sec.title}
                                    </div>
                                    {sec.roles.map((role, ri) => (
                                        <div key={ri} style={{ padding: '3px 8px', fontSize: '0.62rem', color: active ? 'rgba(237,237,237,0.65)' : 'rgba(237,237,237,0.35)', background: ri % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.12)', borderBottom: `1px solid ${col.color}10`, lineHeight: 1.4, transition: 'color 0.3s' }}>
                                            {role}
                                        </div>
                                    ))}
                                </div>
                            ))}

                            {/* Compact: just a hint row */}
                            {compact && (
                                <div style={{ padding: '4px 8px', fontSize: '0.55rem', color: active ? `${col.color}cc` : 'rgba(237,237,237,0.3)', background: active ? `${col.color}0d` : 'transparent', transition: 'all 0.3s' }}>
                                    {col.sections.length} sections
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Main step content component ───────────────────────────────────────────────

export function StepContent({ step, introProgress, livePreview = {} }: {
    step: number
    introProgress: IntroProgress
    livePreview?: LivePreview
}) {
    const base: React.CSSProperties = { fontSize: '0.88rem', color: 'rgba(237,237,237,0.55)', lineHeight: 1.8 }

    switch (step) {
        case 1:
            return (
                <div>
                    <PageHeading>Getting Set Up</PageHeading>
                    <p style={base}>Your recruiter is getting the interview ready. Please make sure you have TeamSpeak 3 installed and connected to the ASOT server.</p>
                    <BulletList items={[
                        'Install TeamSpeak 3 — available at teamspeak.com (not TeamSpeak 5).',
                        'Enter the server address your recruiter sends you.',
                        'Add the server to your bookmarks for easy access.',
                        'Wait in the lobby — your recruiter will move you into the interview room.',
                        'Test your microphone and audio before the interview begins.',
                    ]} />
                    <InfoBox>If you have any trouble connecting, let your recruiter know and they will step you through it.</InfoBox>
                </div>
            )

        case 2:
            return <IntroContent ip={introProgress} />

        case 3:
            return (
                <div>
                    <PageHeading>Steam Profile</PageHeading>
                    <p style={base}>Your recruiter needs your Steam profile link or Steam ID.</p>
                    <SubHead>How to find your Steam profile link</SubHead>
                    <BulletList items={[
                        'Open Steam.',
                        'Click your username in the top-right corner.',
                        'Select "View my profile".',
                        'Right-click the page and select "Copy Page URL".',
                        'Send that link to your recruiter.',
                    ]} />
                    <InfoBox>If you cannot right-click to copy the URL, let your recruiter know — they will help you find it another way.</InfoBox>
                </div>
            )

        case 4: {
            const name = livePreview.namePreview
            const nStatus = livePreview.nameStatus ?? 'idle'
            const nOffensive = livePreview.nameOffensive ?? false
            const nSimilar = livePreview.nameSimilar ?? []
            const statusColor = nOffensive ? '#f59e0b'
                : nStatus === 'available' ? '#00c364'
                : nStatus === 'taken' ? '#ef4444'
                : 'rgba(237,237,237,0.35)'
            return (
                <div>
                    <PageHeading>Your ASOT Name</PageHeading>
                    <p style={base}>Your recruiter is confirming the name you will use within ASOT.</p>

                    {/* Live name preview */}
                    <div style={{ margin: '20px 0', padding: '16px 20px', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.25)', borderTop: '2px solid rgba(219,0,29,0.5)' }}>
                        <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 8, fontFamily: 'monospace' }}>
                            {'// YOUR ASOT NAME'}
                        </div>
                        {name ? (
                            <div style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '0.06em', color: 'rgba(237,237,237,0.9)' }}>
                                {name}
                            </div>
                        ) : (
                            <div style={{ fontSize: '0.88rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>
                                Waiting for recruiter to confirm name…
                            </div>
                        )}
                        {name && nStatus !== 'idle' && (
                            <div style={{ marginTop: 8, fontSize: '0.78rem', fontWeight: 600, color: statusColor }}>
                                {nStatus === 'checking' ? 'Checking availability…'
                                    : nOffensive ? '⚠ Name may not be appropriate.'
                                    : nStatus === 'available' ? '✓ Name is available'
                                    : nStatus === 'taken' ? '✕ Name is already in use'
                                    : null}
                            </div>
                        )}
                        {nSimilar.length > 0 && nStatus !== 'taken' && (
                            <div style={{ marginTop: 5, fontSize: '0.72rem', color: '#f59e0b', lineHeight: 1.55 }}>
                                Similar name{nSimilar.length > 1 ? 's' : ''} already in the unit: <strong>{nSimilar.join(', ')}</strong>
                            </div>
                        )}
                    </div>

                    <BulletList items={[
                        'Your name can be up to 12 characters.',
                        'Keep it simple and easy to say over voice comms.',
                        'It should not be too similar to an existing member\'s name.',
                        'Your recruiter will confirm availability before finalising.',
                    ]} />
                </div>
            )
        }

        case 5: {
            const bp: BgProgress = livePreview.bgProgress ?? {
                ageConfirmed: false, regionDiscussed: false, armaOwnershipConfirmed: false,
                milsimDiscussed: false, unitsDiscussed: false, communityIssuesCompleted: false,
            }
            return (
                <div>
                    <BgContent bp={bp} lp={livePreview} />
                    {livePreview.experience && bp.milsimDiscussed && !bp.communityIssuesCompleted && (
                        <div style={{ margin: '14px 0 0', padding: '10px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderLeft: '2px solid rgba(219,0,29,0.4)' }}>
                            <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 6 }}>Experience / Background (confirm wording with recruiter)</div>
                            <div style={{ fontSize: '0.85rem', color: 'rgba(237,237,237,0.6)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{livePreview.experience}</div>
                        </div>
                    )}
                </div>
            )
        }

        case 6: {
            const nights = livePreview.availableNights
            const ops = livePreview.opsPerMonth
            return (
                <div>
                    <PageHeading>Availability</PageHeading>
                    <p style={base}>Your recruiter is confirming your availability for ASOT operations.</p>

                    {(nights || ops) && (
                        <div style={{ margin: '16px 0', padding: '12px 16px', background: 'rgba(0,195,100,0.05)', border: '1px solid rgba(0,195,100,0.25)', borderLeft: '2px solid rgba(0,195,100,0.5)', display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                            {nights && (
                                <div>
                                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(0,195,100,0.6)', marginBottom: 4, fontFamily: 'monospace' }}>Selected Nights</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)' }}>{nights}</div>
                                </div>
                            )}
                            {ops && (
                                <div>
                                    <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(0,195,100,0.6)', marginBottom: 4, fontFamily: 'monospace' }}>Ops per Month</div>
                                    <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)' }}>{ops}</div>
                                </div>
                            )}
                        </div>
                    )}

                    <SubHead>Attendance Expectations</SubHead>
                    <BulletList items={[
                        'Call sign position: attend 3 weekends per month.',
                        'Reservist position: attend 2 weekends per month.',
                        'Saturday or Sunday counts — you do not need to attend both for it to be a weekend.',
                        '1 Platoon operates Saturday nights.',
                        '2 Platoon operates Sunday nights.',
                        '3 Platoon is the support platoon and spans both nights.',
                    ]} />

                    <SubHead>Operation Schedule</SubHead>
                    <OpsSchedule />
                </div>
            )
        }

        case 7: {
            const primary = livePreview.primaryRole
            const additional = livePreview.additionalRoles ?? []
            const deptInterest = livePreview.departmentInterest ?? []
            return (
                <div>
                    <PageHeading>Roles &amp; Departments</PageHeading>
                    <p style={base}>Your recruiter is confirming your role interest. You can change roles later — this is your starting preference.</p>

                    {primary && (
                        <div style={{ margin: '16px 0 0', padding: '10px 14px', background: 'rgba(219,0,29,0.06)', border: '1px solid rgba(219,0,29,0.25)', borderLeft: '2px solid rgba(219,0,29,0.5)' }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.6)', marginBottom: 5, fontFamily: 'monospace' }}>Primary Role</div>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)' }}>{primary}</div>
                        </div>
                    )}

                    {additional.length > 0 && (
                        <div style={{ margin: '12px 0 0' }}>
                            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.4)', marginBottom: 8 }}>Additional Roles</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {additional.map(r => (
                                    <span key={r} style={{ fontSize: '0.75rem', padding: '3px 10px', background: 'rgba(219,0,29,0.08)', border: '1px solid rgba(219,0,29,0.25)', color: 'rgba(237,237,237,0.65)' }}>{r}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    <SubHead>Departments</SubHead>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        {DEPT_LIST.map(d => {
                            const selected = deptInterest.includes(d)
                            return (
                                <div key={d} style={{
                                    padding: '8px 12px',
                                    background: selected ? 'rgba(0,195,100,0.06)' : 'rgba(255,255,255,0.02)',
                                    border: selected ? '1px solid rgba(0,195,100,0.3)' : '1px solid rgba(255,255,255,0.06)',
                                    borderLeft: selected ? '2px solid rgba(0,195,100,0.6)' : '2px solid transparent',
                                    fontSize: '0.82rem',
                                    color: selected ? 'rgba(237,237,237,0.8)' : 'rgba(237,237,237,0.35)',
                                    fontWeight: selected ? 600 : 400,
                                    transition: 'all 0.2s',
                                }}>
                                    {selected && <span style={{ fontSize: '0.65rem', color: '#00c364', marginRight: 8 }}>✓</span>}
                                    {d}
                                </div>
                            )
                        })}
                    </div>
                    {deptInterest.length === 0 && (
                        <div style={{ fontSize: '0.78rem', color: 'rgba(237,237,237,0.25)', marginTop: 8, fontStyle: 'italic' }}>
                            No departments selected yet — recruiter is confirming your preferences.
                        </div>
                    )}
                </div>
            )
        }

        case 8:
            return (
                <div>
                    <PageHeading>Basic Combat Trainings</PageHeading>
                    <p style={base}>Your recruiter is explaining the Basic Combat Training process required for all new ASOT members.</p>
                    <SubHead>What to Expect</SubHead>
                    <BulletList items={[
                        'All new members must complete BCT Stage 1 and Stage 2 to officially join.',
                        'Stage 1 covers essential military skills and familiarisation with the mod set.',
                        'Once Stage 1 is completed, you are cleared to attend operations as a recruit.',
                        'Stage 2 builds on Stage 1 with advanced procedures and medical training.',
                        'Completion of Stage 2 is required to earn the rank of Private.',
                    ]} />
                    <SubHead>Time Limits</SubHead>
                    <BulletList items={[
                        'BCT Stage 1 must be completed within 30 days of joining.',
                        'Training sessions take approximately 2 hours.',
                        'If Stage 1 is not completed within the time limit, the application may be removed.',
                    ]} />
                    <InfoBox>If you need to reschedule a BCT session, contact the J3 team as early as possible. Do not miss a scheduled BCT without notice.</InfoBox>
                </div>
            )

        case 9: {
            const slots = livePreview.bctSlots ?? []
            const cx = livePreview.recruiterCursorX
            const cy = livePreview.recruiterCursorY
            return (
                <div style={{ position: 'relative' }}>
                    <PageHeading>{livePreview.isQuiz ? 'BCT1 Quiz Availability' : 'BCT Availability'}</PageHeading>
                    <p style={base}>{livePreview.isQuiz
                        ? 'Your recruiter is recording your available times for the BCT1 Confirmation Quiz. A J3 member will contact you in Discord once a session is confirmed.'
                        : 'Your recruiter is selecting your available times on the calendar below. This will be shared with the J3 training team to schedule your BCT Stage 1 session.'
                    }</p>

                    {/* Mirrored read-only calendar */}
                    <div style={{ position: 'relative', margin: '14px 0' }}>
                        {/* Recruiter cursor overlay — positioned relative to the calendar element */}
                        {cx !== undefined && cy !== undefined && (
                            <div style={{
                                position: 'absolute',
                                left: `${cx * 100}%`,
                                top: `${cy * 100}%`,
                                width: 18, height: 18,
                                borderRadius: '50%',
                                background: 'rgba(219,0,29,0.85)',
                                border: '2px solid rgba(255,255,255,0.9)',
                                boxShadow: '0 0 10px rgba(219,0,29,0.6)',
                                pointerEvents: 'none',
                                zIndex: 9999,
                                transform: 'translate(-50%,-50%)',
                                transition: 'left 0.08s linear, top 0.08s linear',
                            }} />
                        )}
                        <Suspense fallback={
                            <div style={{ padding: '24px', textAlign: 'center', color: 'rgba(237,237,237,0.3)', fontSize: '0.78rem' }}>Loading calendar…</div>
                        }>
                            <BCTAvailabilityCalendar
                                applicantId=''
                                applicantName=''
                                recruiterName=''
                                readOnly
                                externalSlots={slots}
                                isQuiz={livePreview.isQuiz}
                            />
                        </Suspense>
                    </div>

                    <InfoBox>{livePreview.isQuiz
                        ? 'The BCT1 Confirmation Quiz is conducted by J3 personnel and is designed for applicants with prior MILSIM experience. J3 will contact you in Discord to schedule your session.'
                        : 'BCT sessions are run by J3 personnel and typically take around 2 hours. J3 will contact you in Discord once a session is confirmed.'
                    }</InfoBox>
                </div>
            )
        }

        case 10: {
            const subView = livePreview.orbatSubView ?? 'main'

            if (subView === 'attendance') return (
                <div>
                    <PageHeading>Attendance Expectations</PageHeading>
                    <p style={base}>Your recruiter is covering what attendance is expected for each position within ASOT.</p>
                    <SubHead>Call Sign Position (Full-Time)</SubHead>
                    <BulletList items={[
                        'Approximately 3 weekends per month is the expected attendance.',
                        'Playing either Saturday or Sunday counts as attending that weekend — you do not need to attend both.',
                        '1 Platoon operates Saturday nights. 2 Platoon operates Sunday nights.',
                        '3 Platoon is the support platoon and operates across both nights.',
                    ]} />
                    <SubHead>Reservist Position</SubHead>
                    <BulletList items={[
                        'Minimum 2 weekends per month is expected for reservists.',
                        'Reservists are attached across both nights depending on unit needs.',
                        'Reservist status is ideal if you cannot commit to regular full-time attendance.',
                    ]} />
                    <InfoBox>Missing a session without notice is not acceptable. If something comes up, let your section lead know in advance.</InfoBox>
                </div>
            )

            if (subView === 'loa') return (
                <div>
                    <PageHeading>Leave of Absence (LOA)</PageHeading>
                    <p style={base}>Your recruiter is explaining what to do if you need time away from ASOT.</p>
                    <SubHead>How LOA Works</SubHead>
                    <BulletList items={[
                        'LOAs are granted for up to one month and can be extended to a maximum of three months.',
                        'To apply for an LOA, contact your section lead or a J1 staff member.',
                        'Your position is held while on LOA — you return where you left off.',
                        'LOA extensions beyond three months may result in moving to inactive reservist status.',
                    ]} />
                    <SubHead>Going AWOL</SubHead>
                    <BulletList items={[
                        'Disappearing without notice is not acceptable and may result in removal.',
                        'Life happens — we understand. Just communicate with staff so we can support you.',
                        'Even a short message is enough. You will not be penalised for needing time off.',
                    ]} />
                    <InfoBox>The LOA system exists to support members, not to catch them out. We would rather know you need time away than lose you entirely.</InfoBox>
                </div>
            )

            return (
                <div>
                    <PageHeading>Unit Structure &amp; ORBAT</PageHeading>
                    <p style={base}>Your recruiter is explaining how ASOT is organised and how operations are structured.</p>
                    <OrbatOnboarding highlight={livePreview.orbatHighlight} />
                    <SubHead>Attendance Expectations</SubHead>
                    <BulletList items={[
                        'Call sign position (full-time): approximately 3 weekends per month.',
                        'Reservist position: minimum 2 weekends per month.',
                        'Playing either Saturday or Sunday counts as attending that weekend.',
                    ]} />
                    <SubHead>Leave of Absence (LOA)</SubHead>
                    <BulletList items={[
                        'LOAs are granted for up to one month, extendable to three months.',
                        'Beyond three months may result in a move to inactive reservist status.',
                        'Never go AWOL — always communicate with staff if you need time away.',
                    ]} />
                </div>
            )
        }

        case 11:
            return (
                <div>
                    <PageHeading>Community Expectations</PageHeading>
                    <p style={base}>These are the expectations and standards we ask all members to uphold. They exist to help maintain a welcoming, respectful, and enjoyable environment for everyone in the community.</p>
                    <SubHead>How We Work Together</SubHead>
                    <BulletList items={[
                        'Bring a level of seriousness to operations that reflects the effort everyone puts in.',
                        'Work within the chain of command — it keeps operations smooth and fair.',
                        'Treat every member with respect, regardless of rank, background, or experience.',
                        'Keep communication positive and honest — no rumours or divisive behaviour.',
                        'Carry the ASOT name well in other communities and servers.',
                        'Stay committed to the group — no dual-clanning with other modern warfare units.',
                        'Keep us in the loop if you need time away. We understand life happens.',
                        'Respect the experience for everyone — no spoilers or meta-gaming.',
                    ]} />
                    <InfoBox>These expectations reflect how we look after each other as a community. The next section will ask you to confirm your agreement to each one individually.</InfoBox>
                </div>
            )

        case 12: {
            const qi = livePreview.rulesQuestionIndex ?? 0
            const q = RULES_QUESTIONS[qi]
            return (
                <div>
                    <PageHeading>Joining Agreement</PageHeading>
                    <p style={base}>Please read each question carefully and answer YES or NO using the buttons below.</p>
                    {q && (
                        <div style={{ margin: '20px 0', padding: '20px 22px', background: 'rgba(219,0,29,0.05)', border: '1px solid rgba(219,0,29,0.2)', borderTop: '2px solid rgba(219,0,29,0.5)' }}>
                            <div style={{ fontSize: '0.55rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.5)', marginBottom: 12, fontFamily: 'monospace' }}>
                                Question {qi + 1} of {RULES_QUESTIONS.length}
                            </div>
                            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'rgba(237,237,237,0.9)', lineHeight: 1.55 }}>{q.question}</div>
                        </div>
                    )}
                    <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 8 }}>
                        {RULES_QUESTIONS.map((_, i) => (
                            <div key={i} style={{ width: i === qi ? 16 : 6, height: 6, borderRadius: 3, background: i < qi ? '#00c364' : i === qi ? 'rgba(219,0,29,0.8)' : 'rgba(255,255,255,0.1)', transition: 'all 0.2s' }} />
                        ))}
                    </div>
                </div>
            )
        }

        case 13:
            return (
                <div>
                    <PageHeading>Almost There</PageHeading>
                    <p style={base}>Your recruiter has a couple of final questions before processing your application.</p>
                    <InfoBox>Take your time. This is your opportunity to ask anything before making your final decision about joining ASOT.</InfoBox>
                    <BulletList items={[
                        'Do you have any questions about anything covered so far?',
                        'Is there anything you would like to clarify before committing?',
                        'Would you still like to continue joining ASOT?',
                    ]} />
                </div>
            )

        case 14: {
            const tsStatus = livePreview.tsLinkStatus ?? 'idle'
            return (
                <div>
                    <PageHeading>Final Steps</PageHeading>
                    <p style={base}>Your recruiter is completing the final administrative steps before your application is submitted.</p>

                    {/* TeamSpeak status (widget is rendered above the card by ApplicantPageView) */}
                    {tsStatus === 'linked' && (
                        <div style={{ margin: '0 0 14px', padding: '12px 14px', background: 'rgba(0,195,100,0.05)', border: '1px solid rgba(0,195,100,0.3)' }}>
                            <div style={{ fontSize: '0.82rem', color: '#00c364', fontWeight: 600 }}>✓ TeamSpeak account linked successfully</div>
                        </div>
                    )}

                    {/* TFAR */}
                    <SubHead>Install Task Force Radio (TFAR)</SubHead>
                    <p style={{ fontSize: '0.85rem', color: 'rgba(237,237,237,0.5)', lineHeight: 1.7, marginBottom: 8 }}>
                        Click the button below to download the TFAR plugin directly from the ASOT website, then follow the steps with your recruiter.
                    </p>
                    <a
                        href='/api/tfar/download'
                        download
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', background: 'rgba(219,0,29,0.12)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(237,237,237,0.85)', textDecoration: 'none', cursor: 'pointer', marginBottom: 12 }}
                    >
                        ↓ Download TFAR Plugin
                    </a>
                    <BulletList items={[
                        'Click Download TFAR Plugin above.',
                        'Open the downloaded file and click Install.',
                        'Reconnect to the ASOT TeamSpeak server.',
                        'Click your name in TeamSpeak — confirm "Task Force Radio Status" is visible.',
                        'If not visible: Tools → Options → Addons.',
                    ]} />
                    <InfoBox>Do not proceed past this step until TFAR is confirmed installed. Your recruiter will verify this before continuing.</InfoBox>

                    <SubHead>What Happens Next</SubHead>
                    <BulletList items={[
                        'Your Discord roles will be updated and your name will be changed.',
                        'Your record will go to a J1 lead for sign-off.',
                        'You will receive a welcome message once officially processed.',
                    ]} />
                    <div style={{ marginTop: 14, padding: '12px 16px', background: 'rgba(219,0,29,0.05)', border: '1px solid rgba(219,0,29,0.2)', borderTop: '2px solid rgba(219,0,29,0.4)', fontSize: '0.88rem', fontWeight: 700, color: 'rgba(237,237,237,0.85)' }}>
                        Thank you for going through the ASOT recruitment process. Welcome to the community!
                    </div>
                </div>
            )
        }

        default:
            return (
                <div>
                    <PageHeading>Recruitment in Progress</PageHeading>
                    <p style={base}>Your recruiter is working through the process. Please stand by.</p>
                </div>
            )
    }
}
