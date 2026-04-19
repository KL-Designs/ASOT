import client from '@/lib/discord'
import { Metadata } from 'next'
import { connection } from 'next/server'
import { redirect } from 'next/navigation'


export const metadata: Metadata = {
    title: 'Feedback | Australian Special Operations Taskforce',
}


export default async function Layout({ children }: { children: React.ReactNode }) {
    await connection()

    await client.fetchMe().catch(() => redirect('/login'))

    return (
        <div className='h-full w-full p-6 md:p-8'>
            <div className='w-full max-w-screen-2xl mx-auto'>
                {children}
            </div>
        </div>
    )
}
