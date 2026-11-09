'use client'

import { createContext, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Tutorial, TutorialContext } from '@/lib/tutorial/types'
import { getTutorial, TUTORIAL_START_EVENT } from '@/lib/tutorial/registry'
import { installSandbox, uninstallSandbox, realFetch } from '@/lib/tutorial/sandbox'
import { pathMatches, resolvePath } from '@/lib/tutorial/paths'
import TutorialOverlay from './TutorialOverlay'

/**
 * Runs guided tutorials site-wide. Mounted once in the root layout.
 *
 * Starting a tutorial raises the sandbox (lib/tutorial/sandbox.ts), so from
 * that moment no change the member makes reaches the server. Ending one,
 * finished or quit, takes the sandbox down and reloads the page, which throws
 * away every practice record and practice edit still held in component state.
 *
 * Three ways in: `useTutorials().start(id)` (the Tutorial button), a
 * `?tutorial=<id>` query param, and a window `asot:tutorial-start` event with
 * `detail: { id }` (both used by the help wiki).
 */

export interface TutorialRun {
    tutorial: Tutorial
    ctx: TutorialContext
    step: number
}

interface TutorialApi {
    run: TutorialRun | null
    start: (id: string) => void
    /** Tutorial id -> ISO time last finished. Empty until loaded. */
    completed: Record<string, string>
    loadProgress: () => void
}

const Ctx = createContext<TutorialApi>({ run: null, start: () => {}, completed: {}, loadProgress: () => {} })

export function useTutorials() {
    return useContext(Ctx)
}

interface Progress { userId?: string; completed: Record<string, string> }

export default function TutorialProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter()
    const [run, setRun] = useState<TutorialRun | null>(null)
    const [progress, setProgress] = useState<Progress | null>(null)
    const activeId = useRef<string | null>(null)
    const progressReq = useRef<Promise<Progress> | null>(null)

    const fetchProgress = useCallback(() => {
        if (!progressReq.current) {
            progressReq.current = realFetch('/api/tutorials/progress')
                .then(r => r.ok ? r.json() : { completed: {} })
                .catch(() => ({ completed: {} }))
                .then((p: Progress) => { setProgress(p); return p })
        }
        return progressReq.current
    }, [])

    const start = useCallback(async (id: string) => {
        const tutorial = getTutorial(id)
        // A second trigger for the one already running (the wiki fires the event and the URL param together).
        if (!tutorial || activeId.current === id) return
        if (activeId.current) uninstallSandbox()
        activeId.current = id

        const p = await fetchProgress()
        const ctx: TutorialContext = { startedFrom: window.location.pathname, userId: p.userId }
        installSandbox(tutorial.sandbox?.(ctx) ?? [])
        setRun({ tutorial, ctx, step: 0 })

        const startAt = resolvePath(tutorial.startPath, ctx)
        if (!pathMatches(window.location, startAt)) router.push(startAt as any)
    }, [fetchProgress, router])

    const finish = useCallback(async (completed: boolean) => {
        const current = run
        if (completed && current) {
            await realFetch('/api/tutorials/progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tutorialId: current.tutorial.id }),
            }).catch(() => null)
        }
        uninstallSandbox()
        activeId.current = null
        setRun(null)
        // Drop the practice state every component on the page may be holding.
        const url = new URL(window.location.href)
        url.searchParams.delete('tutorial')
        window.location.replace(url.toString())
    }, [run])

    const goTo = useCallback((step: number) => {
        setRun(r => {
            if (!r) return r
            if (step < 0) return r
            return { ...r, step: Math.min(step, r.tutorial.steps.length - 1) }
        })
    }, [])

    // The help wiki's event trigger.
    useEffect(() => {
        const onStart = (e: Event) => {
            const id = (e as CustomEvent<{ id?: string }>).detail?.id
            if (typeof id === 'string') start(id)
        }
        window.addEventListener(TUTORIAL_START_EVENT, onStart)
        return () => window.removeEventListener(TUTORIAL_START_EVENT, onStart)
    }, [start])

    // Never leave the sandbox up behind an unmounted provider.
    useEffect(() => () => uninstallSandbox(), [])

    const api = useMemo<TutorialApi>(() => ({
        run,
        start: id => { void start(id) },
        completed: progress?.completed ?? {},
        loadProgress: () => { void fetchProgress() },
    }), [run, start, progress, fetchProgress])

    return (
        <Ctx.Provider value={api}>
            {children}
            <Suspense fallback={null}>
                <UrlTrigger onStart={id => { void start(id) }} />
            </Suspense>
            {run && (
                <TutorialOverlay
                    key={`${run.tutorial.id}:${run.step}`}
                    run={run}
                    onNext={() => run.step >= run.tutorial.steps.length - 1 ? finish(true) : goTo(run.step + 1)}
                    onBack={() => goTo(run.step - 1)}
                    onQuit={() => finish(false)}
                    navigate={path => router.push(path as any)}
                />
            )}
        </Ctx.Provider>
    )
}

/** `?tutorial=<id>`. In its own Suspense boundary because useSearchParams needs one in the root layout. */
function UrlTrigger({ onStart }: { onStart: (id: string) => void }) {
    const params = useSearchParams()
    const id = params.get('tutorial')
    useEffect(() => {
        if (id) onStart(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per id, not per render of the callback
    }, [id])
    return null
}
