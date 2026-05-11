import type { Metadata } from 'next'

export const metadata: Metadata = {
    title: "Retired Members | Australian Special Operations Taskforce",
    description: "Honouring the retired members who have served with the Australian Special Operations Taskforce.",
}

export default function RetiredLayout({ children }: { children: React.ReactNode }) {
    return <>{children}</>
}
