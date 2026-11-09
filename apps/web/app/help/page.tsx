import type { Metadata } from 'next'
import HelpWikiPage from '@/components/help/HelpWikiPage'

export const metadata: Metadata = {
    title: 'Help & guides | Australian Special Operations Taskforce',
    description: 'How to use the ASOT website: joining, operations, your MILPAC, training, tickets and more.',
}

/** `/help` — the help wiki's front page. Public; members and staff see more guides. */
export default function Page() {
    return <HelpWikiPage />
}
