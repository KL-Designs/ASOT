import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import PERMISSIONS from '@/lib/permissions'

export default async function Layout({ children }: { children: React.ReactNode }) {
    try {
        const me = await client.fetchMe()
        if (!client.hasRoles(me, PERMISSIONS.pages.operationsEdit)) redirect('/operations')
    } catch {
        redirect('/operations')
    }
    return <div className='h-full'>{children}</div>
}
