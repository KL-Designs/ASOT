import { redirect } from 'next/navigation'
import client from '@/lib/discord'
import { can } from '@/lib/operations/permissions'

/**
 * The gate on the orders editor.
 *
 * `orders.view` rather than `orders.write`: opening the editor and changing
 * what is in it are different powers, and a department lead who reads orders
 * before they publish needs the first without the second. Everything inside
 * that writes re-checks its own capability server-side — this only decides
 * whether the shell renders at all.
 */
export default async function Layout({ children }: { children: React.ReactNode }) {
    try {
        const me = await client.fetchMe()
        if (!(await can(me, 'orders.view'))) redirect('/operations')
    } catch {
        redirect('/operations')
    }
    return <div className='h-full'>{children}</div>
}
