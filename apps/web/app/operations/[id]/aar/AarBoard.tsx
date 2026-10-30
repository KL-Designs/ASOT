'use client'

import { useCallback, useEffect, useState } from 'react'
import dayjs from 'dayjs'
import { rgbTriplet } from '@/lib/colour'
import HideSiteNav from '@/components/HideSiteNav'
import OperationBar from '../OperationBar'
import {
    SELECTABLE_STATUSES, attendanceStatus, RATING_ASPECTS, RATING_SCALE,
    type AttendanceStatus, type RatingAspectKey,
} from '@/lib/operations/aar'
import s from './aar.module.css'

interface Props {
    operationId: string
    title: string
    status?: string
    themeColor?: string
    date: string | null
    /** Whether the operation has actually finished. */
    open: boolean
}

interface Aar { fix: string; sustain: string; improve: string; writtenByName: string | null }

interface SectionMember {
    userId: string
    name: string
    role: string
    rsvp: 'attending' | 'not_attending' | null
    confirmed: boolean
    attendanceType: string | null
    /** Added by a roll call rather than placed on the roster. */
    late?: boolean
    aar: Aar | null
}

interface Section {
    title: string
    leadUserId: string | null
    members: SectionMember[]
}

interface Payload {
    open: boolean
    attended: boolean
    canManageAll: boolean
    mySections: string[]
    mine: Aar | null
    feedback: { server: number | null; combat: number | null; story: number | null; comment: string } | null
    sections: Section[]
}

const EMPTY_AAR: Aar = { fix: '', sustain: '', improve: '', writtenByName: null }

/** What each box is actually asking for. Three narrow questions get answered
 *  where one wide one gets skipped. */
const AAR_FIELDS = [
    { key: 'sustain' as const, label: 'Sustain', hint: 'What worked and should happen again next time.' },
    { key: 'improve' as const, label: 'Improve', hint: 'What was fine but could be sharper.' },
    { key: 'fix' as const, label: 'Fix', hint: 'What went wrong and needs to be different.' },
]

/**
 * The After Action Report tab.
 *
 * Three things in the order they get done — how the night went, your own
 * write-up, then your section's if you led one. Somebody who led nothing sees
 * the first two and stops, which is most of the unit and should be the short
 * version of this screen.
 *
 * Every save is its own request against its own card. A member who fills in
 * their feedback and closes the tab has saved their feedback; nothing here
 * makes them finish the whole page to keep any of it.
 */
export default function AarBoard({ operationId, title, status, themeColor, date, open }: Props) {
    const accent = themeColor || '#db001d'
    const [data, setData] = useState<Payload | null>(null)
    const [failed, setFailed] = useState(false)

    const load = useCallback(() => {
        fetch(`/api/operations/${operationId}/aar`)
            .then(res => res.ok ? res.json() : Promise.reject(new Error(String(res.status))))
            .then(setData)
            .catch(() => setFailed(true))
    }, [operationId])

    useEffect(() => { if (open) load() }, [open, load])

    return (
        <div
            className='command'
            style={{
                ['--acc' as string]: accent,
                ['--acc-rgb' as string]: rgbTriplet(accent),
                display: 'flex', flexDirection: 'column', minHeight: '100%', background: 'var(--bg)',
            }}
        >
            <HideSiteNav />
            <OperationBar
                operationId={operationId}
                title={title}
                status={status}
                themeColor={themeColor}
                active='aar'
                canEdit={false}
                access={{ attendance: true, aar: true }}
            />

            {!open ? (
                <div className={s.notice}>
                    <p className={s.noticeTitle}>Not yet</p>
                    <p className={s.noticeBody}>
                        The After Action Report opens when the operation finishes.
                        {date && ` This one runs ${dayjs(date).format('ddd D MMM [at] HH:mm')}.`}
                    </p>
                </div>
            ) : failed ? (
                <div className={s.notice}>
                    <p className={s.noticeTitle}>Could not load</p>
                    <p className={s.noticeBody}>The report did not come back. Reload the page to try again.</p>
                </div>
            ) : !data ? (
                <p className={s.loading}>Loading…</p>
            ) : (
                <div className={s.page}>
                    <header className={s.head}>
                        <p className={s.eyebrow}>After Action Report</p>
                        <h1 className={s.title}>{title || 'Operation'}</h1>
                        <p className={s.lede}>
                            {data.attended
                                ? 'Say how the night went and write up what you saw. Both are read — the feedback by whoever made the mission, the report by your section.'
                                : 'You are not down as having been on this operation, so the feedback section is closed. If that is wrong, your section commander can correct it below.'}
                        </p>
                    </header>

                    {data.attended && (
                        <FeedbackCard
                            operationId={operationId}
                            initial={data.feedback}
                        />
                    )}

                    <AarCard
                        heading='Your report'
                        note={data.mine?.writtenByName ? `Written by ${data.mine.writtenByName}` : undefined}
                        operationId={operationId}
                        initial={data.mine ?? EMPTY_AAR}
                    />

                    {data.sections.map(section => (
                        <SectionCard
                            key={section.title}
                            operationId={operationId}
                            section={section}
                            onSaved={load}
                        />
                    ))}
                </div>
            )}
        </div>
    )
}

