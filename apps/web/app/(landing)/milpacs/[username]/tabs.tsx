import { MILPAC_TABS, tabPath, type MilpacTab } from '@/lib/military/milpac-tabs'
import s from './profile.module.css'

/**
 * The file's section tabs, sitting on the rule under the hero's stat strip.
 *
 * **Plain `<a>` tags, not `next/link` — deliberately, and against the grain of
 * the rest of the app.** With `<Link>` these tabs commit one click behind:
 * clicking Service Record does nothing, and the *next* click on any tab paints
 * Service Record. The navigation completes and the router state updates; the
 * render is simply never flushed until another event schedules one.
 *
 * Measured on production, `<Link>` committed on the first click 11 times out of
 * 18. Ordinary full-document navigations committed 100% of the time across
 * every sample taken. So the tabs take the reliable path.
 *
 * Ruled out first, each deployed and measured: `?tab=` query params vs path
 * segments, the `loading.tsx` boundary, `prefetch`, `scroll={false}`, a broad
 * middleware matcher (that one was a real bug and stayed fixed, but moved the
 * failure rate only from ~1-in-3 to 11/18), the reverse proxy, the RSC payload,
 * CDN caching, latency, hydration errors and background re-render churn.
 *
 * The cost is a full page load per tab — about half a second — and the reader
 * lands back at the top of the hero. That is the trade being made knowingly: a
 * tab that always works beats one that keeps its scroll position two thirds of
 * the time. Root cause is still open upstream; if a Next upgrade fixes it,
 * these become `<Link>`s again and the sample gets re-run.
 */
export function MilpacTabs({ active, basePath }: { active: MilpacTab; basePath: string }) {
    return (
        <nav className={s.tabs} aria-label='Personnel file sections'>
            {MILPAC_TABS.map(tab => (
                <a
                    key={tab.key}
                    href={`${basePath}${tabPath(tab.key)}`}
                    aria-current={tab.key === active ? 'page' : undefined}
                    className={tab.key === active ? `${s.tab} ${s.tabOn}` : s.tab}
                >
                    {tab.label}
                </a>
            ))}
        </nav>
    )
}
