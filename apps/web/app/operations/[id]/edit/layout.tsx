import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import { can } from '@/lib/operations/permissions'
import { privateCopyAccess } from '@/lib/training/orders-assessment-db'

/**
 * The gate on the orders editor.
 *
 * `orders.view` rather than `orders.write`: opening the editor and changing
 * what is in it are different powers, and a department lead who reads orders
 * before they publish needs the first without the second. Everything inside
 * that writes re-checks its own capability server-side — this only decides
 * whether the shell renders at all.
 */
export default async function Layout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
    const { id } = await params
    try {
        const me = await client.fetchMe()
        // Row 373: a trainee's private assessment copy opens for whoever it is shared with, and nobody else.
        const copy = await privateCopyAccess(me, id)
        if (copy !== null ? copy === 'none' : !(await can(me, 'orders.view'))) redirect('/operations')
    } catch {
        redirect('/operations')
    }
    return <div className='h-full'>{children}</div>
}
