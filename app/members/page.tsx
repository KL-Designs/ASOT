import { redirect } from 'next/navigation'
import Link from 'next/link'
import { connection } from 'next/server'
import client from '@/lib/discord'
import { fetchORBAT, findOrbatEntry } from '@/lib/orbat'
import MemberList from './MemberList'


export default async function Page() {
    await connection()

    const me = await client.fetchMe().catch(() => null)
    if (!me) redirect('/login')
    if (!client.hasRoles(me, ['J5-Media'])) redirect('/me')

    const [allMembers, orbat] = await Promise.all([client.fetchAllMembers(), fetchORBAT()])
    const lookup = client.buildOrbatLookup(allMembers)

    const sorted = [...allMembers].sort((a, b) => {
        const nameA = a.guild?.nickname || a.globalName || a.username
        const nameB = b.guild?.nickname || b.globalName || b.username
        return nameA.localeCompare(nameB)
    })

    // Pre-compute orbat entries so the client component doesn't need the full orbat/lookup
    const orbatMap: Record<string, { role: string; section: string } | null> = {}
    for (const member of sorted) {
        orbatMap[member.id] = findOrbatEntry(orbat, lookup, member.id)
    }

    return (
        <div className='h-full w-full p-6 md:p-10 flex flex-col gap-6 max-w-[1000px] mx-auto'>

            {/* Header */}
            <div className='flex items-center gap-4'>
                <Link
                    href='/me'
                    style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'rgba(237,237,237,0.35)',
                        textDecoration: 'none',
                    }}
                >
                    ← Back
                </Link>
                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
                <span style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(237,237,237,0.25)' }}>
                    Member Management
                </span>
            </div>

            <MemberList members={sorted} orbatMap={orbatMap} />

        </div>
    )
}
