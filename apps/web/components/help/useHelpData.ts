'use client'

import { useCallback, useEffect, useState } from 'react'
import type { HelpArticleView } from '@/lib/help/search'

export interface HelpViewerInfo {
    signedIn: boolean
    level: HelpAudience
    canSuggest: boolean
    canAsk: boolean
    canReview: boolean
}

export interface HelpData {
    viewer: HelpViewerInfo
    articles: HelpArticleView[]
}

/*
 * One fetch of `/api/help` shared by every consumer on the page (the launcher's
 * panel and `/help` can both be mounted), kept until something asks for a
 * reload — a sign-in, or a reviewer's save.
 */
let cache: HelpData | null = null
let inflight: Promise<HelpData> | null = null
const listeners = new Set<(d: HelpData) => void>()

function load(force = false): Promise<HelpData> {
    if (cache && !force) return Promise.resolve(cache)
    if (inflight && !force) return inflight
    inflight = fetch('/api/help', { cache: 'no-store' })
        .then(r => r.json())
        .then((d: HelpData) => {
            cache = d
            inflight = null
            listeners.forEach(fn => fn(d))
            return d
        })
        .catch(err => { inflight = null; throw err })
    return inflight
}

/** Ask every open help surface to fetch the wiki again. */
export function reloadHelp() { return load(true) }

export function useHelpData(enabled = true) {
    const [data, setData] = useState<HelpData | null>(cache)
    const [error, setError] = useState(false)

    useEffect(() => {
        if (!enabled) return
        listeners.add(setData)
        load().then(setData).catch(() => setError(true))
        return () => { listeners.delete(setData) }
    }, [enabled])

    const reload = useCallback(() => { setError(false); return load(true).catch(() => setError(true)) }, [])
    return { data, error, reload }
}

export interface HelpOpenDetail {
    /** Open this guide. */
    slug?: string
    tab?: 'guide' | 'ask' | 'suggest'
    /** Open the Suggest tab with this filled in. */
    suggest?: { kind: HelpSuggestionKind; slug?: string; body?: string }
}

/** Open the help panel from anywhere: `openHelp({ slug: 'rsvp-to-an-operation' })`. */
export function openHelp(detail: HelpOpenDetail = {}) {
    window.dispatchEvent(new CustomEvent('asot:help-open', { detail }))
}

/** Hand off to the guided walkthroughs (the tutorials feature listens for this). */
export function startTutorial(id: string) {
    window.dispatchEvent(new CustomEvent('asot:tutorial-start', { detail: { id } }))
}
