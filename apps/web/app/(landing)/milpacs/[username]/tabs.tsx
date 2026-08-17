import type { Route } from 'next'
import Link from 'next/link'
import { MILPAC_TABS, tabPath, type MilpacTab } from '@/lib/military/milpac-tabs'
import s from './profile.module.css'

/**
 * The file's section tabs, sitting on the rule under the hero's stat strip.
 *
 * Real links to real routes, not client state and not `?tab=`. Each section is
 * its own path (`/milpacs/koda/record`), which the server renders directly — so
 * there is no flash of the wrong section and the link is shareable.
 *
 * The path matters beyond tidiness: the App Router silently aborts navigations
 * that change only the query string, which made the old `?tab=` links take
 * several clicks to commit in production. See `lib/military/milpac-tabs.ts`.
 *
 * `scroll={false}` because the reader is already looking at the tabs — jumping
 * them to the top of the document on every switch would undo that.
 */
export function MilpacTabs({ active, basePath }: { active: MilpacTab; basePath: string }) {
    return (
        <nav className={s.tabs} aria-label='Personnel file sections'>
            {MILPAC_TABS.map(tab => (
                <Link
                    key={tab.key}
                    href={`${basePath}${tabPath(tab.key)}` as Route}
                    scroll={false}
                    aria-current={tab.key === active ? 'page' : undefined}
                    className={tab.key === active ? `${s.tab} ${s.tabOn}` : s.tab}
                >
                    {tab.label}
                </Link>
            ))}
        </nav>
    )
}
