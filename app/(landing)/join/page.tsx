import { Metadata } from 'next'
import Container from '@/components/container'
import JoinForm from './JoinForm'

export const metadata: Metadata = {
    title: 'Join ASOT | Australian Special Operations Taskforce',
    description: 'Apply to join the Australian Special Operations Taskforce milsim community.',
}

export default function JoinPage() {
    return (
        <Container
            title='JOIN ASOT'
            subtitle='Fill out the form below to apply for membership. Our J1 Recruitment team will review your application and contact you via Discord.'
            sx={{ bannerHeight: 'sm', maxWidth: 'max-w-sm' }}
        >
            <div
                className='flex flex-col gap-6 p-6'
                style={{
                    border: '1px solid rgba(219,0,29,0.15)',
                    borderTop: '2px solid var(--red)',
                    background: 'rgba(255,255,255,0.02)',
                }}
            >
                <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(219,0,29,0.7)', marginBottom: 4 }}>
                        J1 — Recruitment
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1rem', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                        Membership Application
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'rgba(237,237,237,0.45)', marginTop: 6 }}>
                        All fields are required. You must be 17+ to join, or be vouched for by a current member.
                    </div>
                </div>

                <JoinForm />
            </div>
        </Container>
    )
}
