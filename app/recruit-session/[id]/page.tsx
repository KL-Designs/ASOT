import { notFound } from 'next/navigation'
import Db from '@/lib/mongo'
import ApplicantSessionPage from './ApplicantSessionPage'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params

    const session = await Db.recruitSessions.findOne(
        { sessionId: id },
        { projection: { step: 1, raisedHand: 1, recruiterName: 1, expiresAt: 1 } }
    )

    if (!session) return notFound()
    if (session.expiresAt && new Date() > session.expiresAt) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 16, padding: '0 24px' }}>
                <div style={{ fontSize: '0.52rem', fontWeight: 700, letterSpacing: '0.22em', color: 'rgba(219,0,29,0.6)', fontFamily: 'monospace' }}>// SESSION EXPIRED</div>
                <div style={{ fontSize: '1.2rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.8)' }}>This session has ended</div>
                <div style={{ fontSize: '0.82rem', color: 'rgba(237,237,237,0.4)', textAlign: 'center', maxWidth: 400 }}>
                    Your recruitment session is no longer active. If this is unexpected, contact your recruiter.
                </div>
            </div>
        )
    }

    return (
        <ApplicantSessionPage
            sessionId={id}
            initialStep={session.step}
            initialRaisedHand={session.raisedHand}
            recruiterName={session.recruiterName}
        />
    )
}
