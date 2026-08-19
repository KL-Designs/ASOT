'use client'

import { useState, useCallback, useEffect } from 'react'
import { Calendar, dateFnsLocalizer, Views, View } from 'react-big-calendar'
import { format, parse, startOfWeek, getDay, addWeeks, startOfDay, addHours, isSameDay } from 'date-fns'
import { enAU } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'
import '@/app/dashboard/unit/calendar/calendar-overrides.css'

// ── Localizer (matches DeptCalendarTab exactly) ───────────────────────────────

const locales = { 'en-AU': enAU }
const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
    getDay,
    locales,
})

// ── Time period config ────────────────────────────────────────────────────────

export const TIME_PERIODS = [
    { label: 'Morning',   startHour: 9,  endHour: 12, color: 'var(--info)' },
    { label: 'Afternoon', startHour: 12, endHour: 17, color: '#8b5cf6' },
    { label: 'Evening',   startHour: 18, endHour: 22, color: 'var(--live)' },
]

type LocalSlot = {
    id: string
    date: Date
    periods: string[]   // e.g. ['Morning', 'Evening']
    j3EventId?: string  // the single J3 calendar event ID for this day
}

type RbcEvent = {
    id: string
    title: string
    start: Date
    end: Date
    allDay?: boolean
    resource: { isSlot?: boolean; slot?: LocalSlot; isExisting?: boolean }
}

export interface BCTSlotSummary {
    id: string
    date: string      // ISO date string
    periods: string[]
    label: string     // human-readable e.g. "Monday 12 May — Morning, Evening"
}

interface Props {
    applicantId: string
    applicantName: string
    recruiterName: string
    onSlotCreated?: (slot: BCTSlotSummary) => void
    onSlotDeleted?: (slotId: string) => void
    readOnly?: boolean
    externalSlots?: BCTSlotSummary[]  // used in read-only (applicant) mode
    isQuiz?: boolean
}

