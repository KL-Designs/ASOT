'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Add, Delete, ExpandMore, ExpandLess } from '@mui/icons-material'

const RED = '#db001d'
const TEXT_PRIMARY = 'rgba(237,237,237,0.88)'
const DARK_BG = 'rgba(255,255,255,0.09)'
const BORDER = 'rgba(255,255,255,0.08)'

function uid() {
    return (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2) + Date.now().toString(36)
}

type TSessionGuide = {
    session: {
        _id: string
        sessionNumber: number
        weekNumber: number
        title: string
    }
    guide: {
        overview: string
        equipment: TrainingGuideEquipmentItem[]
        trainingAreaDescription: string
        teachingPoints: TrainingGuideTeachingPoint[]
    } | null
}

function AccentHeader({ label }: { label: string }) {
    return (
        <div style={{ background: RED, color: '#fff', padding: '5px 14px', fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', fontFamily: "'Oswald', Arial, sans-serif" }}>
            {label}
        </div>
    )
}

function AutoTextarea({ value, onChange, placeholder, minRows = 2 }: {
    value: string; onChange: (v: string) => void; placeholder?: string; minRows?: number
}) {
    const ref = useRef<HTMLTextAreaElement>(null)
    useEffect(() => {
        if (!ref.current) return
        ref.current.style.height = '0'
        ref.current.style.height = ref.current.scrollHeight + 'px'
    }, [value])
    return (
        <textarea ref={ref} value={value} placeholder={placeholder} rows={minRows}
            onChange={e => onChange(e.target.value)}
            style={{ background: 'transparent', border: 'none', resize: 'none', font: 'inherit', color: TEXT_PRIMARY, width: '100%', outline: 'none', padding: 0, margin: 0, overflow: 'hidden', lineHeight: 1.6, display: 'block', fontSize: '0.88rem', fontFamily: 'Arial, sans-serif' }} />
    )
}

interface Props {
    courseInstanceId: string
    sessionId: string
}

export default function CatchUpPlanSection({ courseInstanceId, sessionId }: Props) {
    const [plan, setPlan] = useState<CatchUpPlan | null>(null)
    const [sessionGuides, setSessionGuides] = useState<TSessionGuide[]>([])
    const [loading, setLoading] = useState(true)
    const [saveMsg, setSaveMsg] = useState('')
    const [expandedSessions, setExpandedSessions] = useState<Record<number, boolean>>({})

    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
    const planRef = useRef<CatchUpPlan | null>(null)

    useEffect(() => { planRef.current = plan }, [plan])

    const scheduleSave = useCallback((next: CatchUpPlan) => {
        if (saveTimer.current) clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(async () => {
            try {
                const res = await fetch(`/api/j3/course-instances/${courseInstanceId}/sessions/${sessionId}/catchup-plan`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        overview: next.overview,
                        selectedTeachingPoints: next.selectedTeachingPoints,
                        selectedEquipment: next.selectedEquipment,
                        trainingAreaSourceSessionNumber: next.trainingAreaSourceSessionNumber,
                        trainingAreaText: next.trainingAreaText,
                        notes: next.notes,
                    }),
                })
                if (res.ok) setSaveMsg(`Saved · ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)
            } catch { /* ignore */ }
        }, 600)
    }, [courseInstanceId, sessionId])

    function update(patch: Partial<CatchUpPlan>) {
        setPlan(prev => {
            if (!prev) return prev
            const next = { ...prev, ...patch }
            scheduleSave(next)
            return next
        })
    }

    useEffect(() => {
        Promise.all([
            fetch(`/api/j3/course-instances/${courseInstanceId}/sessions/${sessionId}/catchup-plan`).then(r => r.json()),
            fetch(`/api/j3/course-instances/${courseInstanceId}/session-guides`).then(r => r.json()),
        ]).then(([planData, guidesData]) => {
            setPlan(planData.plan ?? null)
            setSessionGuides(guidesData.sessionGuides ?? [])
        }).catch(() => {})
          .finally(() => setLoading(false))
    }, [courseInstanceId, sessionId])

    function addTeachingPoint(sg: TSessionGuide, tp: TrainingGuideTeachingPoint) {
        if (!plan) return
        const already = plan.selectedTeachingPoints.some(
            s => s.sourceSessionNumber === sg.session.sessionNumber && s.teachingPoint.id === tp.id
        )
        if (already) return
        update({
            selectedTeachingPoints: [
                ...plan.selectedTeachingPoints,
                {
                    id: uid(),
                    sourceSessionNumber: sg.session.sessionNumber,
                    sourceSessionTitle: sg.session.title,
                    teachingPoint: tp,
                },
            ],
        })
    }

    function removeTeachingPoint(id: string) {
        if (!plan) return
        update({ selectedTeachingPoints: plan.selectedTeachingPoints.filter(s => s.id !== id) })
    }

    function addEquipment(sg: TSessionGuide, text: string) {
        if (!plan) return
        const already = plan.selectedEquipment.some(
            s => s.sourceSessionNumber === sg.session.sessionNumber && s.text === text
        )
        if (already) return
        update({
            selectedEquipment: [...plan.selectedEquipment, { id: uid(), sourceSessionNumber: sg.session.sessionNumber, text }],
        })
    }

    function removeEquipment(id: string) {
        if (!plan) return
        update({ selectedEquipment: plan.selectedEquipment.filter(s => s.id !== id) })
    }

    function selectTrainingArea(sg: TSessionGuide) {
        if (!plan) return
        if (plan.trainingAreaSourceSessionNumber === sg.session.sessionNumber) {
            update({ trainingAreaSourceSessionNumber: undefined, trainingAreaText: undefined })
        } else {
            update({
                trainingAreaSourceSessionNumber: sg.session.sessionNumber,
                trainingAreaText: sg.guide?.trainingAreaDescription ?? '',
            })
        }
    }

    if (loading) return <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.25)', padding: '12px 0' }}>Loading…</div>
    if (!plan) return <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>Could not load catch-up plan.</div>

    const hasContent = plan.selectedTeachingPoints.length > 0 || plan.selectedEquipment.length > 0 || plan.trainingAreaText

    return (
        <div style={{ fontFamily: "'Oswald', Arial, sans-serif", color: TEXT_PRIMARY, position: 'relative' }}>
            <style>{`@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap');`}</style>

            {/* Save status */}
            {saveMsg && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 0 10px', fontFamily: 'Arial, sans-serif' }}>
                    <span style={{ fontSize: '0.62rem', color: 'rgba(237,237,237,0.3)' }}>{saveMsg}</span>
                </div>
            )}

            {/* Overview */}
            <div style={{ border: `1px solid ${RED}50`, marginBottom: 20 }}>
                <AccentHeader label='Overview &amp; Objective' />
                <div style={{ padding: '14px 16px', background: DARK_BG }}>
                    <AutoTextarea
                        value={plan.overview}
                        onChange={v => update({ overview: v })}
                        placeholder='Provide a brief overview...'
                        minRows={3}
                    />
                </div>
            </div>

            {/* Source session picker */}
            <div style={{ marginBottom: 24 }}>
                <h2 style={{ fontFamily: "'Oswald', Arial, sans-serif", fontSize: '1.0rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: RED, margin: 0, paddingBottom: 8, borderBottom: `2px solid ${RED}`, marginBottom: 12 }}>
                    Add From Sessions
                </h2>
                {sessionGuides.length === 0 ? (
                    <div style={{ fontSize: '0.7rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic', fontFamily: 'Arial, sans-serif' }}>
                        No session guides found. Open sessions 1–4 first to generate their guides.
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {sessionGuides.map(sg => {
                            const expanded = !!expandedSessions[sg.session.sessionNumber]
                            const guide = sg.guide
                            const hasGuideContent = guide && (
                                guide.teachingPoints.length > 0 ||
                                guide.equipment.length > 0 ||
                                guide.trainingAreaDescription
                            )
                            const isTrainingAreaSelected = plan.trainingAreaSourceSessionNumber === sg.session.sessionNumber

                            return (
                                <div key={sg.session._id} style={{ border: `1px solid ${BORDER}`, background: 'rgba(255,255,255,0.015)' }}>
                                    <button
                                        type='button'
                                        onClick={() => setExpandedSessions(prev => ({ ...prev, [sg.session.sessionNumber]: !prev[sg.session.sessionNumber] }))}
                                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                                    >
                                        <span style={{ fontSize: '0.55rem', fontWeight: 800, color: 'rgba(219,0,29,0.7)', fontFamily: 'monospace', letterSpacing: '0.06em', minWidth: 22 }}>S{sg.session.sessionNumber}</span>
                                        <span style={{ flex: 1, fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.75)', fontFamily: "'Oswald', Arial, sans-serif" }}>{sg.session.title}</span>
                                        {!hasGuideContent && <span style={{ fontSize: '0.5rem', color: 'rgba(237,237,237,0.2)', fontFamily: 'Arial, sans-serif', fontStyle: 'italic' }}>No content yet</span>}
                                        {expanded ? <ExpandLess style={{ fontSize: 16, color: 'rgba(237,237,237,0.3)' }} /> : <ExpandMore style={{ fontSize: 16, color: 'rgba(237,237,237,0.3)' }} />}
                                    </button>

                                    {expanded && (
                                        <div style={{ borderTop: `1px solid ${BORDER}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 16, fontFamily: 'Arial, sans-serif' }}>
                                            {!hasGuideContent && (
                                                <div style={{ fontSize: '0.68rem', color: 'rgba(237,237,237,0.2)', fontStyle: 'italic' }}>
                                                    This session's guide has no content yet. Open Session {sg.session.sessionNumber} instructions and add content first.
                                                </div>
                                            )}

                                            {/* Teaching Points */}
                                            {guide && guide.teachingPoints.length > 0 && (
                                                <div>
                                                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>Teaching Points</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        {guide.teachingPoints.map(tp => {
                                                            const isAdded = plan.selectedTeachingPoints.some(
                                                                s => s.sourceSessionNumber === sg.session.sessionNumber && s.teachingPoint.id === tp.id
                                                            )
                                                            return (
                                                                <div key={tp.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', background: isAdded ? 'rgba(80,200,120,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isAdded ? 'rgba(80,200,120,0.15)' : BORDER}` }}>
                                                                    <span style={{ flex: 1, fontSize: '0.72rem', fontWeight: 600, color: isAdded ? 'rgba(237,237,237,0.5)' : 'rgba(237,237,237,0.75)' }}>
                                                                        {tp.title || <em style={{ color: 'rgba(237,237,237,0.25)' }}>Untitled point</em>}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.5rem', color: 'rgba(237,237,237,0.25)', whiteSpace: 'nowrap' }}>
                                                                        {tp.dotPoints.length} point{tp.dotPoints.length !== 1 ? 's' : ''}
                                                                    </span>
                                                                    {isAdded ? (
                                                                        <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(80,200,120,0.6)', padding: '1px 6px', border: '1px solid rgba(80,200,120,0.2)' }}>Added</span>
                                                                    ) : (
                                                                        <button type='button' onClick={() => addTeachingPoint(sg, tp)}
                                                                            style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', border: '1px solid rgba(219,0,29,0.2)', background: 'transparent', padding: '1px 6px', cursor: 'pointer' }}>
                                                                            <Add style={{ fontSize: 10 }} /> Add
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Equipment */}
                                            {guide && guide.equipment.filter(e => e.text.trim()).length > 0 && (
                                                <div>
                                                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>Equipment</div>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                        {guide.equipment.filter(e => e.text.trim()).map(eq => {
                                                            const isAdded = plan.selectedEquipment.some(
                                                                s => s.sourceSessionNumber === sg.session.sessionNumber && s.text === eq.text
                                                            )
                                                            return (
                                                                <div key={eq.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 10px', background: isAdded ? 'rgba(80,200,120,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isAdded ? 'rgba(80,200,120,0.15)' : BORDER}` }}>
                                                                    <span style={{ flex: 1, fontSize: '0.72rem', color: isAdded ? 'rgba(237,237,237,0.5)' : 'rgba(237,237,237,0.75)' }}>{eq.text}</span>
                                                                    {isAdded ? (
                                                                        <span style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(80,200,120,0.6)', padding: '1px 6px', border: '1px solid rgba(80,200,120,0.2)' }}>Added</span>
                                                                    ) : (
                                                                        <button type='button' onClick={() => addEquipment(sg, eq.text)}
                                                                            style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', border: '1px solid rgba(219,0,29,0.2)', background: 'transparent', padding: '1px 6px', cursor: 'pointer' }}>
                                                                            <Add style={{ fontSize: 10 }} /> Add
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Training Area */}
                                            {guide && guide.trainingAreaDescription.trim() && (
                                                <div>
                                                    <div style={{ fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.3)', marginBottom: 8 }}>Training Area / Setup</div>
                                                    <div style={{ padding: '8px 10px', background: isTrainingAreaSelected ? 'rgba(80,200,120,0.05)' : 'rgba(255,255,255,0.02)', border: `1px solid ${isTrainingAreaSelected ? 'rgba(80,200,120,0.15)' : BORDER}`, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                                                        <p style={{ flex: 1, margin: 0, fontSize: '0.72rem', color: isTrainingAreaSelected ? 'rgba(237,237,237,0.5)' : 'rgba(237,237,237,0.7)', fontFamily: 'Arial, sans-serif', lineHeight: 1.5 }}>
                                                            {guide.trainingAreaDescription}
                                                        </p>
                                                        <button type='button' onClick={() => selectTrainingArea(sg)}
                                                            style={{ flexShrink: 0, fontSize: '0.48rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: isTrainingAreaSelected ? 'rgba(80,200,120,0.7)' : 'rgba(219,0,29,0.7)', border: `1px solid ${isTrainingAreaSelected ? 'rgba(80,200,120,0.2)' : 'rgba(219,0,29,0.2)'}`, background: 'transparent', padding: '2px 8px', cursor: 'pointer' }}>
                                                            {isTrainingAreaSelected ? 'Selected' : 'Use This'}
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* Selected content */}
            {hasContent && (
                <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontFamily: "'Oswald', Arial, sans-serif", fontSize: '1.0rem', fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: RED, margin: 0, paddingBottom: 8, borderBottom: `2px solid ${RED}`, marginBottom: 16 }}>
                        Session Content
                    </h2>

                    {/* Equipment */}
                    {plan.selectedEquipment.length > 0 && (
                        <div style={{ border: `1px solid ${RED}50`, marginBottom: 20 }}>
                            <div style={{ padding: '6px 14px', borderBottom: `1px solid ${RED}30` }}>
                                <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED, fontFamily: "'Oswald', Arial, sans-serif" }}>Required Equipment</span>
                            </div>
                            <div style={{ padding: '12px 16px', background: DARK_BG, display: 'flex', flexDirection: 'column', gap: 6, fontFamily: 'Arial, sans-serif' }}>
                                {plan.selectedEquipment.map(eq => (
                                    <div key={eq.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <div style={{ width: 14, height: 14, border: `1.5px solid ${RED}80`, borderRadius: 2, flexShrink: 0 }} />
                                        <span style={{ flex: 1, fontSize: '0.84rem', color: TEXT_PRIMARY }}>{eq.text}</span>
                                        <span style={{ fontSize: '0.45rem', color: 'rgba(237,237,237,0.2)', fontFamily: 'monospace' }}>S{eq.sourceSessionNumber}</span>
                                        <button type='button' onClick={() => removeEquipment(eq.id)}
                                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(219,0,29,0.4)', display: 'flex', alignItems: 'center', padding: '1px' }}>
                                            <Delete style={{ fontSize: 13 }} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Training Area */}
                    {plan.trainingAreaText && (
                        <div style={{ display: 'grid', gridTemplateColumns: plan.selectedEquipment.length > 0 ? '1fr' : '1fr', marginBottom: 20 }}>
                            <div style={{ border: `1px solid ${RED}50` }}>
                                <div style={{ padding: '6px 14px', borderBottom: `1px solid ${RED}30`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED, fontFamily: "'Oswald', Arial, sans-serif" }}>
                                        Training Area / Setup
                                        <span style={{ marginLeft: 8, fontSize: '0.48rem', color: 'rgba(237,237,237,0.25)', fontFamily: 'Arial', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>from Session {plan.trainingAreaSourceSessionNumber}</span>
                                    </span>
                                    <button type='button' onClick={() => update({ trainingAreaSourceSessionNumber: undefined, trainingAreaText: undefined })}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(219,0,29,0.4)', display: 'flex', alignItems: 'center', padding: 0 }}>
                                        <Delete style={{ fontSize: 14 }} />
                                    </button>
                                </div>
                                <div style={{ padding: '12px 16px', background: DARK_BG, fontFamily: 'Arial, sans-serif', fontSize: '0.84rem', lineHeight: 1.55, color: TEXT_PRIMARY }}>
                                    {plan.trainingAreaText}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Teaching Points */}
                    {plan.selectedTeachingPoints.map((sel, idx) => {
                        const tp = sel.teachingPoint
                        return (
                            <div key={sel.id} style={{ border: `1px solid ${RED}30`, marginBottom: 20 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${RED}20`, background: `${RED}10` }}>
                                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: RED, color: '#fff', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Oswald', Arial, sans-serif", fontWeight: 700, fontSize: '0.82rem' }}>{idx + 1}</div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontFamily: "'Oswald', Arial, sans-serif", fontSize: '0.95rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: TEXT_PRIMARY }}>{tp.title || <em style={{ color: 'rgba(237,237,237,0.3)', fontStyle: 'normal' }}>Untitled</em>}</div>
                                        <div style={{ fontSize: '0.48rem', color: 'rgba(237,237,237,0.28)', fontFamily: 'Arial, sans-serif', marginTop: 2 }}>From {sel.sourceSessionTitle} (Session {sel.sourceSessionNumber})</div>
                                    </div>
                                    <button type='button' onClick={() => removeTeachingPoint(sel.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(219,0,29,0.6)', display: 'flex', alignItems: 'center' }}>
                                        <Delete style={{ fontSize: 16 }} />
                                    </button>
                                </div>
                                <div style={{ padding: '14px 16px', background: 'rgba(255,255,255,0.07)', fontFamily: 'Arial, sans-serif', fontSize: '0.86rem', lineHeight: 1.6 }}>
                                    {tp.dotPoints.map(dp => dp.text.trim()).filter(Boolean).map((text, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 5 }}>
                                            <span style={{ color: RED, flexShrink: 0, marginTop: 2, fontSize: '0.7rem' }}>●</span>
                                            <span style={{ color: TEXT_PRIMARY }}>{text}</span>
                                        </div>
                                    ))}
                                    {tp.dotPoints.filter(d => d.text.trim()).length === 0 && (
                                        <span style={{ color: 'rgba(237,237,237,0.25)', fontStyle: 'italic' }}>No dot points.</span>
                                    )}
                                    {tp.vitalPoints.filter(v => v.text.trim()).length > 0 && (
                                        <div style={{ marginTop: 12, padding: '10px 14px', background: `${RED}08`, border: `1px solid ${RED}25`, position: 'relative' }}>
                                            <div style={{ fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: RED, marginBottom: 6, fontFamily: "'Oswald', Arial, sans-serif" }}>⚑ Vital Points</div>
                                            {tp.vitalPoints.filter(v => v.text.trim()).map((vp, i) => (
                                                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, marginBottom: 4, fontSize: '0.84rem' }}>
                                                    <span style={{ color: RED, flexShrink: 0, fontSize: '0.68rem', marginTop: 2 }}>●</span>
                                                    <span style={{ color: TEXT_PRIMARY }}>{vp.text}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Notes */}
            <div style={{ border: `1px solid ${RED}50`, marginBottom: 32 }}>
                <AccentHeader label='Notes / Observations' />
                <div style={{ padding: '14px 16px', background: DARK_BG, fontFamily: 'Arial, sans-serif', fontSize: '0.88rem', lineHeight: 1.6 }}>
                    <AutoTextarea
                        value={plan.notes}
                        onChange={v => update({ notes: v })}
                        placeholder='Add session notes or observations here.'
                        minRows={4}
                    />
                </div>
            </div>
        </div>
    )
}
