import type { Metadata } from 'next'
import HelpWikiPage from '@/components/help/HelpWikiPage'
import { BUILT_IN_ARTICLES } from '@/lib/help/articles'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
    const { slug } = await params
    // Only a built-in public guide's title goes in the tab title: the page
    // itself decides on the client what this reader may see.
    const seed = BUILT_IN_ARTICLES.find(a => a._id === slug && a.audience === 'public')
    return { title: `${seed ? seed.title : 'Help & guides'} | Australian Special Operations Taskforce` }
}

/** `/help/[slug]` — one guide, linkable. Signed-out readers only see public guides. */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    return <HelpWikiPage slug={slug} />
}