export default function BCTAvailabilityCalendar({
    applicantId, applicantName, recruiterName,
    onSlotCreated, onSlotDeleted, readOnly = false, externalSlots, isQuiz = false,
}: Props) {
    const [localSlots, setLocalSlots] = useState<LocalSlot[]>([])
    const [existingEvents, setExistingEvents] = useState<RbcEvent[]>([])
    const [currentView, setCurrentView] = useState<View>(Views.MONTH)
    const [currentDate, setCurrentDate] = useState(new Date())

    // Slot picker state
    const [pickerOpen, setPickerOpen] = useState(false)
    const [pickerDate, setPickerDate] = useState<Date | null>(null)
    const [pickerSelections, setPickerSelections] = useState<string[]>([])
    const [repeatWeekly, setRepeatWeekly] = useState(false)
    const [repeatWeeks, setRepeatWeeks] = useState(2)
    const [saving, setSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [editingExistingSlotId, setEditingExistingSlotId] = useState<string | null>(null)

    // Fetch background J3 events (non-BCT, for context)
    const fetchExisting = useCallback(async () => {
        if (readOnly) return
        try {
            const res = await fetch('/api/admin/calendar?department=j3')
            const data = await res.json()
            if (!res.ok) return
            const mapped: RbcEvent[] = (data.events ?? [])
                .filter((e: { isBCTAvailability?: boolean }) => !e.isBCTAvailability)
                .map((e: { _id: string; title: string; start: string; end: string }) => ({
                    id: e._id,
                    title: e.title,
                    start: new Date(e.start),
                    end: new Date(e.end),
                    resource: { isExisting: true },
                }))
            setExistingEvents(mapped)
        } catch { /* silently fail */ }
    }, [readOnly])

    useEffect(() => { fetchExisting() }, [fetchExisting])

    // Build RBC events from localSlots (one event per slot, shown as all-day for clarity)
    const slotEvents: RbcEvent[] = readOnly && externalSlots
        ? externalSlots.map(s => {
            const d = new Date(s.date)
            return {
                id: s.id,
                title: `${s.periods.join(' · ')}`,
                start: d,
                end: new Date(d.getTime() + 24 * 60 * 60 * 1000 - 1),
                allDay: true,
                resource: { isSlot: true },
            }
        })
        : localSlots.map(slot => ({
            id: slot.id,
            title: slot.periods.join(' · '),
            start: startOfDay(slot.date),
            end: new Date(startOfDay(slot.date).getTime() + 24 * 60 * 60 * 1000 - 1),
            allDay: true,
            resource: { isSlot: true, slot },
        }))

    const allEvents: RbcEvent[] = [...existingEvents, ...slotEvents]

    function openPicker(date: Date) {
        if (readOnly) return
        setPickerDate(date)
        const existing = localSlots.find(s => isSameDay(s.date, date))
        setPickerSelections(existing?.periods ?? [])
        setEditingExistingSlotId(existing?.id ?? null)
        setRepeatWeekly(false)
        setRepeatWeeks(2)
        setPickerOpen(true)
    }

    async function deleteSlot() {
        if (!pickerDate) return
        const existing = localSlots.find(s => isSameDay(s.date, pickerDate))
        if (!existing) return
        setDeleting(true)
        try {
            if (existing.j3EventId) {
                await fetch(`/api/admin/calendar/${existing.j3EventId}`, { method: 'DELETE' })
            }
            setLocalSlots(prev => prev.filter(s => s.id !== existing.id))
            onSlotDeleted?.(existing.id)
            setPickerOpen(false)
        } finally {
            setDeleting(false)
        }
    }

    function togglePeriod(label: string) {
        setPickerSelections(prev =>
            prev.includes(label) ? prev.filter(p => p !== label) : [...prev, label]
        )
    }

    async function saveSlots() {
        if (!pickerDate || pickerSelections.length === 0) return
        setSaving(true)
        try {
            const weeks = repeatWeekly ? repeatWeeks : 1

            for (let w = 0; w < weeks; w++) {
                const baseDate = addWeeks(pickerDate, w)
                const dayBase = startOfDay(baseDate)
                const dayLabel = format(dayBase, 'EEEE d MMMM yyyy')

                const periodDetails = pickerSelections.map(p => {
                    const tp = TIME_PERIODS.find(t => t.label === p)!
                    return `${p} (${tp.startHour}:00–${tp.endHour}:00)`
                }).join(', ')

                const eventStart = addHours(dayBase, TIME_PERIODS.find(t => t.label === pickerSelections[0])?.startHour ?? 9)
                const lastPeriod = pickerSelections[pickerSelections.length - 1]
                const eventEnd = addHours(dayBase, TIME_PERIODS.find(t => t.label === lastPeriod)?.endHour ?? 22)

                const description = `Date: ${dayLabel}\nAvailability: ${periodDetails}\n\nRecruit: ${applicantName}\nRecruited by: ${recruiterName}`

                // Check if a local slot already exists for this date (update vs create)
                const availLabel = isQuiz ? 'BCT1 Quiz Availability' : 'BCT Availability'
                const existingSlot = localSlots.find(s => isSameDay(s.date, dayBase))

                let j3Id: string
                if (existingSlot?.j3EventId) {
                    // PATCH the existing J3 calendar event
                    await fetch(`/api/admin/calendar/${existingSlot.j3EventId}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: `${applicantName} — ${availLabel}`,
                            description,
                            start: eventStart.toISOString(),
                            end: eventEnd.toISOString(),
                            timePeriod: pickerSelections.join(', '),
                        }),
                    })
                    j3Id = existingSlot.j3EventId
                } else {
                    // POST a new J3 event (one per day, all periods combined)
                    const res = await fetch('/api/admin/calendar', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            title: `${applicantName} — ${availLabel}`,
                            description,
                            start: eventStart.toISOString(),
                            end: eventEnd.toISOString(),
                            department: 'j3',
                            isBCTAvailability: true,
                            ...(isQuiz ? { isQuizAvailability: true } : {}),
                            applicantId,
                            applicantName,
                            timePeriod: pickerSelections.join(', '),
                        }),
                    })
                    const data = await res.json()
                    j3Id = data.id ?? String(Date.now())
                }

                const slotId = existingSlot?.id ?? `slot-${dayBase.getTime()}-${w}`
                const updatedSlot: LocalSlot = {
                    id: slotId, date: dayBase, periods: [...pickerSelections], j3EventId: j3Id,
                }

                setLocalSlots(prev => {
                    const idx = prev.findIndex(s => isSameDay(s.date, dayBase))
                    if (idx >= 0) return prev.map((s, i) => i === idx ? updatedSlot : s)
                    return [...prev, updatedSlot]
                })

                onSlotCreated?.({
                    id: slotId,
                    date: dayBase.toISOString(),
                    periods: [...pickerSelections],
                    label: `${format(dayBase, 'EEEE d MMMM')} — ${pickerSelections.join(', ')}`,
                })
            }

            setPickerOpen(false)
        } finally {
            setSaving(false)
        }
    }

    const dayLabel = pickerDate ? format(pickerDate, 'EEEE d MMMM yyyy') : ''

    // Summary of all selected slots for display below calendar
    const slotSummary = readOnly && externalSlots
        ? externalSlots
        : localSlots.map(s => ({
            id: s.id,
            date: s.date.toISOString(),
            periods: s.periods,
            label: `${format(s.date, 'EEEE d MMMM')} — ${s.periods.join(', ')}`,
        }))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)' }}>
                    {readOnly
                        ? (isQuiz ? 'BCT1 Quiz Availability — Selected Times' : 'BCT Availability — Selected Times')
                        : (isQuiz ? 'J3 Training Calendar — BCT1 Quiz Availability' : 'J3 Training Calendar — BCT Availability')
                    }
                </div>
                {!readOnly && (
                    <div style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)' }}>Click a day to record availability</div>
                )}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                {TIME_PERIODS.map(tp => (
                    <div key={tp.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.65rem', color: 'rgba(237,237,237,0.4)' }}>
                        <div style={{ width: 10, height: 10, background: `${tp.color}30`, border: `1px dashed ${tp.color}80`, borderRadius: 2 }} />
                        {tp.label}
                    </div>
                ))}
                {!readOnly && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.65rem', color: 'rgba(237,237,237,0.25)' }}>
                        <div style={{ width: 10, height: 10, background: 'rgba(219,0,29,0.25)', borderRadius: 2 }} />
                        Existing J3 event
                    </div>
                )}
            </div>

            {/* Calendar */}
            <div style={{ minHeight: 460 }}>
                <Calendar
                    localizer={localizer}
                    events={allEvents}
                    view={currentView}
                    onView={setCurrentView}
                    date={currentDate}
                    onNavigate={setCurrentDate}
                    views={[Views.MONTH, Views.WEEK, Views.AGENDA]}
                    selectable={!readOnly}
                    onSelectSlot={readOnly ? undefined : ({ start }: { start: Date }) => openPicker(start)}
                    onSelectEvent={(ev: RbcEvent) => {
                        if (!readOnly && ev.resource?.slot) openPicker(ev.resource.slot.date)
                    }}
                    eventPropGetter={(event: RbcEvent) => {
                        if (event.resource?.isSlot) {
                            // BCT availability — teal-green dashed, transparent fill, clearly visible
                            return {
                                style: {
                                    background: 'rgba(16,185,129,0.14)',
                                    border: '1.5px dashed rgba(16,185,129,0.65)',
                                    color: 'var(--live)',
                                    borderRadius: 2,
                                    fontSize: '0.68rem',
                                    fontWeight: 600,
                                },
                            }
                        }
                        // Existing J3 events — very faint
                        return {
                            style: {
                                background: 'rgba(219,0,29,0.2)',
                                border: 'none',
                                color: 'rgba(237,237,237,0.6)',
                                borderRadius: 2,
                                opacity: 0.55,
                                fontSize: '0.68rem',
                            },
                        }
                    }}
                    style={{ height: 520 }}
                    popup
                />
            </div>

            {/* Selected slots summary */}
            {slotSummary.length > 0 && (
                <div style={{ padding: '10px 13px', background: 'rgba(16,185,129,0.04)', border: '1px solid rgba(16,185,129,0.2)', borderLeft: '2px solid rgba(16,185,129,0.5)', display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ fontSize: '0.58rem', fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(16,185,129,0.65)', marginBottom: 3 }}>
                        Selected Availability
                    </div>
                    {slotSummary.map(s => (
                        <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.73rem', color: 'rgba(237,237,237,0.65)' }}>
                            <span style={{ color: 'var(--live)', flexShrink: 0 }}>▸</span>
                            {s.label}
                        </div>
                    ))}
                </div>
            )}
            {!readOnly && slotSummary.length === 0 && (
                <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.25)', fontStyle: 'italic', textAlign: 'center', padding: '8px 0' }}>
                    No availability selected yet — click a day on the calendar above.
                </div>
            )}

            {/* Slot picker modal */}
            {pickerOpen && pickerDate && !readOnly && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 1500, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    onClick={e => { if (e.target === e.currentTarget) setPickerOpen(false) }}
                >
                    <div style={{ width: '100%', maxWidth: 420, background: '#0f0f10', border: '1px solid rgba(16,185,129,0.25)', borderTop: '2px solid rgba(16,185,129,0.6)', padding: '24px 24px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        <div>
                            <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(16,185,129,0.55)', fontFamily: 'monospace', marginBottom: 6 }}>
                                {isQuiz ? '// BCT1 QUIZ AVAILABILITY' : '// BCT AVAILABILITY'}
                            </div>
                            <div style={{ fontSize: '0.92rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.9)' }}>
                                {dayLabel}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.35)', marginTop: 4 }}>
                                {editingExistingSlotId
                                    ? `Edit or delete this availability entry. Use Delete to remove it entirely.`
                                    : `Select all time periods when ${applicantName || 'the applicant'} is available.`
                                }
                            </div>
                        </div>

                        {/* Time period selectors */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {TIME_PERIODS.map(tp => {
                                const selected = pickerSelections.includes(tp.label)
                                return (
                                    <button key={tp.label} type='button' onClick={() => togglePeriod(tp.label)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer',
                                            background: selected ? `${tp.color}18` : 'rgba(255,255,255,0.02)',
                                            border: selected ? `2px solid ${tp.color}90` : '1px solid rgba(255,255,255,0.09)',
                                            color: selected ? tp.color : 'rgba(237,237,237,0.55)',
                                            transition: 'all 0.1s',
                                        }}
                                    >
                                        <div style={{ width: 18, height: 18, border: `2px solid ${selected ? tp.color : 'rgba(255,255,255,0.2)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'border-color 0.1s' }}>
                                            {selected && <div style={{ width: 9, height: 9, background: tp.color, borderRadius: 1 }} />}
                                        </div>
                                        <div style={{ textAlign: 'left' }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>{tp.label}</div>
                                            <div style={{ fontSize: '0.63rem', opacity: 0.55, marginTop: 1 }}>{tp.startHour}:00 – {tp.endHour}:00</div>
                                        </div>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Repeat weekly */}
                        {pickerSelections.length > 0 && (
                            <div style={{ padding: '11px 13px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                    <input type='checkbox' checked={repeatWeekly} onChange={e => setRepeatWeekly(e.target.checked)}
                                        style={{ cursor: 'pointer', accentColor: 'var(--live)', width: 14, height: 14 }}
                                    />
                                    <span style={{ fontSize: '0.78rem', color: repeatWeekly ? 'var(--live)' : 'rgba(237,237,237,0.55)', fontWeight: 600 }}>
                                        Repeat weekly
                                    </span>
                                </label>
                                {repeatWeekly && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingLeft: 22 }}>
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>For</span>
                                        <div style={{ display: 'flex', gap: 5 }}>
                                            {[1, 2, 3, 4].map(n => (
                                                <button key={n} type='button' onClick={() => setRepeatWeeks(n)}
                                                    style={{ width: 30, height: 26, fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', background: repeatWeeks === n ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.04)', border: repeatWeeks === n ? '1px solid rgba(16,185,129,0.4)' : '1px solid rgba(255,255,255,0.1)', color: repeatWeeks === n ? 'var(--live)' : 'rgba(237,237,237,0.5)' }}
                                                >{n}</button>
                                            ))}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', color: 'rgba(237,237,237,0.4)' }}>week{repeatWeeks > 1 ? 's' : ''}</span>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Summary line */}
                        {pickerSelections.length > 0 && (
                            <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.35)', lineHeight: 1.6 }}>
                                {repeatWeekly
                                    ? `Adding ${pickerSelections.join(', ')} for ${repeatWeeks} week${repeatWeeks > 1 ? 's' : ''} from ${format(pickerDate, 'EEEE d MMMM')}.`
                                    : `Adding ${pickerSelections.join(', ')} for ${format(pickerDate, 'EEEE d MMMM yyyy')}.`
                                }
                            </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
                            {editingExistingSlotId && (
                                <button type='button' onClick={deleteSlot} disabled={deleting || saving}
                                    style={{ padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: 'rgba(219,0,29,0.1)', border: '1px solid rgba(219,0,29,0.4)', color: 'rgba(219,0,29,0.8)', cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.6 : 1, marginRight: 'auto' }}
                                >{deleting ? 'DELETING…' : 'DELETE'}</button>
                            )}
                            <button type='button' onClick={() => setPickerOpen(false)}
                                style={{ padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(237,237,237,0.4)', cursor: 'pointer' }}
                            >CANCEL</button>
                            <button type='button' onClick={saveSlots}
                                disabled={pickerSelections.length === 0 || saving}
                                style={{ padding: '8px 18px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', background: pickerSelections.length === 0 ? 'rgba(16,185,129,0.08)' : 'rgba(16,185,129,0.15)', border: pickerSelections.length === 0 ? '1px solid rgba(16,185,129,0.15)' : '1px solid rgba(16,185,129,0.5)', color: pickerSelections.length === 0 ? 'rgba(237,237,237,0.2)' : 'var(--live)', cursor: pickerSelections.length === 0 ? 'default' : 'pointer', opacity: saving ? 0.6 : 1 }}
                            >{saving ? 'SAVING…' : (editingExistingSlotId ? 'UPDATE' : 'CONFIRM')}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