/* ── How the night went ─────────────────────────────────────────────────── */

function FeedbackCard({ operationId, initial }: {
    operationId: string
    initial: Payload['feedback']
}) {
    const [scores, setScores] = useState<Record<RatingAspectKey, number | null>>({
        server: initial?.server ?? null,
        combat: initial?.combat ?? null,
        story: initial?.story ?? null,
    })
    const [comment, setComment] = useState(initial?.comment ?? '')
    const { state, save } = useSave()

    return (
        <section className={s.card}>
            <div className={s.cardHead}>
                <h2 className={s.cardTitle}>How the night went</h2>
                <span className={s.cardNote}>Compared to a normal operation</span>
            </div>
            <div className={s.cardBody}>
                {RATING_ASPECTS.map(aspect => (
                    <div key={aspect.key} className={s.aspect}>
                        <span className={s.aspectLabel}>{aspect.label}</span>
                        <span className={s.aspectHint}>{aspect.hint}</span>
                        <div className={s.scale} role='radiogroup' aria-label={aspect.label}>
                            {RATING_SCALE.map(step => {
                                const on = scores[aspect.key] === step.value
                                return (
                                    <button
                                        key={step.value}
                                        type='button'
                                        role='radio'
                                        aria-checked={on}
                                        className={[
                                            s.step,
                                            on ? s.stepOn : '',
                                            step.offset === 0 ? s.stepNeutral : '',
                                        ].filter(Boolean).join(' ')}
                                        onClick={() => setScores(v => ({ ...v, [aspect.key]: step.value }))}
                                    >
                                        {/* Short at the centre, tall at the ends — the shape of the
                                            scale reads before any of the labels do. */}
                                        <span
                                            className={s.stepBar}
                                            style={{ height: 6 + Math.abs(step.offset) * 7 }}
                                        />
                                        {step.label}
                                    </button>
                                )
                            })}
                        </div>
                        {scores[aspect.key] !== null && (
                            <button
                                type='button'
                                className={s.cleared}
                                onClick={() => setScores(v => ({ ...v, [aspect.key]: null }))}
                            >
                                Clear
                            </button>
                        )}
                    </div>
                ))}

                <div className={s.field} style={{ marginTop: 22 }}>
                    <span className={s.fieldLabel}>Anything else</span>
                    <span className={s.fieldHint}>Optional. Whatever the three scales could not carry.</span>
                    <textarea
                        className={s.textarea}
                        value={comment}
                        onChange={e => setComment(e.target.value)}
                        placeholder='Optional'
                    />
                </div>

                <div className={s.actions}>
                    <button
                        type='button'
                        className={s.save}
                        disabled={state === 'saving'}
                        onClick={() => save(`/api/operations/${operationId}/aar`, {
                            feedback: { ...scores, comment },
                        })}
                    >
                        {state === 'saving' ? 'Saving…' : 'Save feedback'}
                    </button>
                    <SaveState state={state} />
                </div>
            </div>
        </section>
    )
}

