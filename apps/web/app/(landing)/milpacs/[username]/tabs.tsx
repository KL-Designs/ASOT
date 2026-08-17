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
 * `scroll={false}` used to be set here so the reader stayed put, but it is under
 * suspicion for the tabs committing one click late and is off while that is
 * measured — a tab that needs two clicks is worse than one that scrolls.
 */
export function MilpacTabs({ active, basePath }: { active: MilpacTab; basePath: string }) {
    return (
        <nav className={s.tabs} aria-label='Personnel file sections'>
            {MILPAC_TABS.map(tab => (
                <Link
                    key={tab.key}
                    href={`${basePath}${tabPath(tab.key)}` as Route}
                    // `scroll={false}` was here to keep the reader in place, but it
                    // is the only non-default prop on these links and it hooks the
                    // router's commit path — and the tabs commit one click late, as
                    // though the render is never flushed until the next event.
                    // Removed while that is under test; the scroll reset is the
                    // lesser evil against a tab that needs clicking twice.
                    // Prefetch off, deliberately. With it on, the click issues a
                    // second request for a URL already being prefetched, and that
                    // one is aborted — the payload lands in cache but the
                    // navigation never applies, so the first click appears to do
                    // nothing and the second commits instantly. The page renders
                    // in 0.3-0.5s, so there is little to gain from prefetching it.
                    prefetch={false}
                    aria-current={tab.key === active ? 'page' : undefined}
                    className={tab.key === active ? `${s.tab} ${s.tabOn}` : s.tab}
                >
                    {tab.label}
                </Link>
            ))}
        </nav>
    )
}
