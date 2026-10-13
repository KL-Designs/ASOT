'use client'

import { useEffect, useState } from 'react'
import s from './board.module.css'

interface Marker {
    id: string
    candidateName: string
    candidateSection: string | null
    assessorName: string | null
    status: string
    shadow: { status: 'requested' | 'approved' | 'declined' } | null
}

/**
 * "An NCO assessment is running tonight."
 *
 * Shown at the top of the attendance board to the people who need to know:
 * CHQ, J3 leads, the section's staff, and the two people in it. Everybody else
 * gets an empty list back from the route and this renders nothing — who is
 * told is the server's decision, not this component's.
 *
 * It names who is being assessed, who is assessing, and whether the assessor
 * is shadowing the section, because "an assessment is happening" on its own
 * leaves CHQ to go and find out the rest.
 */
export default function AssessmentMarker({ operationId }: { operationId: string }) {
    const [markers, setMarkers] = useState<Marker[]>([])

    useEffect(() => {
        let live = true
        fetch(`/api/nco-assessments?operationId=${operationId}`)
            .then(r => (r.ok ? r.json() : { assessments: [] }))
            .then(d => { if (live) setMarkers(d.assessments ?? []) })
            .catch(() => { })
        return () => { live = false }
    }, [operationId])

    if (!markers.length) return null

    return (
        <>
            {markers.map(m => (
                <div key={m.id} className={s.banner} role='note'>
                    <b>NCO assessment</b>
                    <span>
                        {m.candidateName}{m.candidateSection ? ` (${m.candidateSection})` : ''} is being assessed
                        {m.assessorName ? ` by ${m.assessorName}` : ''}
                        {m.status === 'assigned' ? ', assessor yet to confirm' : ''}.
                        {m.shadow?.status === 'approved' && ` ${m.assessorName ?? 'The assessor'} is shadowing ${m.candidateSection ?? 'the section'}.`}
                        {m.shadow?.status === 'requested' && ' A shadow has been asked for and is waiting on section staff.'}
                    </span>
                </div>
            ))}
        </>
    )
}
