import type { Route } from 'next'
import Link from 'next/link'
import { MILPAC_TABS, type MilpacTab } from '@/lib/military/milpac-tabs'
import s from './profile.module.css'

/**
 * The file's section tabs, sitting on the rule under the hero's stat strip.
 *
 * Real links, not client state. The server renders the requested tab, so there
 * is no flash of the wrong section and a link to `?tab=kit` works when pasted
 * into Discord. It also buys the entrance stagger for free: a soft navigation
 * remounts the panels, so their `.rise` animation replays and each tab lays
 * itself out rather than appearing all at once.
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
                    href={`${basePath}?tab=${tab.key}` as Route}
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