/* ── One write-up ───────────────────────────────────────────────────────── */

function AarCard({ heading, note, operationId, initial, userId, onSaved }: {
    heading: string
    note?: string
    operationId: string
    initial: Aar
    /** Whose report this is. Omitted means your own. */
    userId?: string
    onSaved?: () => void
}) {
    const [value, setValue] = useState(initial)
    const { state, save } = useSave()

    return (
        <section className={s.card}>
            <div className={s.cardHead}>
                <h2 className={s.cardTitle}>{heading}</h2>
                {note && <span className={s.cardNote}>{note}</span>}
            </div>
            <div className={s.cardBody}>
                {AAR_FIELDS.map(field => (
                    <div key={field.key} className={s.field}>
                        <span className={s.fieldLabel}>{field.label}</span>
                        <span className={s.fieldHint}>{field.hint}</span>
                        <textarea
                            className={s.textarea}
                            value={value[field.key]}
                            onChange={e => setValue(v => ({ ...v, [field.key]: e.target.value }))}
                        />
                    </div>
                ))}
                <div className={s.actions}>
                    <button
                        type='button'
                        className={s.save}
                        disabled={state === 'saving'}
                        onClick={() => save(
                            `/api/operations/${operationId}/aar`,
                            { aar: { ...value, ...(userId ? { userId } : {}) } },
                        ).then(ok => { if (ok) onSaved?.() })}
                    >
                        {state === 'saving' ? 'Saving…' : 'Save report'}
                    </button>
                    <SaveState state={state} />
                </div>
            </div>
        </section>
    )
}

/* ── A section's roll call ──────────────────────────────────────────────── */

