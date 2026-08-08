export const metadata = {
    title: 'ASOT Recruitment',
    description: 'ASOT live recruitment session',
}

export default function RecruitSessionLayout({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', color: 'rgba(237,237,237,0.85)' }}>
            {children}
        </div>
    )
}
