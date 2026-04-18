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
        <div className='h-full w-full p-8 md:p-10 flex flex-col justify-center'>
            <div className='w-full max-w-5xl mx-auto'>
                {children}
            </div>
        </div>
    )
}