function SectionCard({ operationId, section, onSaved }: {
    operationId: string
    section: Section
    onSaved: () => void
}) {
    const [statuses, setStatuses] = useState<Record<string, string>>(() =>
        Object.fromEntries(section.members.map(m => [
            m.userId,
            // Default to what the member said they would do. A roll call where
            // everybody starts blank is one nobody finishes. Somebody who gave
            // no answer is left for the 1IC to decide — "Confirm" used to stand
            // in for that and has been discontinued.
            m.attendanceType ?? (m.rsvp === 'attending' ? 'ATTENDED' : m.rsvp === 'not_attending' ? 'NOT ATTENDING' : ''),
        ])),
    )
    const [openFor, setOpenFor] = useState<string | null>(null)
    // Late joiners picked in this sitting, shown until the save of them lands.
    const [added, setAdded] = useState<{ userId: string; name: string }[]>([])
    const [menuOpen, setMenuOpen] = useState(false)
    const [searching, setSearching] = useState(false)
    const { state, save } = useSave()

    const rows: SectionMember[] = [
        ...section.members,
        ...added
            .filter(a => !section.members.some(m => m.userId === a.userId))
            .map(a => ({
                userId: a.userId, name: a.name, role: 'Late joiner', rsvp: null,
                confirmed: false, attendanceType: null, late: true, aar: null,
            })),
    ]
    const undecided = rows.filter(m => !statuses[m.userId]).length

    return (
        <section className={s.card}>
            <div className={s.cardHead}>
                <h2 className={s.cardTitle}>{section.title}</h2>
                <span className={s.cardNote}>{section.members.length} on the roster</span>
                <div className={s.menuWrap}>
                    <button
                        type='button'
                        className={s.menuBtn}
                        aria-label={`More for ${section.title}`}
                        aria-expanded={menuOpen}
                        onClick={() => setMenuOpen(v => !v)}
                    >
                        ⋯
                    </button>
                    {menuOpen && (
                        <div className={s.menu} role='menu'>
                            <button
                                type='button'
                                role='menuitem'
                                className={s.menuItem}
                                onClick={() => { setMenuOpen(false); setSearching(true) }}
                            >
                                Add a late joiner
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {searching && (
                <LateJoinerSearch
                    operationId={operationId}
                    exclude={rows.map(m => m.userId)}
                    onPick={picked => {
                        setAdded(v => [...v, picked])
                        // They are being added because they turned up.
                        setStatuses(v => ({ ...v, [picked.userId]: 'ATTENDED' }))
                        // Recorded straight away, not held until the section's roll
                        // call is submitted: a late joiner who vanished because the
                        // 1IC moved on before submitting read as a lost entry. Only
                        // their own status goes up; the rest of the section is
                        // untouched until Submit.
                        save(
                            `/api/operations/${operationId}/aar/attendance`,
                            { sectionTitle: section.title, statuses: { [picked.userId]: 'ATTENDED' }, lateJoiners: [picked.userId] },
                            'POST',
                        ).then(ok => {
                            if (!ok) return
                            setAdded(v => v.filter(x => x.userId !== picked.userId))
                            onSaved()
                        })
                    }}
                    onClose={() => setSearching(false)}
                />
            )}

            {rows.map(member => (
                <div key={member.userId}>
                    <div className={s.row}>
                        <div className={s.rowName}>
                            <span className={s.name}>{member.name}</span>
                            <span className={s.role}>{member.role}</span>
                        </div>

                        <span className={s.rsvp}>
                            {member.late ? 'Not on the roster'
                                : member.rsvp === 'attending' ? 'Said yes'
                                    : member.rsvp === 'not_attending' ? 'Said no'
                                        : 'No answer'}
                        </span>

                        <label>
                            <span className='sr-only'>Attendance for {member.name}</span>
                            <select
                                className={s.select}
                                value={statuses[member.userId] ?? ''}
                                onChange={e => setStatuses(v => ({ ...v, [member.userId]: e.target.value }))}
                            >
                                {!statuses[member.userId] && <option value=''>Choose…</option>}
                                {statusOptions(member.attendanceType).map(opt => (
                                    <option key={opt.value} value={opt.value}>
                                        {opt.selectable ? opt.label : `${opt.label} (discontinued)`}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {/* Somebody added a moment ago has no record to hang a
                            write-up on until the roll call is submitted. */}
                        {added.some(a => a.userId === member.userId) ? (
                            <button
                                type='button'
                                className={s.writeup}
                                onClick={() => {
                                    setAdded(v => v.filter(a => a.userId !== member.userId))
                                    setStatuses(v => {
                                        const next = { ...v }
                                        delete next[member.userId]
                                        return next
                                    })
                                }}
                            >
                                Remove
                            </button>
                        ) : (
                            <button
                                type='button'
                                className={[
                                    s.writeup,
                                    openFor === member.userId ? s.writeupOn : '',
                                    member.aar ? s.hasAar : '',
                                ].filter(Boolean).join(' ')}
                                onClick={() => setOpenFor(v => v === member.userId ? null : member.userId)}
                            >
                                AAR
                            </button>
                        )}
                    </div>

                    {openFor === member.userId && (
                        <div className={s.memberAar}>
                            {member.aar?.writtenByName && (
                                <p className={s.byline}>Written by {member.aar.writtenByName}</p>
                            )}
                            <AarCard
                                heading={`${member.name}'s report`}
                                operationId={operationId}
                                userId={member.userId}
                                initial={member.aar ?? EMPTY_AAR}
                                onSaved={onSaved}
                            />
                        </div>
                    )}
                </div>
            ))}

            <div className={s.cardBody}>
                <div className={s.actions} style={{ marginTop: 0 }}>
                    <button
                        type='button'
                        className={s.save}
                        disabled={state === 'saving'}
                        onClick={() => save(
                            `/api/operations/${operationId}/aar/attendance`,
                            { sectionTitle: section.title, statuses, lateJoiners: added.map(a => a.userId) },
                            'POST',
                        ).then(ok => {
                            if (!ok) return
                            // They come back from the server as members now.
                            setAdded([])
                            onSaved()
                        })}
                    >
                        {state === 'saving' ? 'Submitting…' : 'Submit roll call'}
                    </button>
                    <SaveState state={state} />
                    <span className={s.state} style={{ marginLeft: 'auto' }}>
                        {countPresent(statuses)} of {rows.length} present
                        {undecided > 0 && ` · ${undecided} still to decide`}
                    </span>
                </div>
            </div>
        </section>
    )
}

/**
 * What a member's dropdown offers: the five live statuses, plus the one already
 * on their record when it is a discontinued one — so a past operation still
 * shows what was recorded instead of silently reading as something else.
 */
function statusOptions(saved: string | null): AttendanceStatus[] {
    const kept = attendanceStatus(saved ?? undefined)
    return kept && !kept.selectable ? [...SELECTABLE_STATUSES, kept] : SELECTABLE_STATUSES
}

/**
 * Finding somebody who turned up without being on the roster.
 *
 * A search rather than a list: the people it is for are, by definition, not in
 * the section, so there is no short list to offer.
 */
function LateJoinerSearch({ operationId, exclude, onPick, onClose }: {
    operationId: string
    exclude: string[]
    onPick: (member: { userId: string; name: string }) => void
    onClose: () => void
}) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<{ userId: string; name: string }[] | null>(null)

    useEffect(() => {
        const term = query.trim()
        if (term.length < 2) return
        const timer = setTimeout(() => {
            fetch(`/api/operations/${operationId}/aar/members?q=${encodeURIComponent(term)}`)
                .then(res => res.ok ? res.json() : { members: [] })
                .then(d => setResults(d.members ?? []))
                .catch(() => setResults([]))
        }, 250)
        return () => clearTimeout(timer)
    }, [query, operationId])

    const shown = query.trim().length < 2 ? null : results?.filter(r => !exclude.includes(r.userId)) ?? null

    return (
        <div className={s.lateSearch}>
            <div className={s.lateSearchRow}>
                <input
                    autoFocus
                    className={s.lateInput}
                    placeholder='Search for a member by name'
                    aria-label='Search for a member to add'
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                />
                <button type='button' className={s.writeup} onClick={onClose}>Done</button>
            </div>
            {shown && (
                shown.length === 0
                    ? <p className={s.lateEmpty}>Nobody by that name who is not already on this operation.</p>
                    : shown.map(r => (
                        <button key={r.userId} type='button' className={s.lateResult} onClick={() => onPick(r)}>
                            {r.name}
                        </button>
                    ))
            )}
        </div>
    )
}

function countPresent(statuses: Record<string, string>): number {
    return Object.values(statuses).filter(v => attendanceStatus(v)?.present).length
}

/* ── Saving ─────────────────────────────────────────────────────────────── */

type SaveStateValue = 'idle' | 'saving' | 'saved' | 'failed'

/**
 * One save, per card.
 *
 * Deliberately not a page-level form. A member who fills in their feedback and
 * closes the tab has saved their feedback — nothing here makes them finish the
 * whole screen to keep any part of it.
 */
function useSave() {
    const [state, setState] = useState<SaveStateValue>('idle')

    const save = useCallback(async (url: string, body: unknown, method: 'PUT' | 'POST' = 'PUT') => {
        setState('saving')
        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            if (!res.ok) throw new Error(String(res.status))
            setState('saved')
            return true
        } catch {
            setState('failed')
            return false
        }
    }, [])

    return { state, save }
}

function SaveState({ state }: { state: SaveStateValue }) {
    if (state === 'saved') return <span className={`${s.state} ${s.stateOk}`}>Saved</span>
    if (state === 'failed') return <span className={`${s.state} ${s.stateBad}`}>Not saved — try again</span>
    return null
}
